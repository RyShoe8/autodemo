import type { Browser, Page } from "playwright";
import { storage } from "@/lib/storage";
import { isBlobStorageError } from "@/lib/storage/blob-utils";
import { placeholderScreenshotSVG } from "@/lib/media/placeholder";
import {
  AUTH_ROUTE_PATTERN,
  navigateAndWait,
  resolveLoginPage,
  waitForAppReady,
} from "@/lib/playwright/spa";
import type { ApplicationMap, DiscoveredPage } from "@/types";
import type { Reporter as PipelineReporter } from "@/lib/workflow/context";

export interface DiscoverOptions {
  projectId: string;
  url: string;
  email: string;
  password: string;
  reporter: PipelineReporter;
  maxPages?: number;
}

const NAV_SELECTORS = [
  "nav a",
  "header a",
  "[role=navigation] a",
  "aside a",
  ".sidebar a",
];

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

    const passwordField = page.locator('input[type="password"]').first();
    const emailField = page
      .locator(
        'input[type="email"], input[name="email"], input[name="username"], input[type="text"]',
      )
      .first();
    if ((await emailField.count()) > 0 && email) {
      await emailField.fill(email);
    }
    await passwordField.fill(password);
    await reporter.log("Submitting login form…");
    const submit = page
      .locator(
        'button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Continue")',
      )
      .first();
    if ((await submit.count()) > 0) {
      await Promise.all([
        waitForAppReady(page),
        submit.click().catch(() => {}),
      ]);
    } else {
      await passwordField.press("Enter");
      await waitForAppReady(page);
    }
    await reporter.log(`Login submitted (now at ${page.url()}).`);
    return true;
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

  const primary = await page.evaluate((selectors) => {
    const seen = new Set<string>();
    const out: NavLink[] = [];
    for (const sel of selectors) {
      document.querySelectorAll<HTMLAnchorElement>(sel).forEach((a) => {
        const label = (a.textContent || "").trim().replace(/\s+/g, " ");
        const href = a.href;
        if (!label || !href) return;
        if (seen.has(href)) return;
        seen.add(href);
        out.push({ label: label.slice(0, 60), href });
      });
    }
    return out;
  }, NAV_SELECTORS);

  if (primary.length >= 3) {
    await reporter?.log(
      `Navigation: ${primary.length} links from primary selectors.`,
    );
    return primary.slice(0, 12);
  }

  const fallback = await page.evaluate((pageOrigin) => {
    const authPattern =
      /\/(login|sign-?in|register|sign-?up|logout)(\/|$|\?)/i;
    const byHref = new Map<string, NavLink & { score: number; isAuth: boolean }>();

    document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
      const href = a.href;
      if (!href.startsWith(pageOrigin)) return;
      if (href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const label = (a.textContent || "").trim().replace(/\s+/g, " ");
      if (label.length < 2 || label.length > 60) return;

      let score = 0;
      let el: Element | null = a;
      while (el) {
        if (
          el.matches("nav, header, aside, [role=navigation], main")
        ) {
          score += 10;
        }
        el = el.parentElement;
      }

      let pathname = href;
      try {
        pathname = new URL(href).pathname;
      } catch {
        /* keep href */
      }
      const isAuth = authPattern.test(pathname);
      const entry = {
        label: label.slice(0, 60),
        href,
        score,
        isAuth,
      };
      const prev = byHref.get(href);
      if (!prev || entry.score > prev.score) {
        byHref.set(href, entry);
      }
    });

    return Array.from(byHref.values()).sort((a, b) => b.score - a.score);
  }, origin);

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

/** Extract trimmed visible text from the current page. */
export async function extractVisibleText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
    );
    const tags = new Set([
      "H1",
      "H2",
      "H3",
      "BUTTON",
      "A",
      "LABEL",
      "TH",
      "LEGEND",
    ]);
    let node = walker.nextNode();
    while (node && out.length < 80) {
      const el = node as HTMLElement;
      if (tags.has(el.tagName)) {
        const text = (el.innerText || "").trim().replace(/\s+/g, " ");
        if (text && text.length <= 80) out.push(text);
      }
      node = walker.nextNode();
    }
    return Array.from(new Set(out));
  });
}

function buildMockMap(opts: DiscoverOptions): ApplicationMap {
  const sections = [
    "Dashboard",
    "Projects",
    "Reports",
    "Team",
    "Settings",
  ];
  const pages: DiscoveredPage[] = sections.map((name, i) => {
    const svg = placeholderScreenshotSVG({
      title: name,
      subtitle: opts.url,
      index: i,
    });
    return {
      url: `${opts.url.replace(/\/$/, "")}/${name.toLowerCase()}`,
      title: name,
      screenshot: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    };
  });
  return {
    pages,
    navigation: sections,
    screenshots: pages.map((p) => p.screenshot!).filter(Boolean),
    uiText: [
      "Create new",
      "Search",
      "Filter",
      "Invite teammate",
      "Save changes",
      "Export",
      ...sections,
    ],
  };
}

/**
 * Visit the application, log in, crawl primary navigation, capture screenshots
 * and visible text, and return an application map. Falls back to a deterministic
 * mock map if a browser cannot be launched or the site is unreachable.
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

    const homeShot = await captureScreenshots(page, projectId, 0);
    const homeText = await extractVisibleText(page);
    homeText.forEach((t) => uiText.add(t));
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
        const text = await extractVisibleText(page);
        text.forEach((t) => uiText.add(t));
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

    await browser.close();
    browser = null;

    return {
      pages,
      navigation: navLinks.map((l) => l.label),
      screenshots,
      uiText: Array.from(uiText),
    };
  } catch (err) {
    await reporter.log(
      `Discovery via browser failed (${err instanceof Error ? err.message : String(err)}).`,
    );
    if (isBlobStorageError(err)) {
      await reporter.missing("BLOB_ACCESS / Blob store access mismatch");
    } else {
      await reporter.missing("Playwright browser / reachable target application");
    }
    if (browser) await browser.close().catch(() => {});
    return buildMockMap(opts);
  }
}
