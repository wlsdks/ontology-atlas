import { escapeHtml } from "./persistence";

/**
 * 외부 popout / print 용 self-contained HTML 페이지 합성 (Fire 4-d-1).
 *
 * 호출자: `DocsVaultPage` 의 `handleExportDocHtml` — 문서 본문 article 의
 * `outerHTML` 을 받아 dark theme HTML 한 페이지로 wrap. 다운로드 파일 (.html)
 * 은 Aslan 디자인 헌장 §11 의 무채색 + 인디고 alpha 만 사용 (offline self-
 * contained).
 *
 * `escapeHtml` 은 lib/persistence.ts 에서 import — 문서 title 안 사용자 입력을
 * 안전하게 이스케이프.
 */
export function buildDocsVaultPopoutHtml(
  title: string,
  htmlBody: string,
): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
body {
  font-family: system-ui, -apple-system, "Apple SD Gothic Neo", Inter, "Segoe UI", sans-serif;
  background: #0d0e12;
  color: #e3e6ec;
  margin: 0;
  padding: 40px 24px;
  line-height: 1.65;
}
[data-docs-viewer] { max-width: 760px; margin: 0 auto; }
[data-docs-viewer] h1 { font-size: 26px; font-weight: 600; color: #f5f6f8; margin-top: 0; margin-bottom: 24px; }
[data-docs-viewer] h2 { font-size: 18px; font-weight: 600; color: #f5f6f8; margin: 32px 0 12px; }
[data-docs-viewer] h3 { font-size: 15px; font-weight: 600; color: #f5f6f8; margin: 20px 0 8px; }
[data-docs-viewer] p { font-size: 14px; color: #c0c4cc; margin: 12px 0; }
[data-docs-viewer] a { color: rgba(139,151,255,0.9); text-decoration: underline; }
[data-docs-viewer] ul, [data-docs-viewer] ol { padding-left: 24px; color: #c0c4cc; }
[data-docs-viewer] code { background: rgba(139,151,255,0.08); padding: 2px 4px; border-radius: 3px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; color: #dbe1ff; }
[data-docs-viewer] pre { background: rgba(12,14,20,0.8); border: 1px solid var(--color-border-soft); padding: 12px; border-radius: 6px; overflow: auto; }
[data-docs-viewer] blockquote { border-left: 2px solid rgba(139,151,255,0.35); padding-left: 16px; color: #a7adb8; font-style: italic; margin: 16px 0; }
[data-docs-viewer] table { width: 100%; border-collapse: collapse; font-size: 13px; }
[data-docs-viewer] th, [data-docs-viewer] td { border-bottom: 1px solid var(--color-border-soft); padding: 6px 10px; text-align: left; }
[data-docs-viewer] img { max-width: 100%; border-radius: 6px; }
button { display: none; }
</style>
</head>
<body>
${htmlBody}
</body>
</html>`;
}
