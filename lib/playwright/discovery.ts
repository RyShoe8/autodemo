import type { Browser, Page } from "playwright";
import { storage } from "@/lib/storage";
import { placeholderScreenshotSVG } from "@/lib/media/placeholder";
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
    const passwordField = page.locator('input[type="password"]').first();
    const hasPassword = (await passwordField.count()) > 0;
    if (!hasPassword) {
      await reporter.log("No login form detected — continuing unauthenticated.");
      return false;
    }
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
        'button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Log in")',
      )
      .first();
    if ((await submit.count()) > 0) {
      await Promise.all([
        page.waitForLoadState("networkidle").catch(() => {}),
        submit.click().catch(() => {}),
      ]);
    } else {
      await passwordField.press("Enter");
      await page.waitForLoadState("networkidle").catch(() => {});
    }
    await reporter.log("Login submitted.");
    return true;
  } catch (err) {
    await reporter.log(
      `Login attempt failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

/** Collect primary navigation link labels + hrefs from the current page. */
export async function crawlNavigation(page: Page): Promise<
  { label: string; href: string }[]
> {
  const links = await page.evaluate((selectors) => {
    const seen = new Set<string>();
    const out: { label: string; href: string }[] = [];
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
  return links.slice(0, 12);
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
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    await login(page, email, password, reporter);

    const navLinks = await crawlNavigation(page);
    await reporter.log(`Found ${navLinks.length} navigation links.`);

    const pages: DiscoveredPage[] = [];
    const screenshots: string[] = [];
    const uiText = new Set<string>();

    // Capture the landing page.
    const homeShot = await captureScreenshots(page, projectId, 0);
    const homeText = await extractVisibleText(page);
    homeText.forEach((t) => uiText.add(t));
    pages.push({
      url: page.url(),
      title: await page.title(),
      screenshot: homeShot,
    });
    screenshots.push(homeShot);

    const origin = new URL(url).origin;
    let captured = 1;
    for (const link of navLinks) {
      if (captured >= maxPages) break;
      try {
        if (!link.href.startsWith(origin)) continue;
        await page.goto(link.href, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });
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
    await reporter.missing("Playwright browser / reachable target application");
    if (browser) await browser.close().catch(() => {});
    return buildMockMap(opts);
  }
}
