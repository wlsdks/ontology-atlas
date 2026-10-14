import { test, expect } from "@playwright/test";

/**
 * Every external script is aborted so no React runs: what remains is the HTML, stylesheets and
 * inline boot script the first frame is drawn from.
 */
async function firstPaintState(page: import("@playwright/test").Page, path: string) {
  await page.route(/\.m?js(\?.*)?$/, (route) => route.abort());
  await page.goto(path, { waitUntil: "load" });
  return page.evaluate(() => ({
    lang: document.documentElement.lang,
    wordBreak: getComputedStyle(document.body).wordBreak,
    overflowWrap: getComputedStyle(document.body).overflowWrap,
    // A stylesheet must have applied, or a `normal` reading would prove nothing.
    styled: getComputedStyle(document.body).display === "flex",
  }));
}

test.describe("Korean keeps its words whole from the first frame", () => {
  test("/ko: lang is ko and body keeps words before any script runs", async ({ page }) => {
    const state = await firstPaintState(page, "/ko/download/");
    expect(state.styled, "globals.css did not apply — the reading below would be vacuous").toBe(true);
    expect(state.lang, "the static HTML still says lang=en on a /ko page before hydration").toBe("ko");
    expect(state.wordBreak).toBe("keep-all");
    expect(state.overflowWrap).toBe("break-word");
  });

  test("/en: lang stays en and the rule stays off", async ({ page }) => {
    const state = await firstPaintState(page, "/en/download/");
    expect(state.styled).toBe(true);
    expect(state.lang).toBe("en");
    expect(state.wordBreak).toBe("normal");
  });
});
