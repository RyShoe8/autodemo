import type { Page } from "playwright";
import type { Reporter } from "@/lib/workflow/context";
import { dismissOverlays } from "@/lib/playwright/overlays";

const LOGIN_PATHS = [
  "/login",
  "/sign-in",
  "/signin",
  "/auth/login",
  "/account/login",
];

const SIGN_IN_PATTERN = /sign in|log in|login/i;

/** Wait for a client-rendered app to hydrate after navigation. */
export async function waitForAppReady(page: Page): Promise<void> {
  await Promise.race([
    page
      .waitForFunction(
        () => !document.body?.innerText?.includes("Loading..."),
        { timeout: 10000 },
      )
      .catch(() => {}),
    page
      .waitForSelector(
        'nav a, header a, main a, input[type="password"], [role="navigation"]',
        { timeout: 10000 },
      )
      .catch(() => {}),
  ]);
  await page.waitForTimeout(250);
}

/** Navigate and wait for SPA hydration. */
export async function navigateAndWait(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "load", timeout: 30000 });
  await waitForAppReady(page);
  await dismissOverlays(page);
}

async function hasLoginForm(page: Page): Promise<boolean> {
  return (await page.locator('input[type="password"]').count()) > 0;
}

/**
 * Find a login form by clicking sign-in CTAs or visiting common login paths.
 */
export async function resolveLoginPage(
  page: Page,
  origin: string,
  reporter: Reporter,
): Promise<boolean> {
  if (await hasLoginForm(page)) return true;

  const signInLink = page.getByRole("link", { name: SIGN_IN_PATTERN }).first();
  if ((await signInLink.count()) > 0) {
    await signInLink.click().catch(() => {});
    await waitForAppReady(page);
    if (await hasLoginForm(page)) {
      await reporter.log(
        `Navigated to login via sign-in link (${page.url()}).`,
      );
      return true;
    }
  }

  const signInButton = page
    .getByRole("button", { name: SIGN_IN_PATTERN })
    .first();
  if ((await signInButton.count()) > 0) {
    await signInButton.click().catch(() => {});
    await waitForAppReady(page);
    if (await hasLoginForm(page)) {
      await reporter.log(
        `Navigated to login via sign-in button (${page.url()}).`,
      );
      return true;
    }
  }

  for (const path of LOGIN_PATHS) {
    await navigateAndWait(page, `${origin}${path}`);
    if (await hasLoginForm(page)) {
      await reporter.log(`Navigated to login via ${path}.`);
      return true;
    }
  }

  return false;
}

export const AUTH_ROUTE_PATTERN =
  /\/(login|sign-?in|register|sign-?up|logout)(\/|$|\?)/i;
