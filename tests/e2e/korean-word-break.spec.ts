import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **Korean sentences must not break mid-word** (2026-08-12).
 *
 * ## Where it came from
 *
 * Looking at the insights screen (`/ontology/insights`) by eye showed
 * "…for I / am doing" — the word "divided" split across two lines. The cause was
 * `word-break: normal` on that paragraph, while this repository already used
 * `break-keep` elsewhere: the spec existed but was not applied there.
 *
 * ## A layer lint cannot see in principle
 *
 * The violation **leaves no value in the code**: not using `break-keep` is the
 * *absence* of a class, and absence cannot be caught by a selector (demanding that
 * class on all several thousand paragraphs would be noise, not a spec). And the real
 * criterion is not the class but **whether it actually broke** — with enough width,
 * `normal` does not break either.
 *
 * ## How it is measured
 *
 * A `Range` is taken per character to read its y coordinate, and at each y change (a
 * line break) the **characters on either side** are examined. If both are Hangul with
 * no space between them, the break is mid-word. Breaks at a space are correct and are
 * not counted.
 *
 * ## Idling guard
 *
 * "0 broken places" is also true **when no line ever wrapped**. So this spec asserts
 * a second number alongside: how many multi-line Korean sentences were actually
 * seen. Zero means nothing was measured (`/gate-probe`).
 */

const ROUTES = [
  "/ko/ontology/insights/",
  "/ko/agents/",
  "/ko/projects/",
  "/ko/docs/",
  "/ko/",
  /*
   * Project detail (grade S in the 2026-08-12 inventory). **The slug query is
   * required**: bare `/ko/project/fallback/` makes `resolveProjectFallbackRoute`
   * return null and redirects to `/projects`, so without it this route would idle by
   * measuring `/ko/projects/` above a second time. `storefront` is the build-time
   * dogfood demo project, always present even without a vault. 4 breaks measured here:
   * body markdown 「cart」 · the empty-connections state 「appears here」
   * (280px) · the handoff 「map of this project」 (362px) · one more.
   */
  "/ko/project/fallback/?slug=storefront",
  /*
   * 404 (inventory: 「will change」 at 382px). The address must actually render a 404 —
   * dev renders the root `app/not-found.tsx` for unresolved paths, and the static
   * export serves the `/404.html` built from the same component via
   * `scripts/serve-static-export.mjs` (locale is detected client-side from the first
   * URL segment → Korean copy).
   * ⚠️ `/ko/project/<missing-slug>/` cannot be used — in dev the dynamic [slug] route
   * returns 500 rather than 404 (output:'export' with an ungenerated param, measured
   * 2026-08-12).
   */
  "/ko/이런-주소는-없다/",
] as const;

interface BreakScan {
  readonly midWord: { text: string; at: string; wordBreak: string; width: number }[];
  readonly wrappedTexts: number;
}

async function scan(page: import("@playwright/test").Page): Promise<BreakScan> {
  return page.evaluate(() => {
    const midWord: { text: string; at: string; wordBreak: string; width: number }[] = [];
    let wrappedTexts = 0;
    const root = document.querySelector("main") ?? document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent ?? "";
      if (text.trim().length < 24 || !/[가-힣]/.test(text)) continue;
      const parent = node.parentElement;
      if (!parent) continue;
      const style = getComputedStyle(parent);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) < 0.05) continue;
      if (parent.closest("details:not([open])")) continue;

      const range = document.createRange();
      let previousY: number | null = null;
      let wrapped = false;
      for (let index = 0; index < text.length; index += 1) {
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = range.getBoundingClientRect();
        if (rect.height === 0) continue;
        const y = Math.round(rect.y);
        if (previousY !== null && y > previousY + 2) {
          wrapped = true;
          const before = text[index - 1] ?? "";
          const after = text[index] ?? "";
          if (before.trim() && after.trim() && /[가-힣]/.test(before) && /[가-힣]/.test(after)) {
            midWord.push({
              text: `${text.slice(Math.max(0, index - 14), index)}|${text.slice(index, index + 14)}`,
              at: `${before}|${after}`,
              wordBreak: style.wordBreak,
              width: Math.round(parent.getBoundingClientRect().width),
            });
          }
        }
        previousY = y;
      }
      if (wrapped) wrappedTexts += 1;
    }
    return { midWord, wrappedTexts };
  });
}

test("한국어 문장이 단어 중간에서 끊기지 않는다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);

  const offenders: string[] = [];
  let wrappedTotal = 0;

  for (const route of ROUTES) {
    // Appending `?guides=off` verbatim to a route that already has a query (`?slug=`)
    // produces `?…?…` and breaks the slug — the separator is chosen from the route's
    // shape.
    const separator = route.includes("?") ? "&" : "?";
    await page.goto(`${route}${separator}guides=off`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_800);
    const result = await scan(page);
    wrappedTotal += result.wrappedTexts;
    for (const hit of result.midWord) {
      offenders.push(`${route} 「${hit.text}」 (${hit.at}) · word-break=${hit.wordBreak} · 폭 ${hit.width}`);
    }
  }

  console.log(`[word-break] 여러 줄로 접힌 한국어 문장 ${wrappedTotal}개 · 단어 중간 끊김 ${offenders.length}건`);

  /*
   * Idling guard: with no line break ever observed, "0 breaks" is not evidence.
   *
   * ⚠️ **The threshold is 0** — pinning 3 because the measurement was 3 would turn this
   * red on the day a line of copy gets shorter and stops wrapping, while the product is
   * fine. The property to lock is "did it look at all", not "how many did it see".
   */
  expect(
    wrappedTotal,
    `여러 줄로 접힌 한국어 문장을 하나도 못 봤다 — 이 스펙이 아무것도 재지 않았다`,
  ).toBeGreaterThan(0);

  expect(
    offenders,
    `한국어가 단어 중간에서 끊겼다. 그 문단에 \`break-keep\` 을 붙여라:\n${offenders.join("\n")}`,
  ).toEqual([]);
});
