import { expect, test, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { waitForBoxStill, waitForMapStill } from "./settle";

/**
 * **The map's top toolbar spans the free map, it does not pile up on the right**
 * (owner report, 2026-09-24, installed app at about 1512 with INDEX open).
 *
 * The search lane (outline, relayout, view, constellations, search) was centred in
 * whatever the utility lane left over, so with INDEX open both lanes sat in the right
 * half of the map: search at about x 720-925, utility at 985-1300, over a free map
 * running from INDEX's right edge (about 340) to the right edge (about 1260). The
 * left third of the map carried no control at all.
 *
 * The claim is geometric and relative to the free map, the part of the canvas that
 * INDEX (open, or its collapsed tab) does not cover: the search lane starts at the
 * free map's left edge, one chrome inset in, and its centre is out of the right third;
 * the utility lane ends at the free map's right edge. It holds from `xl` (1280), where
 * the lanes share one row; below that they stack and the overlap spec owns the layout.
 */

const WIDTHS = [1280, 1512, 1920] as const;
const HEIGHT = 949;
/** One chrome inset, and no more: the lane sits at the free map's edge, not near it. */
const EDGE_TOLERANCE = 24;

interface LaneReport {
  freeLeft: number;
  freeRight: number;
  search: { left: number; right: number; centre: number } | null;
  utility: { left: number; right: number; centre: number } | null;
}

async function measureLanes(page: Page): Promise<LaneReport> {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? r : null;
    };
    const canvas = rect('[data-testid="ontology-map-canvas"]')!;
    // What covers the map's left side: the open INDEX panel, or its collapsed tab.
    const index = rect('[data-testid="topology-index-panel"]') ?? rect('[data-testid="topology-index-tab"]');
    const freeLeft = Math.max(canvas.left, index ? index.right : canvas.left);
    const freeRight = canvas.right;
    const lane = (selector: string) => {
      const r = rect(selector);
      return r ? { left: r.left, right: r.right, centre: r.left + r.width / 2 } : null;
    };
    return {
      freeLeft,
      freeRight,
      search: lane('[data-testid="topology-search-action-lane"]'),
      utility: lane('[data-testid="topology-utility-action-lane"]'),
    };
  });
}

test("the toolbar's lanes hold the free map's two edges, with INDEX open and collapsed", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1512, height: HEIGHT });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page);
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapStill(page).catch(() => {});

  const failures: string[] = [];
  for (const index of ["expanded", "collapsed"] as const) {
    await page.goto(`/ko/topology/?guides=off&e2e=1${index === "collapsed" ? "&index=collapsed" : ""}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId(index === "expanded" ? "topology-index-panel" : "topology-index-tab")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("topology-utility-action-lane")).toBeVisible({ timeout: 30_000 });
    await waitForMapStill(page).catch(() => {});
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: HEIGHT });
      for (const testId of ["topology-search-action-lane", "topology-utility-action-lane"]) {
        await waitForBoxStill(page.getByTestId(testId), { frames: 10 });
      }
      const report = await measureLanes(page);
      const where = `${width} index=${index}`;
      if (!report.search || !report.utility) {
        failures.push(`${where}: a lane is not drawn (search ${!!report.search}, utility ${!!report.utility})`);
        continue;
      }
      const free = report.freeRight - report.freeLeft;
      const leftGap = report.search.left - report.freeLeft;
      const rightGap = report.freeRight - report.utility.right;
      const rightThird = report.freeLeft + (free * 2) / 3;
      console.log(
        `[balance] ${where} free=[${Math.round(report.freeLeft)}, ${Math.round(report.freeRight)}] ` +
          `search=[${Math.round(report.search.left)}, ${Math.round(report.search.right)}] ` +
          `utility=[${Math.round(report.utility.left)}, ${Math.round(report.utility.right)}] ` +
          `leftGap=${Math.round(leftGap)} rightGap=${Math.round(rightGap)} ` +
          `searchCentre=${Math.round(((report.search.centre - report.freeLeft) / free) * 100)}%`,
      );
      if (process.env.TOOLBAR_SHOTS) {
        await page.screenshot({
          path: `${process.env.TOOLBAR_SHOTS}/balance-${index}-${width}.png`,
          clip: { x: 0, y: 0, width, height: 200 },
        });
      }
      if (leftGap < -0.5 || leftGap > EDGE_TOLERANCE + 0.5) {
        failures.push(`${where}: the search lane starts ${Math.round(leftGap)}px from the free map's left edge`);
      }
      if (rightGap < -0.5 || rightGap > EDGE_TOLERANCE * 2) {
        failures.push(`${where}: the utility lane ends ${Math.round(rightGap)}px from the free map's right edge`);
      }
      if (report.search.centre > rightThird) {
        failures.push(`${where}: the search lane's centre sits in the right third of the free map`);
      }
    }
  }
  expect(failures, failures.join("\n")).toEqual([]);
});
