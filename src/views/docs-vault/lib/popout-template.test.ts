import { describe, expect, it } from "vitest";
import { buildDocsVaultPopoutHtml } from "./popout-template";

describe("buildDocsVaultPopoutHtml", () => {
  it("title 을 escape 해 안전한 HTML 문서 합성", () => {
    const html = buildDocsVaultPopoutHtml(
      `로그인 < script > "spec"`,
      `<article>본문</article>`,
    );
    // The title is escaped.
    expect(html).toContain(
      "<title>로그인 &lt; script &gt; &quot;spec&quot;</title>",
    );
    // The body passes through (the caller is assumed to hand over already-safe HTML as outerHTML).
    expect(html).toContain("<article>본문</article>");
  });

  it("self-contained — DOCTYPE / lang ko / utf-8 / viewport 모두 포함", () => {
    const html = buildDocsVaultPopoutHtml("a", "<p>x</p>");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="ko">');
    expect(html).toContain('<meta charset="utf-8" />');
    expect(html).toContain("width=device-width,initial-scale=1");
  });

  it("body 안 dark theme 무채색 + 인디고 alpha 만", () => {
    const html = buildDocsVaultPopoutHtml("a", "<p>x</p>");
    // Neutral surface and text colours are the design tokens' literal values (identical to globals.css).
    expect(html).toContain("background: #0f1011"); // panel
    expect(html).toContain("color: #f7f8f8"); // text-primary (heading)
    expect(html).toContain("color: #d0d6e0"); // text-secondary (body)
    // Indigo alpha (link, code background) — one colour only.
    expect(html).toContain("rgba(139,151,255,0.9)");
    // No glow, no scale, no purple-to-pink gradient.
    expect(html).not.toMatch(/linear-gradient/);
    expect(html).not.toMatch(/box-shadow/);
  });

  it("standalone 문서라 정의 안 되는 var(--..) CSS 토큰을 쓰지 않는다 (회귀 가드)", () => {
    // A popout is self-contained HTML outside the app — with no `:root` tokens, `var()` did not
    // resolve and the border silently broke. Literal values only.
    const html = buildDocsVaultPopoutHtml("a", "<p>x</p>");
    expect(html).not.toMatch(/var\(--/);
  });

  it("button display:none — popout 의 호스트 페이지 컨트롤이 노출 안 됨", () => {
    const html = buildDocsVaultPopoutHtml("a", "<button>x</button>");
    expect(html).toContain("button { display: none; }");
  });
});
