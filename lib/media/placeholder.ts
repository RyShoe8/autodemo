/**
 * Deterministic SVG generators used when a real browser screenshot or asset is
 * unavailable (graceful-degradation fallbacks). SVGs are consumed by the
 * Remotion compositions (rendered in headless Chromium) and previewed in the UI.
 */

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const PALETTE = [
  ["#0f172a", "#1e293b", "#38bdf8"],
  ["#111827", "#1f2937", "#a78bfa"],
  ["#0c0a09", "#1c1917", "#fb923c"],
  ["#082f49", "#0c4a6e", "#22d3ee"],
  ["#1e1b4b", "#312e81", "#818cf8"],
];

export function placeholderScreenshotSVG(opts: {
  title: string;
  subtitle?: string;
  width?: number;
  height?: number;
  index?: number;
}): string {
  const width = opts.width ?? 1280;
  const height = opts.height ?? 800;
  const [bg, panel, accent] = PALETTE[(opts.index ?? 0) % PALETTE.length];
  const title = escapeXml(opts.title);
  const subtitle = escapeXml(opts.subtitle ?? "");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${bg}"/>
  <rect x="0" y="0" width="${width}" height="64" fill="${panel}"/>
  <circle cx="32" cy="32" r="10" fill="${accent}"/>
  <rect x="56" y="24" width="160" height="16" rx="8" fill="#334155"/>
  <rect x="${width - 140}" y="20" width="100" height="24" rx="12" fill="${accent}" opacity="0.8"/>
  <rect x="40" y="104" width="220" height="${height - 160}" rx="16" fill="${panel}"/>
  <rect x="64" y="140" width="172" height="14" rx="7" fill="#475569"/>
  <rect x="64" y="172" width="140" height="14" rx="7" fill="#475569"/>
  <rect x="64" y="204" width="160" height="14" rx="7" fill="#475569"/>
  <rect x="300" y="104" width="${width - 360}" height="120" rx="16" fill="${panel}"/>
  <rect x="300" y="248" width="${(width - 380) / 2}" height="${height - 320}" rx="16" fill="${panel}"/>
  <rect x="${320 + (width - 380) / 2}" y="248" width="${(width - 380) / 2}" height="${height - 320}" rx="16" fill="${panel}"/>
  <text x="328" y="170" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="700" fill="#f8fafc">${title}</text>
  <text x="328" y="206" font-family="Inter, Arial, sans-serif" font-size="20" fill="#94a3b8">${subtitle}</text>
</svg>`;
}

export function placeholderThumbnailSVG(opts: {
  title: string;
  headline: string;
  width?: number;
  height?: number;
}): string {
  const width = opts.width ?? 1280;
  const height = opts.height ?? 720;
  const title = escapeXml(opts.title);
  const headline = escapeXml(opts.headline);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0ea5e9"/>
      <stop offset="100%" stop-color="#6366f1"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <rect x="60" y="${height - 220}" width="${width - 120}" height="160" rx="20" fill="#0f172a" opacity="0.7"/>
  <text x="90" y="${height - 150}" font-family="Inter, Arial, sans-serif" font-size="56" font-weight="800" fill="#ffffff">${headline}</text>
  <text x="90" y="${height - 96}" font-family="Inter, Arial, sans-serif" font-size="28" fill="#cbd5e1">${title}</text>
</svg>`;
}
