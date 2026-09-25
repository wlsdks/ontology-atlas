import { expect, test } from "@playwright/test";

/**
 * **The reading column keeps its measure at laptop widths.**
 *
 * Measured 2026-09-25: the guide and changelog grid turned on at `lg` (1024) as
 * `15rem · 1fr · 15rem` inside a page column the 200px gateway gutter had already cut to
 * 640px at 1040. The article was **64px** wide at 1040 (a Korean title broke two syllables
 * per line, the changelog grew to 133,603px) and 304px at 1280. Nothing failed because
 * every class was legitimate on its own; the defect is the sum of three widths.
 *
 * The article must be at least `min(measure, 90% of the page column)` wide, and at 1512 and
 * 1920 it must still sit on the page's true centre (the owner's "bunched on the left" fix).
 */
const ROUTES = ["/ko/guide/", "/ko/changelog/"] as const;
const WIDTHS = [1040, 1280, 1512, 1920] as const;

for (const route of ROUTES) {
  for (const width of WIDTHS) {
    test(`${route} at ${width}: the article keeps its measure`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      const article = page.getByTestId("gateway-doc-body");
      await expect(article).toBeVisible();

      const m = await article.evaluate((el) => {
        const measure = parseFloat(getComputedStyle(el).maxWidth);
        const column = el.closest("main")?.firstElementChild?.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        return {
          measure,
          columnWidth: column?.width ?? 0,
          width: box.width,
          centre: box.x + box.width / 2,
          viewport: window.innerWidth,
        };
      });

      expect(m.measure, "the measure did not resolve; the check would idle").toBeGreaterThan(400);
      expect(m.columnWidth).toBeGreaterThan(0);
      const floor = Math.min(m.measure, m.columnWidth * 0.9);
      expect(m.width, `article ${m.width}px under the floor ${floor}px`).toBeGreaterThanOrEqual(floor - 1);
      if (width >= 1512) {
        expect(Math.abs(m.centre - m.viewport / 2), "the prose left the page centre").toBeLessThanOrEqual(2);
      }
    });
  }
}

test("changelog entry titles never start with the date separator", async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 900 });
  await page.goto("/ko/changelog/?guides=off", { waitUntil: "domcontentloaded" });
  const titles = await page
    .locator('[data-testid^="entry-nav-"] span.line-clamp-2')
    .allTextContents();
  expect(titles.length, "found no entry titles; the check would idle").toBeGreaterThan(3);
  expect(titles.filter((title) => /^[\s·—–-]/u.test(title))).toEqual([]);
});

/*
 * The table of contents shares the brand's start line. With the list end-aligned in its
 * `1fr` track it began at x=381 at 1920 while the brand began at 200, so its left edge moved
 * with the viewport (review of PR #1839); on the gutter it matches at every width.
 */
for (const [route, testId] of [
  ["/ko/guide/", "guide-sidebar"],
  ["/ko/changelog/", "entry-sidebar"],
] as const) {
  for (const width of [1280, 1512, 1920] as const) {
    test(`${route} at ${width}: the table of contents starts on the brand's line`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
      const toc = page.getByTestId(testId);
      await expect(toc).toBeVisible();
      const brandX = await page.getByTestId("gateway-brand-mark").evaluate((el) => el.getBoundingClientRect().x);
      const tocX = await toc.evaluate((el) => el.getBoundingClientRect().x);
      expect(brandX).toBeGreaterThan(0);
      expect(Math.abs(tocX - brandX), `toc ${tocX} vs brand ${brandX}`).toBeLessThanOrEqual(12);
    });
  }
}
