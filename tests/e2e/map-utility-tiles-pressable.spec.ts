import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { waitForMapStill } from "./settle";

/**
 * **A tile a person can see is a tile a person can press.**
 *
 * The four map utilities (fit, tour, shortcuts, replay) sit on the right rail, the
 * same column the relation card opens into. Their render guards asked for
 * `selectedRelationActive`, a flag nothing in the screen ever sets to `true`, so
 * with a relation card up all four kept drawing underneath it. Measured at
 * 1512x982 with the card at [1180, 32, 300, 335]: `elementFromPoint` returned the
 * card at the centre of 4 of 4 tiles, while each tile still had opacity 1 and
 * `pointer-events: auto` — visible through the card's translucent surface and
 * dead to the pointer.
 *
 * The invariant is written as a rule rather than a count: whatever the state, a
 * utility tile that is on screen answers to a click at its own centre.
 */
test("no map utility tile is left visible under an open panel", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page);
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapStill(page);
  await page.getByTestId("topology-expand-all").click();
  await waitForMapStill(page);

  const tiles = () =>
    page.evaluate(() => {
      const rail = document.querySelector<HTMLElement>('[data-testid="topology-utility-rail"]');
      const buttons = rail ? [...rail.querySelectorAll<HTMLElement>("button, a")] : [];
      return buttons.map((b) => {
        const r = b.getBoundingClientRect();
        const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return {
          label: (b.getAttribute("aria-label") ?? "").trim(),
          covered: !(b.contains(el) || el === b),
          coveredBy: (el?.closest("[data-testid]") as HTMLElement | null)?.dataset.testid ?? el?.tagName ?? "none",
        };
      });
    });

  // With nothing open the tiles are there and every one answers to its own centre.
  const resting = await tiles();
  expect(resting.length, "지도 유틸리티 타일이 하나도 없다").toBeGreaterThan(0);
  expect(resting.filter((t) => t.covered), JSON.stringify(resting)).toEqual([]);

  // Open the relation card by clicking a drawn relation's own curve.
  const box = (await page.locator("canvas").first().boundingBox())!;
  const point = await page.evaluate(() => {
    const m = (window as unknown as { __atlasMap?: Record<string, (...a: unknown[]) => unknown> }).__atlasMap!;
    const alpha = new Map((m.nodes() as Array<{ id: string; alpha: number }>).map((n) => [n.id, n.alpha]));
    const insets = (m.obstacleInsets?.() as { left: number; right: number }) ?? { left: 0, right: 0 };
    const rect = document.querySelector("canvas")!.getBoundingClientRect();
    for (const e of m.edges!() as Array<{ sourceId: string; targetId: string; visible: boolean; ax: number; ay: number; bx: number; by: number; controlX: number; controlY: number }>) {
      if (!e.visible) continue;
      if ((alpha.get(e.sourceId) ?? 0) < 0.5 || (alpha.get(e.targetId) ?? 0) < 0.5) continue;
      // The drawn quadratic's midpoint, so the click lands on the curve, not its chord.
      const x = 0.25 * e.ax + 0.5 * e.controlX + 0.25 * e.bx;
      const y = 0.25 * e.ay + 0.5 * e.controlY + 0.25 * e.by;
      if (x < insets.left + 20 || x > rect.width - insets.right - 20 || y < 20 || y > rect.height - 20) continue;
      return { x: Math.round(x), y: Math.round(y) };
    }
    return null;
  });
  expect(point, "그릴 수 있는 관계선을 못 찾았다").not.toBeNull();
  await page.mouse.click(box.x + point!.x, box.y + point!.y);
  await waitForMapStill(page);
  await expect(page.getByTestId("map-edge-panel")).toBeVisible();

  const withCard = await tiles();
  expect(withCard.filter((t) => t.covered), JSON.stringify(withCard)).toEqual([]);
});
