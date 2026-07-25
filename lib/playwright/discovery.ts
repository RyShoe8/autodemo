import type { Browser, Locator, Page } from "playwright";
import { storage } from "@/lib/storage";
import { isBlobStorageError } from "@/lib/storage/blob-utils";
import {
  AUTH_ROUTE_PATTERN,
  navigateAndWait,
  resolveLoginPage,
  waitForAppReady,
} from "@/lib/playwright/spa";
import { dismissOverlays } from "@/lib/playwright/overlays";
import { fetchAndStoreSiteLogo } from "@/lib/playwright/favicon";
import { browserEval } from "@/lib/playwright/browser-eval/run";
import { launchChromium } from "@/lib/playwright/browser";
import {
  CrawlFrontier,
  EdgeCollector,
  actionSlug,
  normalizeRoute,
  routeSlug,
} from "@/lib/playwright/crawler";
import {
  VERIFICATION_FAILURE_TEXT,
  detectBotProtection,
  dumpLoginEvidence,
  watchLoginNetwork,
  type LoginNetworkWatcher,
} from "@/lib/playwright/login-verify";
import {
  persistContextSession,
  type StorageState,
} from "@/lib/playwright/session";
import type { ApplicationMap, DiscoveredPage, InteractiveElement } from "@/types";
import { flags } from "@/lib/env";
import {
  MUTATION_RISK_PATTERN,
  resolvePageExploreAction,
} from "@/lib/openai/discovery-agent";
import type { Reporter as PipelineReporter } from "@/lib/workflow/context";

export interface DiscoverOptions {
  projectId: string;
  /** Owning organization — scopes the encryption key used for saved sessions. */
  orgId: string;
  url: string;
  email: string;
  password: string;
  reporter: PipelineReporter;
  maxPages?: number;
  /** Skip favicon fetch when the project already has a user-uploaded logo. */
  existingLogoUrl?: string;
  /** Stored authenticated session to reuse (skips login when still valid). */
  storageState?: StorageState | null;
  /** Max AI overlay-exploration actions per page (0 disables). */
  explorePerPage?: number;
  /** Called with the partial map after each captured page (incremental saves). */
  onPartial?: (map: ApplicationMap) => Promise<void>;
}

const NAV_SELECTORS = [
  "nav a",
  "header a",
  "[role=navigation] a",
  "aside a",
  ".sidebar a",
];

/** Elements that lead into third-party auth, registration, or password-reset flows. */
export const AUTH_FLOW_ELEMENT_PATTERN =
  /continue with|sign in with|google|apple|microsoft|github|\bsso\b|register|sign ?up|create account|forgot password|reset password/i;

const EMAIL_FIELD_SELECTORS = [
  'input[type="email"]',
  'input[autocomplete="username"]',
  'input[name="email"]',
  'input[name="username"]',
  'input[type="text"]',
];

async function hasVisiblePasswordField(page: Page): Promise<boolean> {
  if ((await page.locator('input[type="password"]:visible').count()) > 0) {
    return true;
  }
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    if ((await frame.locator('input[type="password"]:visible').count()) > 0) {
      return true;
    }
  }
  return false;
}

async function hasLoggedOutSignals(page: Page): Promise<boolean> {
  const loginLink = page.getByRole("link", { name: /log in|sign in|login|signin/i });
  if ((await loginLink.count()) > 0 && await loginLink.first().isVisible().catch(() => false)) return true;
  
  const registerLink = page.getByRole("link", { name: /register|sign up|signup|get started/i });
  if ((await registerLink.count()) > 0 && await registerLink.first().isVisible().catch(() => false)) return true;

  return false;
}

async function hasLoggedInSignals(page: Page): Promise<boolean> {
  const userMenu = page.getByRole("button", {
    name: /account|profile|logout|sign out|log out|my account/i,
  });
  if ((await userMenu.count()) > 0) return true;

  const logoutLink = page.getByRole("link", {
    name: /logout|sign out|log out/i,
  });
  return (await logoutLink.count()) > 0;
}

async function hasAppNavShell(page: Page): Promise<boolean> {
  const navCount = await page
    .locator('nav a, header a, [role="navigation"] a, aside a')
    .count();
  if (navCount >= 3) return true;

  const appLink = page.getByRole("link", {
    name: /workspace|dashboard|home|projects/i,
  });
  return (await appLink.count()) > 0;
}

export async function verifyAuthenticated(
  page: Page,
  origin: string,
): Promise<{ ok: boolean; reason: string }> {
  if (await hasLoggedOutSignals(page)) {
    return { ok: false, reason: "logged-out UI signals detected (e.g. Login link visible)" };
  }

  const visiblePassword = await hasVisiblePasswordField(page);
  if (!visiblePassword && (await hasAppNavShell(page))) {
    return { ok: true, reason: "app nav visible without login form" };
  }
  if (!visiblePassword && (await hasLoggedInSignals(page))) {
    return { ok: true, reason: "logged-in UI signals detected" };
  }

  const probeUrls = [origin, `${origin}/workspace`, `${origin}/dashboard`];
  for (const probeUrl of probeUrls) {
    try {
      await page.goto(probeUrl, { waitUntil: "load", timeout: 15000 });
      await waitForAppReady(page);
      const pathname = new URL(page.url()).pathname;
      const onAuthRoute = AUTH_ROUTE_PATTERN.test(pathname);
      const hasVisiblePassword = await hasVisiblePasswordField(page);
      if (await hasLoggedOutSignals(page)) continue;

      if (!onAuthRoute && !hasVisiblePassword) {
        return { ok: true, reason: `probe navigated to ${page.url()}` };
      }
      if (!hasVisiblePassword && (await hasAppNavShell(page))) {
        return { ok: true, reason: `probe at ${page.url()} shows app shell` };
      }
    } catch {
      /* try next probe URL */
    }
  }

  return { ok: false, reason: "probe did not reach authenticated view" };
}

async function logLoginFailureState(
  page: Page,
  reporter: PipelineReporter,
): Promise<void> {
  let pathname = page.url();
  try {
    pathname = new URL(page.url()).pathname;
  } catch {
    /* keep url */
  }
  const visiblePassword = await hasVisiblePasswordField(page);
  const navCount = await page
    .locator("nav a, header a, aside a, [role=navigation] a")
    .count();
  await reporter.log(
    `Login diagnostics — path: ${pathname}, visible password: ${visiblePassword}, nav links: ${navCount}.`,
  );
}

const LOGIN_ERROR_SELECTOR =
  '[role="alert"]:visible, .error:visible, .alert-error:visible, .text-destructive:visible';
const LOGIN_ERROR_TEXT = /invalid|incorrect|wrong password|failed|no account|not found/i;

/** Collect visible error texts matching login-failure wording, scoped to the login form when possible. */
async function collectLoginErrorTexts(
  page: Page,
  formScope?: Locator,
): Promise<string[]> {
  const scope = formScope ?? page.locator("body");
  try {
    const errors = scope.locator(LOGIN_ERROR_SELECTOR).filter({
      hasText: LOGIN_ERROR_TEXT,
    });
    const count = await errors.count();
    const texts: string[] = [];
    for (let i = 0; i < Math.min(count, 5); i++) {
      const text = await errors
        .nth(i)
        .innerText()
        .catch(() => "");
      const trimmed = text.trim().slice(0, 120);
      if (trimmed) texts.push(trimmed);
    }
    return texts;
  } catch {
    return [];
  }
}

async function waitForLoginResult(
  page: Page,
  origin: string,
  preSubmitErrors: string[],
  reporter?: PipelineReporter,
  watcher?: LoginNetworkWatcher,
): Promise<boolean> {
  const deadline = Date.now() + 12000;
  const knownErrors = new Set(preSubmitErrors);
  let pendingError: string | null = null;

  while (Date.now() < deadline) {
    // Network truth first: the auth endpoint's status code beats DOM guesses.
    const netVerdict = watcher?.verdict() ?? "unknown";
    if (netVerdict === "failure") {
      await reporter?.log(
        `Login rejected by server (${watcher!.detail()}).`,
      );
      return false;
    }

    const currentUrl = page.url();
    let pathname = currentUrl;
    try {
      pathname = new URL(currentUrl).pathname;
    } catch {
      /* keep url */
    }

    const onAuthRoute = AUTH_ROUTE_PATTERN.test(pathname);
    const hasPassword = await hasVisiblePasswordField(page);
    const loggedIn = await hasLoggedInSignals(page);

    if (netVerdict === "success" && !hasPassword) {
      await reporter?.log(
        `Login confirmed by network (${watcher!.detail()}).`,
      );
      return true;
    }

    const currentErrors = await collectLoginErrorTexts(page);
    const newError = currentErrors.find((t) => !knownErrors.has(t)) ?? null;

    if (newError) {
      if (pendingError === newError) {
        await reporter?.log(`Login error detected: "${newError}".`);
        return false;
      }
      pendingError = newError;
      await page.waitForTimeout(1000);
      continue;
    }
    pendingError = null;

    if (loggedIn) return true;
    if (!hasPassword && (await hasAppNavShell(page))) return true;
    if (!onAuthRoute && !hasPassword && !(await hasLoggedOutSignals(page))) {
      return true;
    }

    await page.waitForTimeout(500);
  }

  if (watcher?.verdict() === "success") {
    await reporter?.log(
      `Login confirmed by network at deadline (${watcher.detail()}).`,
    );
    return true;
  }

  const probe = await verifyAuthenticated(page, origin);
  return probe.ok;
}

interface LoginFields {
  emailField: ReturnType<Page["locator"]>;
  passwordField: ReturnType<Page["locator"]>;
  inIframe: boolean;
}

async function findVisibleEmailField(
  scope: Page | import("playwright").Frame,
  passwordField: import("playwright").Locator
): Promise<ReturnType<Page["locator"]> | null> {
  const form = passwordField.locator('xpath=ancestor::form').first();
  const searchScope = (await form.count().catch(() => 0)) > 0 ? form : scope;

  for (const sel of EMAIL_FIELD_SELECTORS) {
    const field = searchScope.locator(sel).first();
    if (await field.isVisible().catch(() => false)) {
      return field as ReturnType<Page["locator"]>;
    }
  }
  return null;
}

async function findLoginFields(page: Page): Promise<LoginFields | null> {
  const mainPassword = page.locator('input[type="password"]:visible').first();
  if ((await mainPassword.count()) > 0) {
    const emailField =
      (await findVisibleEmailField(page, mainPassword)) ??
      page.locator(EMAIL_FIELD_SELECTORS.join(", ")).first();
    return { emailField, passwordField: mainPassword, inIframe: false };
  }

  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    const framePassword = frame.locator('input[type="password"]:visible').first();
    if ((await framePassword.count()) > 0) {
      const emailField =
        (await findVisibleEmailField(frame, framePassword)) ??
        frame.locator(EMAIL_FIELD_SELECTORS.join(", ")).first();
      return {
        emailField: emailField as ReturnType<Page["locator"]>,
        passwordField: framePassword as ReturnType<Page["locator"]>,
        inIframe: true,
      };
    }
  }

  return null;
}

/** Exact-ish sign-in button label — must not match "Continue with Google" or "Don't have an account? Register". */
const SIGN_IN_BUTTON_EXACT = /^\s*(sign in|log in|login|signin|submit)\s*$/i;

/**
 * First visible submit control in scope whose label is not an OAuth/register/
 * reset action ("Continue with Google" is type="submit" on some sites).
 */
async function firstSafeSubmitButton(scope: Locator): Promise<Locator | null> {
  const candidates = scope.locator(
    'button[type="submit"]:visible, input[type="submit"]:visible',
  );
  const count = await candidates.count().catch(() => 0);
  for (let i = 0; i < Math.min(count, 6); i++) {
    const btn = candidates.nth(i);
    const label = (
      (await btn.innerText().catch(() => "")) ||
      (await btn.getAttribute("value").catch(() => null)) ||
      (await btn.getAttribute("aria-label").catch(() => null)) ||
      ""
    ).trim();
    if (label && AUTH_FLOW_ELEMENT_PATTERN.test(label)) continue;
    if (await btn.isVisible().catch(() => false)) return btn;
  }
  return null;
}

async function submitLoginForm(page: Page, fields: LoginFields): Promise<void> {
  const form = fields.passwordField.locator("xpath=ancestor::form").first();
  const hasForm = (await form.count().catch(() => 0)) > 0;

  // 1. Prefer the real submit button (form-scoped first, then global),
  //    skipping any OAuth/register-labelled submit controls.
  const submitScopes = hasForm ? [form, page.locator("body")] : [page.locator("body")];
  for (const scope of submitScopes) {
    const submitBtn = await firstSafeSubmitButton(scope);
    if (submitBtn) {
      await submitBtn.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1000);
      await waitForAppReady(page);
      return;
    }
  }

  // 2. Exact-label sign-in button (never matches OAuth/register labels).
  const signInBtn = page
    .getByRole("button", { name: SIGN_IN_BUTTON_EXACT })
    .first();
  if (
    (await signInBtn.count()) > 0 &&
    (await signInBtn.isVisible().catch(() => false))
  ) {
    await signInBtn.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1000);
    await waitForAppReady(page);
    return;
  }

  // 3. Fallback: Enter on the password field (blur/focus first for React forms).
  await fields.passwordField.blur().catch(() => {});
  await fields.passwordField.focus().catch(() => {});
  await fields.passwordField.press("Enter").catch(() => {});
  await page.waitForTimeout(1000);
  await waitForAppReady(page);
}

/** Attempt to detect and complete a login form on the current page. */
export async function login(
  page: Page,
  email: string,
  password: string,
  reporter: PipelineReporter,
  options?: { projectId?: string },
): Promise<boolean> {
  if (!password) {
    await reporter.missing("target application password");
    return false;
  }
  let watcher: LoginNetworkWatcher | null = null;
  try {
    const origin = new URL(page.url()).origin;
    const found = await resolveLoginPage(page, origin, reporter);
    if (!found) {
      await reporter.log("No login form detected — continuing unauthenticated.");
      return false;
    }

    await dismissOverlays(page);

    const fields = await findLoginFields(page);
    if (!fields) {
      await reporter.log("No login fields found — continuing unauthenticated.");
      return false;
    }

    if (fields.inIframe) {
      await reporter.log("Login form detected inside iframe.");
    }

    watcher = watchLoginNetwork(page, origin);

    if ((await fields.emailField.count()) > 0 && email) {
      await fields.emailField.click({ force: true }).catch(() => {});
      await fields.emailField.fill("");
      await fields.emailField.pressSequentially(email, { delay: 50 }).catch(() => {});
    }
    await fields.passwordField.click({ force: true }).catch(() => {});
    await fields.passwordField.fill("");
    await fields.passwordField.pressSequentially(password, { delay: 50 }).catch(() => {});

    const preSubmitErrors = await collectLoginErrorTexts(page);
    await reporter.log("Submitting login form…");
    watcher.markSubmit();
    await submitLoginForm(page, fields);

    let success = await waitForLoginResult(
      page,
      origin,
      preSubmitErrors,
      reporter,
      watcher,
    );
    if (!success) {
      await reporter.log("Login may have failed — retrying once…");
      await waitForAppReady(page);
      const retryFields = await findLoginFields(page);
      if (retryFields) {
        if ((await retryFields.emailField.count()) > 0 && email) {
          await retryFields.emailField.fill(email);
        }
        await retryFields.passwordField.fill(password);
        const retryPreErrors = await collectLoginErrorTexts(page);
        watcher.markSubmit();
        await submitLoginForm(page, retryFields);
        success = await waitForLoginResult(
          page,
          origin,
          retryPreErrors,
          reporter,
          watcher,
        );
      }
    }

    if (success) {
      await reporter.log(`Login succeeded (now at ${page.url()}).`);
      return true;
    }

    const probe = await verifyAuthenticated(page, origin);
    if (probe.ok) {
      await reporter.log(
        `Login verified via navigation probe (SPA): ${probe.reason}.`,
      );
      return true;
    }

    await logLoginFailureState(page, reporter);
    await reporter.log(`Probe result: ${probe.reason}.`);
    await reporter.log(`Network: ${watcher.detail()}.`);

    const failureBody = watcher.failureBody();
    if (failureBody) {
      await reporter.log(`Server response: ${failureBody}`);
    }

    // Distinguish "wrong password" from "the app blocked the robot", which no
    // amount of form-filling can fix.
    const botProtection = await detectBotProtection(page);
    const verificationRejected = VERIFICATION_FAILURE_TEXT.test(failureBody);
    if (botProtection.present || verificationRejected) {
      const kind = botProtection.kind || "CAPTCHA/bot protection";
      await reporter.log(
        `${kind} detected on the login page — the server rejected the automated browser before checking the credentials.`,
      );
      await reporter.log(
        `Fix: capture a session in a real browser (npm run capture-session -- ${origin}) and import it on the project's Edit page under "Browser session". Alternatively, allowlist the worker on the target app.`,
      );
      await reporter.missing(`${kind} on target login (import a browser session)`);
    }

    if (options?.projectId) {
      await dumpLoginEvidence(page, options.projectId, watcher, reporter);
    }

    await reporter.log(
      `Login failed — still on auth page (${page.url()}). Recording may show unauthenticated views.`,
    );
    return false;
  } catch (err) {
    await reporter.log(
      `Login attempt failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  } finally {
    watcher?.stop();
  }
}

interface NavLink {
  label: string;
  href: string;
}

/** Collect primary navigation link labels + hrefs from the current page. */
export async function crawlNavigation(
  page: Page,
  origin: string,
  reporter?: PipelineReporter,
): Promise<NavLink[]> {
  await waitForAppReady(page);

  const primary = await browserEval<NavLink[]>(
    page,
    "crawl-primary.fn.js",
    NAV_SELECTORS,
  );

  if (primary.length >= 3) {
    await reporter?.log(
      `Navigation: ${primary.length} links from primary selectors.`,
    );
    return primary.slice(0, 12);
  }

  const fallback = await browserEval<
    (NavLink & { score: number; isAuth: boolean })[]
  >(page, "crawl-fallback.fn.js", origin);

  const seen = new Set(primary.map((l) => l.href));
  const merged: NavLink[] = [...primary];
  for (const link of fallback) {
    if (seen.has(link.href)) continue;
    seen.add(link.href);
    merged.push({ label: link.label, href: link.href });
  }

  const nonAuth = merged.filter((l) => !AUTH_ROUTE_PATTERN.test(l.href));
  const result = (nonAuth.length > 0 ? nonAuth : merged).slice(0, 12);

  await reporter?.log(
    `Navigation: ${primary.length} primary, ${fallback.length} fallback, ${result.length} used.`,
  );
  return result;
}

/**
 * Capture full-page + viewport screenshots with stable, route-derived storage
 * keys so re-runs and recapture jobs overwrite instead of accumulating.
 */
export async function capturePageScreenshots(
  page: Page,
  projectId: string,
  routePattern: string,
): Promise<{ fullUrl: string; viewportUrl: string }> {
  const slug = routeSlug(routePattern);
  const fullBuffer = await page.screenshot({
    fullPage: true,
    type: "jpeg",
    quality: 80,
  });
  const { url: fullUrl } = await storage.save(
    `projects/${projectId}/discovery/pages/${slug}/full.jpg`,
    fullBuffer,
    "image/jpeg",
  );
  const viewportBuffer = await page.screenshot({
    fullPage: false,
    type: "jpeg",
    quality: 80,
  });
  const { url: viewportUrl } = await storage.save(
    `projects/${projectId}/discovery/pages/${slug}/viewport.jpg`,
    viewportBuffer,
    "image/jpeg",
  );
  return { fullUrl, viewportUrl };
}

/** Extract visible interactive controls from the current page. */
export async function extractInteractives(
  page: Page,
): Promise<InteractiveElement[]> {
  return browserEval<InteractiveElement[]>(
    page,
    "extract-interactives.fn.js",
  );
}

/** Extract trimmed visible text from the current page. */
export async function extractVisibleText(page: Page): Promise<string[]> {
  return browserEval<string[]>(page, "extract-visible-text.fn.js");
}

function discoveryFailureHint(err: unknown, detail: string): string {
  if (isBlobStorageError(err)) {
    return "Check BLOB_READ_WRITE_TOKEN and BLOB_ACCESS match your Vercel Blob store.";
  }
  if (
    detail.includes("__name is not defined") ||
    detail.includes("page.evaluate")
  ) {
    return "An internal browser-script error occurred during discovery. Redeploy the latest worker build.";
  }
  if (/launch|executable|playwright install|browserType/i.test(detail)) {
    return "Deploy the standalone worker with Playwright (Dockerfile or npx playwright install chromium).";
  }
  return "Ensure the target URL is reachable from the worker network.";
}


interface CrawlLink {
  label: string;
  href: string;
  score: number;
  isAuth: boolean;
}

/** Deterministic overlay capture for runs without OpenAI: click obvious
 * "New / Add / Filter"-style triggers and screenshot the revealed UI. */
async function captureDeterministicOverlays(args: {
  page: Page;
  projectId: string;
  routePattern: string;
  pageRef: DiscoveredPage;
  reporter: PipelineReporter;
}): Promise<void> {
  const { page, projectId, routePattern, pageRef, reporter } = args;
  const slug = routeSlug(routePattern);
  const baseUrl = pageRef.url;

  const interactives = await extractInteractives(page);
  const triggers = interactives
    .filter((i) => {
      if (i.role !== "button" && i.tag.toLowerCase() !== "button") return false;
      if (AUTH_FLOW_ELEMENT_PATTERN.test(i.name)) return false;
      if (MUTATION_RISK_PATTERN.test(i.name)) return false;
      return /add|new|create|edit|settings|menu|filter|options/i.test(i.name);
    })
    .slice(0, 3);

  for (const trigger of triggers) {
    try {
      const el = page
        .getByRole("button", { name: trigger.name, exact: false })
        .first();
      if (!(await el.isVisible().catch(() => false))) continue;
      await el.click({ timeout: 2000 });
      await page.waitForTimeout(800);

      if (normalizeRoute(page.url()) === routePattern) {
        const buffer = await page.screenshot({
          fullPage: false,
          type: "jpeg",
          quality: 80,
        });
        const { url } = await storage.save(
          `projects/${projectId}/discovery/pages/${slug}/action-${actionSlug(trigger.name)}.jpg`,
          buffer,
          "image/jpeg",
        );
        pageRef.actionScreenshots!.push({
          type: "modal",
          triggerText: trigger.name,
          screenshot: url,
        });
        await reporter.log(`Captured overlay "${trigger.name}" on ${routePattern}.`);
      }

      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(300);
      if (normalizeRoute(page.url()) !== routePattern) {
        await page.goto(baseUrl, { waitUntil: "load", timeout: 30000 }).catch(() => {});
        await waitForAppReady(page);
      }
    } catch {
      /* continue with next trigger */
    }
  }
}

/** AI-guided, observe-only overlay exploration for a single crawled page. */
async function explorePageOverlays(args: {
  page: Page;
  projectId: string;
  routePattern: string;
  pageRef: DiscoveredPage;
  frontier: CrawlFrontier;
  edges: EdgeCollector;
  reporter: PipelineReporter;
  maxActions: number;
}): Promise<void> {
  const { page, projectId, routePattern, pageRef, frontier, edges, reporter } =
    args;
  const slug = routeSlug(routePattern);
  const baseUrl = pageRef.url;
  const explored: string[] = [];

  for (let i = 0; i < args.maxActions; i++) {
    const interactives = (await extractInteractives(page)).filter(
      (el) =>
        !AUTH_FLOW_ELEMENT_PATTERN.test(el.name) &&
        !MUTATION_RISK_PATTERN.test(el.name),
    );
    if (interactives.length === 0) return;

    let screenshotBase64: string | undefined;
    try {
      screenshotBase64 = (
        await page.screenshot({ fullPage: false, type: "jpeg", quality: 60 })
      ).toString("base64");
    } catch {
      /* explore without vision */
    }

    const action = await resolvePageExploreAction({
      url: page.url(),
      routePattern,
      interactives,
      explored,
      screenshotBase64,
    });
    if (!action || action.action !== "click" || !action.name || !action.role) {
      if (action?.reason) {
        await reporter.log(`Exploration of ${routePattern} done: ${action.reason}`);
      }
      return;
    }
    explored.push(action.name);

    try {
      const loc = page
        .getByRole(action.role as Parameters<Page["getByRole"]>[0], {
          name: action.name,
          exact: false,
        })
        .first();
      if (!(await loc.isVisible().catch(() => false))) continue;
      await loc.click({ timeout: 3000 });
      await page.waitForTimeout(800);
      await waitForAppReady(page);
    } catch {
      continue;
    }

    const currentUrl = page.url();
    let sameRoute = false;
    try {
      sameRoute =
        new URL(currentUrl).origin === new URL(baseUrl).origin &&
        normalizeRoute(currentUrl) === routePattern;
    } catch {
      sameRoute = false;
    }

    if (!sameRoute) {
      // The click navigated: record the edge, queue the target, reset.
      try {
        if (new URL(currentUrl).origin === new URL(baseUrl).origin) {
          const targetPattern = normalizeRoute(currentUrl);
          edges.add(routePattern, targetPattern, action.name);
          frontier.add(currentUrl, action.name, routePattern);
          await reporter.log(
            `"${action.name}" navigated to ${targetPattern} — queued for crawl.`,
          );
        } else {
          await reporter.log(
            `"${action.name}" left the app origin — returning.`,
          );
        }
      } catch {
        /* unparseable URL */
      }
      await page.goto(baseUrl, { waitUntil: "load", timeout: 30000 }).catch(() => {});
      await waitForAppReady(page);
      continue;
    }

    // Same route: an overlay/modal/menu opened — capture it.
    try {
      const buffer = await page.screenshot({
        fullPage: false,
        type: "jpeg",
        quality: 80,
      });
      const { url: shotUrl } = await storage.save(
        `projects/${projectId}/discovery/pages/${slug}/action-${actionSlug(action.name)}.jpg`,
        buffer,
        "image/jpeg",
      );
      pageRef.actionScreenshots!.push({
        type: "modal",
        triggerText: action.name,
        screenshot: shotUrl,
      });
      await reporter.log(`Captured overlay "${action.name}" on ${routePattern}.`);
    } catch {
      /* non-fatal */
    }

    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(400);
    if (normalizeRoute(page.url()) !== routePattern) {
      await page.goto(baseUrl, { waitUntil: "load", timeout: 30000 }).catch(() => {});
      await waitForAppReady(page);
    }
  }
}

/**
 * Build the application map: reuse or establish an authenticated session, then
 * BFS-crawl same-origin routes (deduped by normalized route pattern), capture
 * screenshots + interactive elements per page, explore overlays, and record
 * the navigation graph. Saves partial progress after every page.
 */
export async function discoverApplication(
  opts: DiscoverOptions,
): Promise<ApplicationMap> {
  const { reporter, projectId, orgId, url, email, password } = opts;
  const maxPages = Math.max(3, Math.min(100, opts.maxPages ?? 30));
  const origin = new URL(url).origin;

  let browser: Browser | null = null;
  try {
    await reporter.log("Launching headless browser…");
    browser = await launchChromium();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
      ...(opts.storageState ? { storageState: opts.storageState } : {}),
    });
    const page = await context.newPage();

    await reporter.log(`Navigating to ${url}`);
    await navigateAndWait(page, url);

    // 1. Establish an authenticated session (stored session first).
    let loggedIn = false;
    if (opts.storageState) {
      const probe = await verifyAuthenticated(page, origin);
      if (probe.ok) {
        loggedIn = true;
        await reporter.log(`Reusing stored session (${probe.reason}).`);
      } else {
        await reporter.log(
          "Stored session no longer authenticated — attempting fresh login.",
        );
        await navigateAndWait(page, url);
      }
    }
    if (!loggedIn) {
      loggedIn = await login(page, email, password, reporter, { projectId });
      if (!loggedIn) {
        const probe = await verifyAuthenticated(page, origin);
        if (probe.ok) {
          await reporter.log(
            `Login verified via navigation probe (SPA): ${probe.reason}.`,
          );
          loggedIn = true;
        } else {
          await reporter.log(
            `Warning: discovery may be unauthenticated — ${probe.reason}.`,
          );
        }
      }
      if (loggedIn) {
        await persistContextSession(projectId, orgId, context, reporter);
      }
    }

    // Credentials were configured but we are not authenticated: crawling now
    // would map the public marketing site and pass it off as the product.
    // Fail loudly instead of producing a map that poisons every later step.
    if (!loggedIn && password) {
      throw new Error(
        "Could not authenticate to the target application, so discovery would only map public pages. " +
          "See the login diagnostics above and the saved login evidence. " +
          "If the app uses a CAPTCHA, MFA, or SSO, import a browser session on the project's Edit page.",
      );
    }
    if (!loggedIn) {
      await reporter.log(
        "No credentials configured — mapping publicly reachable pages only.",
      );
    }

    await waitForAppReady(page);

    // 2. Crawl.
    const pages: DiscoveredPage[] = [];
    const screenshots: string[] = [];
    const uiText = new Set<string>();
    const interactivesMap = new Map<string, InteractiveElement>();
    const frontier = new CrawlFrontier(origin);
    const edgeCollector = new EdgeCollector();
    const canonicalUrl = new Map<string, string>();

    const explorePerPage =
      opts.explorePerPage ?? (flags.hasOpenAI && loggedIn ? 3 : 0);

    const navLinks = await crawlNavigation(page, origin, reporter);
    await reporter.log(`Found ${navLinks.length} navigation links.`);

    const appHomeUrl = page.url();
    const homePattern = normalizeRoute(appHomeUrl);
    frontier.add(appHomeUrl, "Home", null);
    for (const link of navLinks) {
      frontier.add(link.href, link.label, homePattern);
    }

    const isOnOrigin = () => {
      try {
        return new URL(page.url()).origin === origin;
      } catch {
        return false;
      }
    };

    const buildMap = (): ApplicationMap => ({
      pages,
      navigation: navLinks.map((l) => l.label),
      navLinks: navLinks.map((l) => ({ label: l.label, href: l.href })),
      interactives: Array.from(interactivesMap.values()).slice(0, 50),
      screenshots,
      uiText: Array.from(uiText).slice(0, 400),
      edges: edgeCollector.edges
        .map((e) => ({
          from: canonicalUrl.get(e.from) ?? "",
          to: canonicalUrl.get(e.to) ?? "",
          label: e.label,
        }))
        .filter((e) => e.from !== "" && e.to !== "" && e.from !== e.to),
    });

    while (frontier.pending > 0 && frontier.visitedCount < maxPages) {
      const entry = frontier.next();
      if (!entry) break;
      const queuedPattern = normalizeRoute(entry.url);
      if (frontier.hasVisited(queuedPattern)) continue;

      try {
        await navigateAndWait(page, entry.url);
      } catch {
        await reporter.log(`Skipped "${entry.label}" (failed to load).`);
        frontier.markVisited(queuedPattern);
        continue;
      }
      frontier.markVisited(queuedPattern);
      if (!isOnOrigin()) continue;

      const pattern = normalizeRoute(page.url());
      if (AUTH_ROUTE_PATTERN.test(pattern)) continue;
      if (entry.fromPattern) {
        edgeCollector.add(entry.fromPattern, pattern, entry.label);
      }
      if (pattern !== queuedPattern) {
        // Redirected to a route we may have already captured.
        if (frontier.hasVisited(pattern)) continue;
        frontier.markVisited(pattern);
      }

      const shots = await capturePageScreenshots(page, projectId, pattern);
      const pageRef: DiscoveredPage = {
        url: page.url(),
        title: (await page.title()) || entry.label,
        routePattern: pattern,
        screenshot: shots.fullUrl,
        viewportScreenshot: shots.viewportUrl,
        actionScreenshots: [],
      };
      pages.push(pageRef);
      screenshots.push(shots.fullUrl);
      canonicalUrl.set(pattern, pageRef.url);
      await reporter.log(
        `Captured page ${pages.length}/${maxPages}: "${pageRef.title}" (${pattern})`,
      );

      (await extractVisibleText(page)).forEach((t) => uiText.add(t));
      for (const item of await extractInteractives(page)) {
        interactivesMap.set(`${item.role}:${item.name}`, item);
      }

      // Queue outgoing same-origin links and record graph edges.
      try {
        const links = await browserEval<CrawlLink[]>(
          page,
          "crawl-fallback.fn.js",
          origin,
        );
        let queued = 0;
        for (const link of links) {
          if (link.isAuth) continue;
          edgeCollector.add(pattern, normalizeRoute(link.href), link.label);
          if (queued < 25 && frontier.add(link.href, link.label, pattern)) {
            queued++;
          }
        }
      } catch {
        /* link extraction is best-effort */
      }

      // Overlay exploration (AI when available, deterministic otherwise).
      if (explorePerPage > 0) {
        await explorePageOverlays({
          page,
          projectId,
          routePattern: pattern,
          pageRef,
          frontier,
          edges: edgeCollector,
          reporter,
          maxActions: explorePerPage,
        });
      } else if (loggedIn) {
        await captureDeterministicOverlays({
          page,
          projectId,
          routePattern: pattern,
          pageRef,
          reporter,
        });
      }

      if (opts.onPartial) {
        try {
          await opts.onPartial(buildMap());
        } catch {
          /* partial saves are best-effort */
        }
      }
    }

    // 3. Branding.
    let discoveredLogoUrl: string | undefined;
    if (!opts.existingLogoUrl) {
      discoveredLogoUrl = await fetchAndStoreSiteLogo(page, origin, projectId);
      if (discoveredLogoUrl) {
        await reporter.log("Stored site favicon as default project logo.");
      }
    }

    await browser.close();
    browser = null;

    const map = { ...buildMap(), discoveredLogoUrl };
    await reporter.log(
      `Site map complete: ${map.pages.length} pages, ${map.edges?.length ?? 0} links, ${map.interactives?.length ?? 0} interactive controls.`,
    );
    return map;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await reporter.log(`Discovery via browser failed (${detail}).`);
    if (browser) await browser.close().catch(() => {});

    // Authentication failures already carry their own actionable guidance.
    if (detail.startsWith("Could not authenticate")) {
      throw err;
    }

    const hint = discoveryFailureHint(err, detail);

    throw new Error(`Browser discovery failed: ${detail}. ${hint}`);
  }
}

export interface RecaptureOptions {
  projectId: string;
  orgId: string;
  url: string;
  email: string;
  password: string;
  applicationMap: ApplicationMap;
  reporter: PipelineReporter;
  storageState?: StorageState | null;
}

/**
 * Refresh the screenshots of an existing application map without re-crawling:
 * revisit every mapped page and overwrite its stable-keyed screenshots.
 */
export async function recaptureScreenshots(
  opts: RecaptureOptions,
): Promise<ApplicationMap> {
  const { reporter, projectId, orgId, url, email, password, applicationMap } = opts;
  const origin = new URL(url).origin;

  let browser: Browser | null = null;
  try {
    await reporter.log("Launching headless browser for recapture…");
    browser = await launchChromium();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
      ...(opts.storageState ? { storageState: opts.storageState } : {}),
    });
    const page = await context.newPage();

    await navigateAndWait(page, url);

    let loggedIn = false;
    if (opts.storageState) {
      const probe = await verifyAuthenticated(page, origin);
      if (probe.ok) {
        loggedIn = true;
        await reporter.log(`Reusing stored session (${probe.reason}).`);
      }
    }
    if (!loggedIn) {
      loggedIn = await login(page, email, password, reporter, { projectId });
      if (loggedIn) await persistContextSession(projectId, orgId, context, reporter);
    }

    const pages = applicationMap.pages.map((p) => ({ ...p }));
    const screenshots: string[] = [];
    let refreshed = 0;

    for (const pageRef of pages) {
      const pattern = pageRef.routePattern ?? normalizeRoute(pageRef.url);
      try {
        await navigateAndWait(page, pageRef.url);
        if (new URL(page.url()).origin !== origin) continue;
        const shots = await capturePageScreenshots(page, projectId, pattern);
        pageRef.screenshot = shots.fullUrl;
        pageRef.viewportScreenshot = shots.viewportUrl;
        pageRef.routePattern = pattern;
        pageRef.title = (await page.title()) || pageRef.title;
        screenshots.push(shots.fullUrl);
        refreshed++;
        await reporter.log(`Recaptured "${pageRef.title}" (${pattern}).`);
      } catch {
        if (pageRef.screenshot) screenshots.push(pageRef.screenshot);
        await reporter.log(`Skipped recapture of ${pageRef.url} (failed to load).`);
      }
    }

    await browser.close();
    browser = null;

    await reporter.log(`Recapture complete: ${refreshed}/${pages.length} pages refreshed.`);
    return { ...applicationMap, pages, screenshots };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (browser) await browser.close().catch(() => {});
    throw new Error(`Recapture failed: ${detail}`);
  }
}
