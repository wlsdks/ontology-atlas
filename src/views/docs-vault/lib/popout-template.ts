import { escapeHtml } from "./persistence";

/**
 * Composes a self-contained HTML page for an external popout or print.
 *
 * Called by `handleExportDocHtml` in `DocsVaultPage`: it takes the document body article's
 * `outerHTML` and wraps it into a single dark-theme HTML page. The downloaded `.html` uses
 * neutrals plus indigo alpha only, and is offline self-contained.
 *
 * This document is standalone HTML outside the app, so the `:root` CSS tokens (`var(--color-*)`)
 * are not defined. Colours are therefore pinned as the design tokens' *literal values*, defined in
 * `POPOUT_TOKENS` alone to prevent drift. Keep the values equal to the tokens in
 * `docs/DESIGN-SYSTEM.md` and `app/globals.css`.
 */
const POPOUT_TOKENS = {
  canvas: "#08090a",
  panel: "#0f1011",
  textPrimary: "#f7f8f8",
  textSecondary: "#d0d6e0",
  textTertiary: "#8a8f98",
  borderSoft: "rgba(255,255,255,0.08)",
  // One colour: indigo. Code, links, and blockquote emphasis use indigo alpha only.
  indigoAlphaStrong: "rgba(139,151,255,0.9)",
  indigoAlphaBorder: "rgba(139,151,255,0.35)",
  indigoAlphaSurface: "rgba(139,151,255,0.08)",
} as const;

export function buildDocsVaultPopoutHtml(
  title: string,
  htmlBody: string,
): string {
  const t = POPOUT_TOKENS;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
body {
  font-family: system-ui, -apple-system, "Apple SD Gothic Neo", Inter, "Segoe UI", sans-serif;
  background: ${t.panel};
  color: ${t.textSecondary};
  margin: 0;
  padding: 40px 24px;
  line-height: 1.65;
}
[data-docs-viewer] { max-width: 760px; margin: 0 auto; }
[data-docs-viewer] h1 { font-size: 26px; font-weight: 600; color: ${t.textPrimary}; margin-top: 0; margin-bottom: 24px; }
[data-docs-viewer] h2 { font-size: 18px; font-weight: 600; color: ${t.textPrimary}; margin: 32px 0 12px; }
[data-docs-viewer] h3 { font-size: 15px; font-weight: 600; color: ${t.textPrimary}; margin: 20px 0 8px; }
[data-docs-viewer] p { font-size: 14px; color: ${t.textSecondary}; margin: 12px 0; }
[data-docs-viewer] a { color: ${t.indigoAlphaStrong}; text-decoration: underline; }
[data-docs-viewer] ul, [data-docs-viewer] ol { padding-left: 24px; color: ${t.textSecondary}; }
[data-docs-viewer] code { background: ${t.indigoAlphaSurface}; padding: 2px 4px; border-radius: 3px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; color: ${t.textPrimary}; }
[data-docs-viewer] pre { background: ${t.canvas}; border: 1px solid ${t.borderSoft}; padding: 12px; border-radius: 6px; overflow: auto; }
[data-docs-viewer] blockquote { border-left: 2px solid ${t.indigoAlphaBorder}; padding-left: 16px; color: ${t.textTertiary}; font-style: italic; margin: 16px 0; }
[data-docs-viewer] table { width: 100%; border-collapse: collapse; font-size: 13px; }
[data-docs-viewer] th, [data-docs-viewer] td { border-bottom: 1px solid ${t.borderSoft}; padding: 6px 10px; text-align: left; }
[data-docs-viewer] img { max-width: 100%; border-radius: 6px; }
button { display: none; }
</style>
</head>
<body>
${htmlBody}
</body>
</html>`;
}
