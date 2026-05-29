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

  it("body 안 dark theme 무채색 + 인디고 alpha 만", () => {
    const html = buildDocsVaultPopoutHtml("a", "<p>x</p>");
    // 무채색 surface/텍스트는 design token 리터럴 값 (globals.css 와 동일)
    expect(html).toContain("background: #0f1011"); // panel
    expect(html).toContain("color: #f7f8f8"); // text-primary (heading)
    expect(html).toContain("color: #d0d6e0"); // text-secondary (body)
    // 인디고 alpha (link / code bg) — 단일 채색
    expect(html).toContain("rgba(139,151,255,0.9)");
    // glow / scale / 보라핑크 그라디언트 없음
    expect(html).not.toMatch(/linear-gradient/);
    expect(html).not.toMatch(/box-shadow/);
  });

  it("standalone 문서라 정의 안 되는 var(--..) CSS 토큰을 쓰지 않는다 (회귀 가드)", () => {
    // popout 은 앱 밖 self-contained HTML — :root 토큰이 없어 var() 가
    // 해석 안 돼 border 가 조용히 깨졌던 회귀. 리터럴 값만 허용.
    const html = buildDocsVaultPopoutHtml("a", "<p>x</p>");
    expect(html).not.toMatch(/var\(--/);
  });

  it("button display:none — popout 의 호스트 페이지 컨트롤이 노출 안 됨", () => {
    const html = buildDocsVaultPopoutHtml("a", "<button>x</button>");
    expect(html).toContain("button { display: none; }");
  });
});
