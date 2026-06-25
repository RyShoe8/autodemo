() => {
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

  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((el) => {
      if (!el.offsetParent && el.tagName !== "BODY") return;
      const style = window.getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") return;

      if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      let name = "";
      const aria = el.getAttribute("aria-label");
      if (aria) {
        name = aria.trim();
      } else {
        const labelled = el.getAttribute("aria-labelledby");
        if (labelled) {
          const labelEl = document.getElementById(labelled);
          if (labelEl?.textContent) name = labelEl.textContent.trim();
        }
      }
      if (!name) {
        const text = (el.textContent || "").trim().replace(/\s+/g, " ");
        if (text) name = text.slice(0, 60);
      }
      if (!name && el.placeholder) {
        name = el.placeholder.trim().slice(0, 60);
      }
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
    if (out.length >= 80) break;
  }

  return out.slice(0, 80);
}
