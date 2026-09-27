import { expect, test } from "@playwright/test";

import { waitForAnimationsDone } from "./settle";

/**
 * Responsive overflow sweep (final review 2026-07-25).
 *
 * Every defect the owner reported repeatedly during that wave was the same kind:
 * "Text spilling out of its box, things overlapping,
 * content past the box at the bottom." No automated gate caught them, so they were
 * found by eye every time — and the shortcut sheet's scroll-height regression passed
 * the jsdom unit tests and was only caught at final review.
 *
 * What this spec checks:
 *  1. The document itself does not scroll horizontally (`scrollWidth <=
 *     clientWidth`). Design rule: wide content scrolls inside its own container, so
 *     the page body being pushed sideways is a defect.
 *  2. No interactive or text element leaves the viewport.
 *  3. No two `role="dialog"` are open at once (#62, overlay exclusivity).
 *
 * Widths: 1512 (the installed app's opening window) · 1040×720 (the app's
 * window floor). Phone and tablet widths are not a target (owner direction,
 * 2026-09-27). At each width it sweeps the live surfaces plus download.
 */

const WIDTHS = [
  { label: "14in", width: 1512, height: 900 },
  { label: "app-floor", width: 1040, height: 720 },
] as const;

const ROUTES = [
  "/ko/topology/",
  "/ko/docs/",
  "/ko/ontology/insights/",
  /*
   * ⚠️ **The English strip was never swept** (2026-09-05). This list was Korean-only, and
   * English tab labels are the longer ones — the insights strip measures 783px of content
   * at en against 493px at ko, so every width at which the tab bar could break was a width
   * this sweep did not visit. One route in the other locale is the whole fix.
   */
  "/en/ontology/insights/",
  "/ko/projects/",
  "/ko/download/",
] as const;

const SELECTOR = "button, a, h1, h2, h3, p, li, dt, dd, input, kbd, [role='tab']";

for (const vp of WIDTHS) {
  for (const route of ROUTES) {
    test(`${vp.label} ${vp.width}px — ${route} 가로 오버플로·겹침 없음`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(route === "/ko/docs/" ? "/ko/library/?tab=ontology" : route);
      if (route === "/ko/docs/") {
        await expect(page).toHaveURL(
          (url) => url.pathname === "/ko/library/" && url.searchParams.get("tab") === "ontology",
        );
        await expect(
          page.locator('#library-workspace-tabpanel-ontology [data-docs-viewer]'),
        ).toBeVisible();
      }
      // Canvases and charts have finished their first layout: fetches answered, fonts in, entrances done.
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      await waitForAnimationsDone(page.locator("body"));

      const report = await page.evaluate((selector) => {
        const vw = document.documentElement.clientWidth;
        /*
         * ⚠️ **A horizontal scroller's children are not page overflow** (2026-09-05).
         *
         * This predicate read "any rect past the viewport is a defect", and for a page that
         * is right. Inside a deliberate `overflow-x: auto` strip it is exactly backwards:
         * the tab past the right edge is *how a scrolling strip works*, and the only way to
         * satisfy the old rule was to let the labels wrap — the defect the tab bar was
         * rewritten to stop, and which this sweep had been quietly rewarding.
         *
         * ⚠️ **The exemption is opt-in through `data-scroll-x`, and that is the whole
         * point.** The first attempt keyed on computed `overflow-x`, and CSS computes
         * `overflow-x: visible` to `auto` whenever `overflow-y` is not visible — so the
         * page's own vertical scroll container matched, and a probe that removed
         * `overflow-x-auto` from the tab strip still passed. A gate that cannot go red is
         * not a gate. Only an element that has declared itself a horizontal strip exempts
         * its children, so a new one must say so on purpose.
         */
        const reachableByScrolling = (el: Element): boolean => {
          const strip = el.parentElement?.closest("[data-scroll-x]") ?? null;
          if (!strip) return false;
          if (strip.scrollWidth <= strip.clientWidth + 1) return false;
          const box = strip.getBoundingClientRect();
          // The strip itself must be on screen; only its content may sit past the edge.
          return box.right <= vw + 1 && box.left >= -1;
        };
        const offenders: { tag: string; text: string; left: number; right: number }[] = [];
        for (const el of Array.from(document.querySelectorAll(selector))) {
          const r = el.getBoundingClientRect();
          // Excludes sr-only (1px) and non-rendered elements.
          if (r.width < 2 || r.height < 2) continue;
          if (getComputedStyle(el).visibility === "hidden") continue;
          if (reachableByScrolling(el)) continue;
          if (r.right > vw + 1 || r.left < -1) {
            offenders.push({
              tag: el.tagName,
              text: (el.textContent ?? "").trim().slice(0, 48),
              left: Math.round(r.left),
              right: Math.round(r.right),
            });
          }
        }
        return {
          // `html` and `body` are `overflow-x: hidden`, so `documentElement.scrollWidth`
          // never grows; only `body.scrollWidth` reports content pushed past the edge
          // (the instrument probe in `overflow-sweep.spec.ts` pins that fact).
          docScrollWidth: document.body.scrollWidth,
          docClientWidth: vw,
          offenders: offenders.slice(0, 6),
          offenderCount: offenders.length,
          dialogCount: document.querySelectorAll('[role="dialog"]').length,
        };
      }, SELECTOR);

      expect(
        report.docScrollWidth,
        `문서가 가로로 스크롤됨 (${report.docScrollWidth} > ${report.docClientWidth})`,
      ).toBeLessThanOrEqual(report.docClientWidth + 1);

      expect(
        report.offenderCount,
        `뷰포트를 벗어난 요소: ${JSON.stringify(report.offenders, null, 2)}`,
      ).toBe(0);

      // #62 — zero conflicting overlays open at once. The first-visit auto tour may have one.
      expect(
        report.dialogCount,
        "role=dialog 가 둘 이상 동시에 열려 있음 (#62 오버레이 배타 위반)",
      ).toBeLessThanOrEqual(1);
    });
  }
}
