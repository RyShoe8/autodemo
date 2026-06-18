(pageOrigin) => {
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
