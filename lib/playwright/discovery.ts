import type { Browser, Page } from "playwright";
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
import type { ApplicationMap, DiscoveredPage, InteractiveElement, ActionScreenshot } from "@/types";
import { env, flags } from "@/lib/env";
import { resolveDiscoveryNextAction } from "@/lib/openai/discovery-agent";
import type { Reporter as PipelineReporter } from "@/lib/workflow/context";

export interface DiscoverOptions {
  projectId: string;
  url: string;
  email: string;
  password: string;
  reporter: PipelineReporter;
  maxPages?: number;
  /** Skip favicon fetch when the project already has a user-uploaded logo. */
  existingLogoUrl?: string;
}

const NAV_SELECTORS = [
  "nav a",
  "header a",
  "[role=navigation] a",
  "aside a",
  ".sidebar a",
];

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

async function verifyAuthenticated(
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

async function waitForLoginResult(
  page: Page,
  origin: string,
): Promise<boolean> {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
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

    const hasError = await page
      .locator(
        '.error, [role="alert"], .alert-error, .text-red-500, .text-destructive',
      )
      .filter({ hasText: /invalid|incorrect|failed|wrong|error/i })
      .first()
      .isVisible()
      .catch(() => false);

    if (hasError) return false;
    if (!onAuthRoute && await hasLoggedOutSignals(page)) return false;
    if (loggedIn) return true;
    if (!hasPassword && (await hasAppNavShell(page))) return true;
    // We removed the overly optimistic check that was returning true for public marketing pages
    // if (!onAuthRoute && !hasPassword) return true;

    await page.waitForTimeout(500);
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

async function submitLoginForm(page: Page, fields: LoginFields): Promise<void> {
  // Try blur and focus to trigger React events before Enter
  await fields.passwordField.blur().catch(() => {});
  await fields.passwordField.focus().catch(() => {});
  await fields.passwordField.press("Enter").catch(() => {});
  await page.waitForTimeout(1000);
  await waitForAppReady(page);

  // If the password field is still visible, the form didn't submit via Enter. Try clicking the button.
  if (await fields.passwordField.isVisible().catch(() => false)) {
    const form = fields.passwordField.locator('xpath=ancestor::form').first();
    
    // 1. Look for type="submit" in the form
    if ((await form.count().catch(() => 0)) > 0) {
      const submitBtn = form.locator('button[type="submit"]:visible, input[type="submit"]:visible').first();
      if ((await submitBtn.count()) > 0 && await submitBtn.isVisible().catch(() => false)) {
        await submitBtn.click({ timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(1000);
        await waitForAppReady(page);
        return;
      }
    }

    // 2. Look for type="submit" globally
    const globalSubmitBtn = page.locator('button[type="submit"]:visible, input[type="submit"]:visible').first();
    if ((await globalSubmitBtn.count()) > 0 && await globalSubmitBtn.isVisible().catch(() => false)) {
      await globalSubmitBtn.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1000);
      await waitForAppReady(page);
      return;
    }

    // 3. Look for a button with login text
    const signInBtn = page
      .getByRole("button", { name: /sign in|log in|login|signin|submit/i })
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

    // 4. Look for ANY button inside the form
    if ((await form.count().catch(() => 0)) > 0) {
      const formBtn = form.locator('button:visible').first();
      if ((await formBtn.count()) > 0 && await formBtn.isVisible().catch(() => false)) {
        await formBtn.click({ timeout: 8000 }).catch(() => {});
      }
    }
    
    await page.waitForTimeout(1000);
    await waitForAppReady(page);
  }
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

    if ((await fields.emailField.count()) > 0 && email) {
      await fields.emailField.fill(email);
    }
    await fields.passwordField.fill(password);
    await reporter.log("Submitting login form…");
    await submitLoginForm(page, fields);

    let success = await waitForLoginResult(page, origin);
    if (!success) {
      await reporter.log("Login may have failed — retrying once…");
      await waitForAppReady(page);
      const retryFields = await findLoginFields(page);
      if (retryFields) {
        if ((await retryFields.emailField.count()) > 0 && email) {
          await retryFields.emailField.fill(email);
        }
        await retryFields.passwordField.fill(password);
        await submitLoginForm(page, retryFields);
        success = await waitForLoginResult(page, origin);
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

    if (options?.projectId) {
      try {
        const buffer = await page.screenshot({ fullPage: false });
        await storage.save(
          `projects/${options.projectId}/discovery/login-attempt.png`,
          buffer,
          "image/png",
        );
        await reporter.log("Saved login-attempt.png for debugging.");
      } catch {
        /* non-fatal */
      }
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

/** Capture a screenshot of the current page and persist it to storage. */
export async function captureScreenshots(
  page: Page,
  projectId: string,
  index: number,
): Promise<string> {
  const buffer = await page.screenshot({ fullPage: true, type: "jpeg", quality: 80 });
  const { url } = await storage.save(
    `projects/${projectId}/discovery/page-${index}.jpg`,
    buffer,
    "image/jpeg",
  );
  return url;
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

/**
 * Visit the application, log in, crawl primary navigation, capture screenshots
 * and visible text, and return an application map.
 */
export async function discoverApplication(
  opts: DiscoverOptions,
): Promise<ApplicationMap> {
  const { reporter, projectId, url, email, password } = opts;
  const maxPages = opts.maxPages ?? 6;
  const origin = new URL(url).origin;

  let browser: Browser | null = null;
  try {
    await reporter.log("Launching headless browser…");
    browser = await launchChromium();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    await reporter.log(`Navigating to ${url}`);
    await navigateAndWait(page, url);

    let loggedIn = await login(page, email, password, reporter, { projectId });
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

    await waitForAppReady(page);

    const pages: DiscoveredPage[] = [];
    const screenshots: string[] = [];
    const uiText = new Set<string>();
    const interactivesMap = new Map<string, InteractiveElement>();

    async function capturePageState() {
      const text = await extractVisibleText(page);
      text.forEach((t) => uiText.add(t));
      const items = await extractInteractives(page);
      for (const item of items) {
        interactivesMap.set(`${item.role}:${item.name}`, item);
      }
    }

    let captured = 0;
    let navLinks: NavLink[] = [];
    const edges: { from: string; to: string; label: string }[] = [];

    if (flags.hasOpenAI) {
      await reporter.log(`Starting autonomous AI discovery...`);
      const history: string[] = [];
      let currentPageBaseUrl = "";
      let currentPageRef: DiscoveredPage | null = null;
      let actionCount = 0;

      while (captured < maxPages && actionCount < 100) {
        await waitForAppReady(page);
        const currentUrl = page.url();

        if (currentUrl !== currentPageBaseUrl || !currentPageRef) {
          const homeShot = await captureScreenshots(page, projectId, captured);
          await capturePageState();
          currentPageRef = {
            url: currentUrl,
            title: await page.title(),
            screenshot: homeShot,
            actionScreenshots: [],
          };
          pages.push(currentPageRef);
          screenshots.push(homeShot);
          currentPageBaseUrl = currentUrl;
          captured++;
          await reporter.log(`Captured base page: "${currentPageRef.title}"`);
        }

        const interactives = await extractInteractives(page);
        const nextAction = await resolveDiscoveryNextAction(currentUrl, history, interactives);

        if (!nextAction || nextAction.action === "done") {
          await reporter.log(`AI agent finished exploration: ${nextAction?.reason || "exhausted"}`);
          break;
        }

        actionCount++;
        const actionDesc = nextAction.action === "type"
          ? `Typed "${nextAction.value}" into ${nextAction.role} "${nextAction.name}"`
          : `Clicked ${nextAction.role} "${nextAction.name}"`;

        await reporter.log(`AI Action: ${actionDesc} - Reason: ${nextAction.reason}`);
        history.push(actionDesc);

        try {
          if (nextAction.name && nextAction.role) {
            const loc = page.getByRole(nextAction.role as any, { name: nextAction.name, exact: false }).first();
            if (await loc.isVisible().catch(() => false)) {
              if (nextAction.action === "type" && nextAction.value) {
                await loc.fill(nextAction.value, { timeout: 3000 });
                await loc.press("Enter");
              } else {
                await loc.click({ timeout: 3000 });
              }
              await page.waitForTimeout(1000);
              await waitForAppReady(page);

              const newUrl = page.url();
              if (newUrl === currentUrl && currentPageRef) {
                const actionShotBuffer = await page.screenshot({ fullPage: true, type: "jpeg", quality: 80 });
                const { url } = await storage.save(
                  `projects/${projectId}/discovery/page-${captured}-action-${actionCount}.jpg`,
                  actionShotBuffer,
                  "image/jpeg"
                );
                currentPageRef.actionScreenshots!.push({
                  type: "modal",
                  triggerText: nextAction.name,
                  screenshot: url
                });
                await reporter.log(`Captured action state for "${nextAction.name}"`);
              } else if (newUrl !== currentUrl) {
                edges.push({ from: currentUrl, to: newUrl, label: nextAction.name || "Navigation" });
                await reporter.log(`Navigated to new page: ${newUrl}`);
              }
            } else {
              await reporter.log(`Element ${nextAction.name} not visible. Skipping.`);
            }
          } else {
            await reporter.log(`Missing role or name for action. Skipping.`);
          }
        } catch (err) {
          await reporter.log(`Action failed: ${err}`);
        }
      }
    } else {
      navLinks = await crawlNavigation(page, origin, reporter);
      await reporter.log(`Found ${navLinks.length} navigation links.`);

      async function captureActionScreenshots(pageUrl: string, pageIndex: number): Promise<ActionScreenshot[]> {
        const actionScreenshots: ActionScreenshot[] = [];
        const interactives = await extractInteractives(page);
        
        const triggers = interactives.filter(i => {
          if (i.role === 'button' || i.tag.toLowerCase() === 'button') {
            const lower = i.name.toLowerCase();
            return ['add', 'new', 'create', 'edit', 'settings', 'menu', 'filter', 'options'].some(keyword => lower.includes(keyword));
          }
          return false;
        }).slice(0, 4);

        for (let i = 0; i < triggers.length; i++) {
          const trigger = triggers[i];
          try {
            const el = page.locator(`text="${trigger.name}"`).first();
            if (await el.isVisible().catch(() => false)) {
              await reporter.log(`Clicking potential trigger: "${trigger.name}"...`);
              await el.click({ timeout: 2000 });
              await page.waitForTimeout(800);
              
              const buffer = await page.screenshot({ fullPage: true, type: "jpeg", quality: 80 });
              const { url } = await storage.save(
                `projects/${projectId}/discovery/page-${pageIndex}-action-${i}.jpg`,
                buffer,
                "image/jpeg"
              );
              actionScreenshots.push({
                type: "modal",
                triggerText: trigger.name,
                screenshot: url
              });
              
              await page.goto(pageUrl, { waitUntil: "load" });
              await waitForAppReady(page);
            }
          } catch (err) {
            // ignore error and continue
          }
        }
        return actionScreenshots;
      }

      const homeUrl = page.url();
      const homeShot = await captureScreenshots(page, projectId, captured);
      await capturePageState();
      const homeActions = await captureActionScreenshots(homeUrl, captured);
      
      pages.push({
        url: homeUrl,
        title: await page.title(),
        screenshot: homeShot,
        actionScreenshots: homeActions,
      });
      screenshots.push(homeShot);
      captured++;

      for (const link of navLinks) {
        if (captured >= maxPages) break;
        try {
          if (!link.href.startsWith(origin)) continue;
          await navigateAndWait(page, link.href);
          const pageUrl = page.url();
          const shot = await captureScreenshots(page, projectId, captured);
          await capturePageState();
          const actions = await captureActionScreenshots(pageUrl, captured);
          
          pages.push({
            url: pageUrl,
            title: (await page.title()) || link.label,
            screenshot: shot,
            actionScreenshots: actions,
          });
          screenshots.push(shot);
          await reporter.log(`Captured "${link.label}"`);
          captured++;
        } catch {
          await reporter.log(`Skipped "${link.label}" (failed to load).`);
        }
      }
    }

    let discoveredLogoUrl: string | undefined;
    if (!opts.existingLogoUrl) {
      discoveredLogoUrl = await fetchAndStoreSiteLogo(page, origin, projectId);
      if (discoveredLogoUrl) {
        await reporter.log("Stored site favicon as default project logo.");
      }
    }

    await browser.close();
    browser = null;

    const interactives = Array.from(interactivesMap.values()).slice(0, 30);
    await reporter.log(
      `Cataloged ${interactives.length} interactive controls across ${pages.length} pages.`,
    );

    return {
      pages,
      navigation: navLinks.map((l) => l.label),
      navLinks: navLinks.map((l) => ({ label: l.label, href: l.href })),
      interactives,
      screenshots,
      uiText: Array.from(uiText),
      discoveredLogoUrl,
      edges: flags.hasOpenAI ? edges : undefined,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await reporter.log(`Discovery via browser failed (${detail}).`);
    if (browser) await browser.close().catch(() => {});

    const hint = discoveryFailureHint(err, detail);

    throw new Error(`Browser discovery failed: ${detail}. ${hint}`);
  }
}
