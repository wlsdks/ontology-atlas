import { describe, expect, it } from "vitest";
import { buildDocsVaultPopoutHtml } from "./popout-template";

describe("buildDocsVaultPopoutHtml", () => {
  it("escapes the title when composing the HTML document", () => {
    const html = buildDocsVaultPopoutHtml(
      `로그인 < script > "spec"`,
      `<article>본문</article>`,
    );
    expect(html).toContain(
      "<title>로그인 &lt; script &gt; &quot;spec&quot;</title>",
    );
    // The caller hands over already-safe HTML.
    expect(html).toContain("<article>본문</article>");
  });

  it("is self-contained with DOCTYPE, lang ko, utf-8 and viewport", () => {
    const html = buildDocsVaultPopoutHtml("a", "<p>x</p>");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="ko">');
    expect(html).toContain('<meta charset="utf-8" />');
    expect(html).toContain("width=device-width,initial-scale=1");
  });

  it("uses only neutral dark colors and one link ink in the body", () => {
    const html = buildDocsVaultPopoutHtml("a", "<p>x</p>");
    // Neutral surface and text colours are the design tokens' literal values (identical to globals.css).
    expect(html).toContain("background: #121211"); // panel
    expect(html).toContain("color: #f3f2ee"); // text-primary (heading)
    expect(html).toContain("color: #d2d0c9"); // text-secondary (body)
    // Indigo alpha (link, code background) — one colour only.
    expect(html).toContain("rgba(160,188,236,0.95)");
    expect(html).not.toMatch(/linear-gradient/);
    expect(html).not.toMatch(/box-shadow/);
  });

  it("uses no var(--...) tokens that a standalone document cannot resolve", () => {
    // Standalone HTML has no `:root` tokens, so `var()` would not resolve.
    const html = buildDocsVaultPopoutHtml("a", "<p>x</p>");
    expect(html).not.toMatch(/var\(--/);
  });

  it("hides host page buttons with display none", () => {
    const html = buildDocsVaultPopoutHtml("a", "<button>x</button>");
    expect(html).toContain("button { display: none; }");
  });
});
