(selectors) => {
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
