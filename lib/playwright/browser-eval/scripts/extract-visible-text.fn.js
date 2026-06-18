() => {
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
