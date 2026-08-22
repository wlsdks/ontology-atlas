import { expect, test, type ConsoleMessage } from "@playwright/test";

/**
 * Are the public screens **silently broken** — two things: narrow viewports and the
 * console.
 *
 * **This file replaces three** (2026-08-16). There used to be three specs here and
 * **not one of them contained a single assertion**:
 *
 * | File | Lines | `expect` |
 * |---|---:|---:|
 * | `mobile-overflow-check.spec.ts` | 23 | **0** |
 * | `mobile-keyboard-audit.spec.ts` | 89 | **0** |
 * | `ui-audit-v2.spec.ts` | 101 | **0** |
 *
 * All three only gathered values into `console.log` or dropped screenshots in
 * `output/`, so **whatever broke, they were green.** On top of that the first used a
 * widget deleted on 2026-05-03 (`project-knowledge-topology`) as its selector, so
 * there was nothing to measure, and the third swallowed even navigation failures
 * into `console.log` (passing on a 500). This is the repository's rule exactly — **a
 * check that can never turn red is indistinguishable from no check.**
 *
 * What those three gathered was not worthless, so **the gathering was turned into
 * assertions**: horizontal overflow and console errors. A user meets both
 * immediately, and neither is knowable without opening the screen.
 *
 * The third file's shortcut checks (⌘K, ?) were **not discarded** — both are already
 * covered by specs that do assert (`docs-rename-address`, `user-journey-a`,
 * `destination-shortcuts` · `keyboard-path` · `map-keyboard-walk`).
 *
 * **Inventory when switched on: 0.** The six routes below were measured at 390×844
 * with no overflow and no console errors, so this check locks today's state rather
 * than creating new debt.
 */

/** Screens anyone can open without signing in — first impressions are decided here. */
const PUBLIC_ROUTES = [
  "/en/",
  "/en/topology/",
  "/en/docs/",
  "/en/projects/",
  "/en/download/",
  "/en/guide/",
] as const;

/** The phone reference width — the same as the narrowest band this repository's responsive contract measures. */
const PHONE = { width: 390, height: 844 };

/**
 * Noise to filter out.
 *
 * Empty today — the inventory when switching on was 0, so no exemption was needed.
 * When something is added later, **write the reason on that line**: an exemption is
 * the claim "this error is not ours", and an unevidenced claim means the check was
 * quietly switched off.
 */
const IGNORED_CONSOLE: RegExp[] = [];

test.describe("공개 화면 건강 — 좁은 화면과 콘솔", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} — 가로로 넘치지 않고 콘솔이 조용하다`, async ({ page }) => {
      const problems: string[] = [];
      page.on("console", (message: ConsoleMessage) => {
        if (message.type() !== "error") return;
        const text = message.text();
        if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
        problems.push(`console: ${text.slice(0, 200)}`);
      });
      page.on("pageerror", (error: Error) => {
        problems.push(`pageerror: ${error.message.slice(0, 200)}`);
      });

      await page.setViewportSize(PHONE);
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      // ⚠️ The previous specs swallowed navigation failures into `console.log` — passing even on a 500.
      expect(response?.ok(), `${route} 를 열지 못했다 (${response?.status()})`).toBe(true);
      await page.waitForTimeout(1_200);

      const width = await page.evaluate(() => ({
        /*
         * ⚠️ **Do not measure with `documentElement.scrollWidth`** — this app sets
         * `overflow-x: hidden` on `html` and `body`, so that value **always** equals
         * `clientWidth`. The first version using it stayed green even with a 2000px
         * element planted on purpose — **a check that could never turn red**, the same
         * illness as the three specs this file replaced.
         *
         * `body.scrollWidth` really does reflect overflowing content (the planted
         * 2000px was caught as is). And it does not catch things like a label clipped
         * inside its own box — correctly, since that is that box's business rather than
         * page overflow.
         */
        scroll: document.body.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      /*
       * The 1px slack covers sub-pixel rounding. Beyond that, content pushed off screen
       * is clipped and becomes unreachable, which breaks this repository's rule that wide
       * content scrolls inside its own box.
       */
      expect(
        width.scroll,
        `${route} 가 ${PHONE.width}px 에서 가로로 넘친다 (${width.scroll} > ${width.client}). ` +
          "표·코드블록·도해처럼 넓은 것은 자기 상자 안에서 스크롤해야 한다.",
      ).toBeLessThanOrEqual(width.client + 1);

      expect(problems, `${route} 에서 콘솔 오류가 났다:\n  ${problems.join("\n  ")}`).toEqual([]);
    });
  }
});
