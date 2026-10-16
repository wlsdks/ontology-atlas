import { expect, test } from "@playwright/test";

/**
 * The article must be at least `min(measure, 90% of the page column)` wide,
 * and centred on the page at 1512 and 1920.
 */
const ROUTES = ["/ko/guide/", "/ko/changelog/"] as const;
const WIDTHS = [1040, 1512, 1920] as const;

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

test("changelog entries list version then title on one line each, the full title on hover, no date", async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 900 });
  await page.goto("/ko/changelog/?guides=off", { waitUntil: "domcontentloaded" });
  const entries = page.locator('[data-testid^="entry-nav-"]');
  const rows = await entries.evaluateAll((links) =>
    links.map((a) => {
      const subject = a.lastElementChild as HTMLElement;
      return {
        text: (a.textContent ?? "").trim(),
        version: a.children.length > 1 ? (a.firstElementChild?.textContent ?? "") : null,
        title: a.getAttribute("title") ?? "",
        subject: subject.textContent ?? "",
        height: Math.round(a.getBoundingClientRect().height),
        top: Math.round(a.getBoundingClientRect().top),
      };
    }),
  );
  expect(rows.length, "found no entries; the check would idle").toBeGreaterThan(3);
  expect(rows.filter((row) => /^\d{4}-\d{2}-\d{2}/u.test(row.text) || /^[\s·—–:-]/u.test(row.subject))).toEqual([]);
  expect(rows.filter((row) => row.text !== (row.version ? `${row.version} ${row.subject}` : row.subject))).toEqual([]);
  expect(rows.filter((row) => row.version !== null).length, "no entry carried a version").toBeGreaterThan(0);
  expect(rows.filter((row) => row.title !== row.subject)).toEqual([]);
  expect(new Set(rows.map((row) => row.height)).size, `entry heights ${rows.map((row) => row.height).join(",")}`).toBe(1);
  const pitches = new Set(rows.slice(1).map((row, i) => row.top - rows[i]!.top));
  expect([...pitches], "one pitch down the list").toHaveLength(1);
});

/* The table of contents starts on the brand's line at every width. */
for (const [route, testId] of [
  ["/ko/guide/", "guide-sidebar"],
  ["/ko/changelog/", "entry-sidebar"],
] as const) {
  for (const width of [1280, 1920] as const) {
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
