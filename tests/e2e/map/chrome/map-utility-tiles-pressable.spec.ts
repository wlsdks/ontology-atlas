import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "../../desktop-rail-arrival-harness";
import { waitForMapStill } from "../../settle";

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
  // The Flat overview picks no line: the relation card opens inside a domain's realm, entered
  // from its panel, with everything there expanded.
  const domain = await page.evaluate(() => {
    const m = (window as unknown as { __atlasMap: { nodes: () => Array<{ kind: string; hidden: boolean; x: number; y: number }> } }).__atlasMap;
    const c = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    const d = m.nodes().find((n) => !n.hidden && n.kind === "domain" && n.x > 420 && n.x < c.width - 420)!;
    return { x: c.left + d.x, y: c.top + d.y };
  });
  await page.mouse.click(domain.x, domain.y);
  await page.getByTestId("map-detail-panel-more-menu-trigger").click();
  await page.getByTestId("map-detail-panel-action-realm").click();
  await expect(page.getByTestId("topology-realm-chip")).toBeVisible();
  await expect(page.getByTestId("map-detail-panel")).toHaveCount(0);
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
    const nodes = m.nodes() as Array<{ id: string; alpha: number; hidden: boolean; x: number; y: number; radius: number }>;
    const alpha = new Map(nodes.map((n) => [n.id, n.alpha]));
    const insets = (m.obstacleInsets?.() as { left: number; right: number }) ?? { left: 0, right: 0 };
    const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!;
    const rect = canvas.getBoundingClientRect();
    for (const e of m.edges!() as Array<{ sourceId: string; targetId: string; visible: boolean; ax: number; ay: number; bx: number; by: number; controlX: number; controlY: number }>) {
      if (!e.visible) continue;
      if ((alpha.get(e.sourceId) ?? 0) < 0.5 || (alpha.get(e.targetId) ?? 0) < 0.5) continue;
      for (const t of [0.5, 0.25, 0.75]) {
        const x = (1 - t) ** 2 * e.ax + 2 * (1 - t) * t * e.controlX + t ** 2 * e.bx;
        const y = (1 - t) ** 2 * e.ay + 2 * (1 - t) * t * e.controlY + t ** 2 * e.by;
        if (x < insets.left + 20 || x > rect.width - insets.right - 20 || y < 20 || y > rect.height - 20) continue;
        // A real click gives nodes priority; an edge-only probe also reports curves behind them.
        if (nodes.some((n) => !n.hidden && Math.hypot(n.x - x, n.y - y) < n.radius + 14)) continue;
        if (document.elementFromPoint(rect.x + x, rect.y + y) !== canvas) continue;
        const hit = m.edgeAt?.(x, y) as { sourceId: string; targetId: string } | null;
        if (hit?.sourceId !== e.sourceId || hit.targetId !== e.targetId) continue;
        return { x, y };
      }
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
