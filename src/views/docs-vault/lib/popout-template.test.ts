import { describe, expect, it } from "vitest";
import { buildDocsVaultPopoutHtml } from "./popout-template";

describe("buildDocsVaultPopoutHtml", () => {
  it("title 을 escape 해 안전한 HTML 문서 합성", () => {
    const html = buildDocsVaultPopoutHtml(
      `로그인 < script > "spec"`,
      `<article>본문</article>`,
    );
    // title 은 escape 됨
    expect(html).toContain(
      "<title>로그인 &lt; script &gt; &quot;spec&quot;</title>",
    );
    // 본문은 그대로 (호출자가 outerHTML 로 이미 안전한 HTML 전달 가정)
    expect(html).toContain("<article>본문</article>");
  });

  it("self-contained — DOCTYPE / lang ko / utf-8 / viewport 모두 포함", () => {
    const html = buildDocsVaultPopoutHtml("a", "<p>x</p>");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="ko">');
    expect(html).toContain('<meta charset="utf-8" />');
    expect(html).toContain("width=device-width,initial-scale=1");
  });

  it("body 안 dark theme 무채색 + 인디고 alpha 만 (헌장 §11)", () => {
    const html = buildDocsVaultPopoutHtml("a", "<p>x</p>");
    // dark canvas
    expect(html).toContain("background: #0d0e12");
    // 인디고 alpha (linkc / code bg)
    expect(html).toContain("rgba(139,151,255,0.9)");
    // glow / scale / 보라핑크 그라디언트 없음
    expect(html).not.toMatch(/linear-gradient/);
    expect(html).not.toMatch(/box-shadow/);
  });

  it("button display:none — popout 의 호스트 페이지 컨트롤이 노출 안 됨", () => {
    const html = buildDocsVaultPopoutHtml("a", "<button>x</button>");
    expect(html).toContain("button { display: none; }");
  });
});
