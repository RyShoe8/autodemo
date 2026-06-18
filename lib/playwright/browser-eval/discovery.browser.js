/**
 * Browser-only scripts for Playwright page.evaluate().
 *
 * Must remain plain .js — tsx/esbuild injects __name() into TypeScript
 * callbacks, which breaks in the browser sandbox.
 */

/** @param {string[]} selectors */
export function crawlNavigationPrimary(selectors) {
  const seen = new Set();
  const out = [];
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((a) => {
      const label = (a.textContent || "").trim().replace(/\s+/g, " ");
      const href = a.href;
      if (!label || !href) return;
      if (seen.has(href)) return;
      seen.add(href);
      out.push({ label: label.slice(0, 60), href });
    });
  }
  return out;
}

/** @param {string} pageOrigin */
export function crawlNavigationFallback(pageOrigin) {
  const authPattern = /\/(login|sign-?in|register|sign-?up|logout)(\/|$|\?)/i;
  const byHref = new Map();

  document.querySelectorAll("a[href]").forEach((a) => {
    const href = a.href;
    if (!href.startsWith(pageOrigin)) return;
    if (href.startsWith("mailto:") || href.startsWith("tel:")) return;
    const label = (a.textContent || "").trim().replace(/\s+/g, " ");
    if (label.length < 2 || label.length > 60) return;

    let score = 0;
    let el = a;
    while (el) {
      if (el.matches("nav, header, aside, [role=navigation], main")) {
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
    const entry = {
      label: label.slice(0, 60),
      href,
      score,
      isAuth: authPattern.test(pathname),
    };
    const prev = byHref.get(href);
    if (!prev || entry.score > prev.score) {
      byHref.set(href, entry);
    }
  });

  return Array.from(byHref.values()).sort((a, b) => b.score - a.score);
}

export function extractInteractivesInBrowser() {
  const seen = new Set();
  const out = [];
  const selectors = [
    "button",
    "a[href]",
    "input:not([type=hidden])",
    "textarea",
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
  ];

  const accessibleName = (el) => {
    const aria = el.getAttribute("aria-label");
    if (aria) return aria.trim();
    const labelled = el.getAttribute("aria-labelledby");
    if (labelled) {
      const labelEl = document.getElementById(labelled);
      if (labelEl?.textContent) return labelEl.textContent.trim();
    }
    const text = (el.textContent || "").trim().replace(/\s+/g, " ");
    if (text) return text.slice(0, 60);
    const placeholder = el.placeholder;
    return placeholder?.trim().slice(0, 60) ?? "";
  };

  const isVisible = (el) => {
    if (!el.offsetParent && el.tagName !== "BODY") return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  };

  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((el) => {
      if (!isVisible(el)) return;
      const name = accessibleName(el);
      if (name.length < 2) return;
      const role =
        el.getAttribute("role") ||
        (el.tagName === "A"
          ? "link"
          : el.tagName === "INPUT" || el.tagName === "TEXTAREA"
            ? "textbox"
            : "button");
      const tag =
        el.getAttribute("role") === "tab" ? "tab" : el.tagName.toLowerCase();
      const key = `${role}:${name}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ role, name, tag });
    });
    if (out.length >= 30) break;
  }

  return out.slice(0, 30);
}

export function extractVisibleTextInBrowser() {
  const out = [];
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
    if (tags.has(node.tagName)) {
      const text = (node.innerText || "").trim().replace(/\s+/g, " ");
      if (text && text.length <= 80) out.push(text);
    }
    node = walker.nextNode();
  }
  return Array.from(new Set(out));
}
