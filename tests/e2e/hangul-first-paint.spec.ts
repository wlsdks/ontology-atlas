import { test, expect } from "@playwright/test";

/**
 * The Korean line rule applies on the first paint, not after hydration.
 *
 * `:root:lang(ko) body { word-break: keep-all }` (app/globals.css) only matches once
 * `<html lang>` says `ko`. The root layout sits above `[locale]` and ships `lang="en"`;
 * the effect in `LocaleHtmlLang` flips it only after hydration, so a `/ko/*` page used to
 * paint its first frame with syllable breaks and reflow once. The inline boot script
 * (`accent-boot-script.tsx`, `LANG_BOOT`) now plants the locale from the path before the
 * body is parsed.
 *
 * **How this proves "before the first paint"**: every external script is aborted, so no
 * React runs, no effect fires, and hydration never happens. What remains is the served HTML,
 * its stylesheets and the one inline boot script — exactly what the first frame is drawn from.
 * If `lang` and the computed `word-break` are right there, they were right on the first paint.
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
