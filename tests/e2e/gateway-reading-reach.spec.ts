import { expect, test } from "@playwright/test";

/**
 * **Is the gateway's reading material reachable on narrow screens?**
 *
 * **What happened** (measured 2026-08-07, static export, no vault):
 *
 * | | 1512 | 768 | 390 |
 * |---|---|---|---|
 * | Guide and changelog links visible on `/ko/` | 1·1 | 1·1 | **0·0** |
 * | Guide chapters visible on `/ko/guide/*` | 13 | **1** | **0** |
 *
 * For someone who received a link on a phone and opened one guide chapter, the 13
 * chapters were **13 dead ends with no way between them**. Two of those chapters are
 * "connect your agent" and "CLI", so what was blocked is not reading material but
 * **the path to attaching an agent**.
 *
 * **Why code cannot catch it.** The violation **leaves no value in the code.** Both
 * `hidden … sm:flex` and `hidden lg:block` are legitimate responsive notation on
 * their own, and the defect is **a relation between different files**: is there a
 * replacement after the collapse? Two code comments actually promised a replacement
 * and **both were false** — the chrome's "guide" chip (which collapses below `sm`
 * too) and the gateway footer (zero links at any width). **A comment is not a gate.**
 *
 * **What is measured**: not "is it visible" but **"is it reachable"**. A link inside
 * a closed disclosure is correctly invisible but is not a dead end, so when a
 * disclosure exists it is **opened once** and the count retaken. Reachable in one
 * interaction passes.
 */

/** The four gateway surfaces. This list is the reach. */
const GATEWAY_ROUTES = [
  "/ko/",
  "/ko/download/",
  "/ko/guide/",
  "/ko/guide/connect-agent/",
  "/ko/changelog/",
] as const;

/** The narrow widths were the problem — wide is measured alongside to distinguish "it was never there". */
const WIDTHS = [
  { w: 1512, h: 900 },
  { w: 768, h: 1024 },
  { w: 390, h: 844 },
] as const;

const PAINTED = `(el) => {
  const c = getComputedStyle(el);
  const b = el.getBoundingClientRect();
  if (b.width < 2 || b.height < 2) return false;
  if (c.visibility === 'hidden' || c.display === 'none' || Number(c.opacity) < 0.05) return false;
  if (el.closest('details:not([open])')) return false;
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const cc = getComputedStyle(n);
    if (cc.display === 'none' || cc.visibility === 'hidden') return false;
  }
  return true;
}`;

/**
 * ⚠️ **Do not count "links containing /guide"** — a probe caught this hole.
 *
 * The first version counted that way, and deleting the guide-chapter disclosure
 * entirely still left 768 and 390 **green**: the single `/guide` (index) link in the
 * reading row at the bottom of the page counted as "the guide is reachable". So the
 * check passed while **no chapter was reachable at all**. The fact being guarded is
 * not "the word guide appears as a link somewhere" but **"another chapter can be
 * reached"**, so the counted unit becomes **distinct chapters**.
 */
const countReading = (page: import("@playwright/test").Page) =>
  page.evaluate((src: string) => {
    const painted = eval(src) as (el: Element) => boolean;
    const hrefs = [...document.querySelectorAll('a[href]')]
      .filter(painted)
      .map((a) => (a.getAttribute("href") ?? "").split(/[?#]/)[0].replace(/\/$/, ""));
    const chapters = new Set(
      hrefs.map((h) => /^\/(?:ko|en)\/guide\/([^/]+)$/.exec(h)?.[1]).filter(Boolean) as string[],
    );
    return {
      guide: hrefs.filter((h) => h.includes("/guide")).length,
      chapters: chapters.size,
      changelog: hrefs.filter((h) => h.includes("/changelog")).length,
    };
  }, PAINTED);

test.describe("관문 읽을거리 — 좁은 화면에서도 닿는다", () => {
  for (const { w, h } of WIDTHS) {
    test(`${w}×${h} — 관문 표면 어디서든 가이드와 변경 내역에 닿는다`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: w, height: h });

      const dead: string[] = [];
      let measured = 0;

      for (const route of GATEWAY_ROUTES) {
        await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(700);

        // When a disclosure exists, open it once — reachable in one interaction is not a dead end.
        const summary = page.getByTestId("guide-chapter-picker-summary");
        if ((await summary.count()) > 0 && (await summary.isVisible())) {
          await summary.click();
          await page.waitForTimeout(250);
        }

        const seen = await countReading(page);
        measured += 1;
        if (seen.guide < 1) dead.push(`${route} → 가이드 0`);
        if (seen.changelog < 1) dead.push(`${route} → 변경 내역 0`);
        // Inside the guide, **another chapter must be reachable**. A single index link does
        // not count as reaching the guide — that was the hole described above.
        if (route.startsWith("/ko/guide") && seen.chapters < 5) {
          dead.push(`${route} → 갈 수 있는 장 ${seen.chapters}개 (차례가 없다)`);
        }
      }

      // Idling guard — if no route opened at all, the 0 below does not mean "clean".
      expect(measured, "관문 라우트를 하나도 안 쟀다").toBe(GATEWAY_ROUTES.length);

      expect(
        dead,
        `이 폭에서 읽을거리에 닿을 길이 없다 — 크롬이 접었으면 판이 대신 내야 한다 ` +
          `(관문/내려받기는 푸터의 GatewayReadingLinks, 가이드 장은 GuideChapterPicker)`,
      ).toEqual([]);
    });
  }

  /**
   * There is **one table of contents** — the wide sidebar and the narrow disclosure
   * must render the same list. Two copies means adding a chapter grows only one.
   */
  test("좁은 폭 차례가 넓은 폭 차례와 같은 장을 담는다", async ({ page }) => {
    const chapters = async () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-testid^="guide-nav-"]')].map((a) =>
          a.getAttribute("data-testid"),
        ),
      );

    await page.setViewportSize({ width: 1512, height: 900 });
    await page.goto("/ko/guide/connect-agent/?guides=off", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);
    const wide = [...new Set(await chapters())].sort();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ko/guide/connect-agent/?guides=off", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);
    await page.getByTestId("guide-chapter-picker-summary").click();
    await page.waitForTimeout(250);
    const narrow = [...new Set(await chapters())].sort();

    expect(wide.length, "넓은 폭에서 장을 못 찾았다 — 이 시험이 헛돈다").toBeGreaterThan(5);
    expect(narrow, "좁은 폭 차례가 넓은 폭과 다른 장을 담는다 — 목록이 두 벌이 됐다").toEqual(wide);
  });
});
