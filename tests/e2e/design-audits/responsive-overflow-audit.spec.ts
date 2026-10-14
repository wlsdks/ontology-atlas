import { expect, test } from "@playwright/test";

import { waitForAnimationsDone } from "../settle";

/**
 * Sweeps the live surfaces plus download at 1512 and 1040x720 for: no horizontal document scroll
 * (wide content scrolls inside its own container), no interactive or text element leaving the
 * viewport, and no two `role="dialog"` open at once.
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
   * English tab labels are longer (insights strip 783px at en against 493px at ko), so one English
   * route is swept too.
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
         * A horizontal scroller's children are not page overflow. The exemption is opt-in through
         * `data-scroll-x`: CSS computes `overflow-x: visible` to `auto` when `overflow-y` is not visible,
         * so keying on computed `overflow-x` matches the page's own vertical scroll container.
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
