import { escapeHtml } from "./persistence";

/**
 * 외부 popout / print 용 self-contained HTML 페이지 합성.
 *
 * 호출자: `DocsVaultPage` 의 `handleExportDocHtml` — 문서 본문 article 의
 * `outerHTML` 을 받아 dark theme HTML 한 페이지로 wrap. 다운로드 파일 (.html)
 * 은 무채색 + 인디고 alpha 만 사용 (offline self-contained).
 *
 * 이 문서는 앱 밖 standalone HTML 이라 `:root` CSS 토큰 (`var(--color-*)`) 이
 * 정의돼 있지 않다. 따라서 색은 CSS 변수가 아니라 design token 의 *리터럴 값*
 * 으로 박되, 아래 POPOUT_TOKENS 한 곳에서만 정의해 drift 를 막는다. 값은
 * `docs/DESIGN-SYSTEM.md` · `app/globals.css` 의 토큰과 동일하게 유지한다.
 *
 * `escapeHtml` 은 lib/persistence.ts 에서 import — 문서 title 안 사용자 입력을
 * 안전하게 이스케이프.
 */
const POPOUT_TOKENS = {
  canvas: "#08090a",
  panel: "#0f1011",
  textPrimary: "#f7f8f8",
  textSecondary: "#d0d6e0",
  textTertiary: "#8a8f98",
  borderSoft: "rgba(255,255,255,0.08)",
  // 단일 채색 = 인디고. code/link/blockquote 강조에 인디고 alpha 만 사용.
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
