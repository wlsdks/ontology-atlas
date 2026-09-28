import { expect, test } from "@playwright/test";
import { waitForAnimationsDone } from "./settle";

/** The page has loaded and its reveals have finished: the painted test reads opacity. */
async function settled(page: import("@playwright/test").Page) {
  await page.waitForLoadState("load");
  await waitForAnimationsDone(page.locator("body"));
}

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

/**
 * The desk width. The narrow widths that first broke (2026-08-07) left this file on 2026-09-27: the
 * one phone check the public gateway keeps is `public-surface-health.spec.ts` at 390.
 */
const WIDTHS = [{ w: 1512, h: 900 }] as const;

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

test.use({ bypassCSP: true });

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
        await settled(page);

        // When a disclosure exists, open it once — reachable in one interaction is not a dead end.
        const summary = page.getByTestId("guide-chapter-picker-summary");
        if ((await summary.count()) > 0 && (await summary.isVisible())) {
          await summary.click();
          await settled(page);
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
        `At this width there is no way to reach the reading material; if the chrome folded it, the page has to offer it instead ` +
          `(GatewayReadingLinks in the footer for the gateway and download, GuideChapterPicker for guide chapters)`,
      ).toEqual([]);
    });
  }
});
