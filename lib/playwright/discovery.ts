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
import {
  crawlNavigationFallback,
  crawlNavigationPrimary,
  extractInteractivesInBrowser,
  extractVisibleTextInBrowser,
} from "@/lib/playwright/browser-eval/discovery.browser.js";
import type { ApplicationMap, DiscoveredPage, InteractiveElement } from "@/types";
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

async function hasPasswordField(page: Page): Promise<boolean> {
  if ((await page.locator('input[type="password"]').count()) > 0) return true;
  const frames = page.frames();
  for (const frame of frames) {
    if (frame === page.mainFrame()) continue;
    if ((await frame.locator('input[type="password"]').count()) > 0) return true;
  }
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

async function waitForLoginResult(page: Page): Promise<boolean> {
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
    const hasPassword = await hasPasswordField(page);
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
    if (loggedIn) return true;
    if (!onAuthRoute && !hasPassword) return true;

    await page.waitForTimeout(500);
  }
  return false;
}

interface LoginFields {
  emailField: ReturnType<Page["locator"]>;
  passwordField: ReturnType<Page["locator"]>;
  inIframe: boolean;
}

async function findLoginFields(page: Page): Promise<LoginFields | null> {
  const mainPassword = page.locator('input[type="password"]').first();
  if ((await mainPassword.count()) > 0) {
    const emailField = page
      .locator(
        'input[type="email"], input[name="email"], input[name="username"], input[type="text"]',
      )
      .first();
    return { emailField, passwordField: mainPassword, inIframe: false };
  }

  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    const framePassword = frame.locator('input[type="password"]').first();
    if ((await framePassword.count()) > 0) {
      const emailField = frame
        .locator(
          'input[type="email"], input[name="email"], input[name="username"], input[type="text"]',
        )
        .first();
      return { emailField, passwordField: framePassword, inIframe: true };
    }
  }

  return null;
}

async function submitLoginForm(page: Page, fields: LoginFields): Promise<void> {
  await fields.passwordField.press("Enter");
  await waitForAppReady(page);
}

/** Attempt to detect and complete a login form on the current page. */
export async function login(
  page: Page,
  email: string,
  password: string,
  reporter: PipelineReporter,
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

    let success = await waitForLoginResult(page);
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
        success = await waitForLoginResult(page);
      }
    }

    if (success) {
      await reporter.log(`Login succeeded (now at ${page.url()}).`);
      return true;
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

  const primary = await page.evaluate(crawlNavigationPrimary, NAV_SELECTORS);

  if (primary.length >= 3) {
    await reporter?.log(
      `Navigation: ${primary.length} links from primary selectors.`,
    );
    return primary.slice(0, 12);
  }

  const fallback = await page.evaluate(crawlNavigationFallback, origin);

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
  const buffer = await page.screenshot({ fullPage: false });
  const { url } = await storage.save(
    `projects/${projectId}/discovery/page-${index}.png`,
    buffer,
    "image/png",
  );
  return url;
}

/** Extract visible interactive controls from the current page. */
export async function extractInteractives(
  page: Page,
): Promise<InteractiveElement[]> {
  return page.evaluate(extractInteractivesInBrowser);
}

/** Extract trimmed visible text from the current page. */
export async function extractVisibleText(page: Page): Promise<string[]> {
  return page.evaluate(extractVisibleTextInBrowser);
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
    const { chromium } = await import("playwright");
    await reporter.log("Launching headless browser…");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    await reporter.log(`Navigating to ${url}`);
    await navigateAndWait(page, url);

    await login(page, email, password, reporter);
    await waitForAppReady(page);

    const navLinks = await crawlNavigation(page, origin, reporter);
    await reporter.log(`Found ${navLinks.length} navigation links.`);

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

    const homeShot = await captureScreenshots(page, projectId, 0);
    await capturePageState();
    pages.push({
      url: page.url(),
      title: await page.title(),
      screenshot: homeShot,
    });
    screenshots.push(homeShot);

    let captured = 1;
    for (const link of navLinks) {
      if (captured >= maxPages) break;
      try {
        if (!link.href.startsWith(origin)) continue;
        await navigateAndWait(page, link.href);
        const shot = await captureScreenshots(page, projectId, captured);
        await capturePageState();
        pages.push({
          url: page.url(),
          title: (await page.title()) || link.label,
          screenshot: shot,
        });
        screenshots.push(shot);
        await reporter.log(`Captured "${link.label}"`);
        captured += 1;
      } catch {
        await reporter.log(`Skipped "${link.label}" (failed to load).`);
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
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await reporter.log(`Discovery via browser failed (${detail}).`);
    if (browser) await browser.close().catch(() => {});

    const hint = discoveryFailureHint(err, detail);

    throw new Error(`Browser discovery failed: ${detail}. ${hint}`);
  }
}
