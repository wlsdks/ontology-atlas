import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

/**
 * **A domain at the canvas floor keeps its name, above the node** (map round,
 * 2026-09-20).
 *
 * The label pass drops any label whose slot below the node falls under the
 * bottom safe band, which is reserved for the readout in the bottom-right
 * corner. Two domains drawn at y 741 of an 806-tall canvas — well inside the
 * picture — therefore stood nameless while every other domain was named. The
 * slot above the node was free and inside the band; it is taken now.
 */
type Probe = {
  nodes: () => Array<{ id: string; hidden: boolean; x: number; y: number; radius: number }>;
  labels: () => Array<{ nodeId: string; minY: number; maxY: number }>;
  selection: () => { nodeId: string | null };
};
const read = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const m = (window as unknown as { __atlasMap?: Probe }).__atlasMap;
    if (!m) return null;
    const box = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    const labels = new Map(m.labels().map((l) => [l.nodeId, l]));
    const domains = m.nodes().filter((n) => !n.hidden && n.id.startsWith("domain:")).map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      top: n.y - n.radius,
      label: labels.get(n.id) ? { minY: labels.get(n.id)!.minY, maxY: labels.get(n.id)!.maxY } : null,
    }));
    const panel = document.querySelector('[data-testid="map-detail-panel"]')?.getBoundingClientRect() ?? null;
    const panelLeft = panel ? panel.left - box.left : Number.POSITIVE_INFINITY;
    return { selection: m.selection().nodeId, canvasHeight: box.height, canvasWidth: box.width, panelLeft, domains };
  });

test("바닥 가까이 그려진 도메인도 이름을 잃지 않는다 — 위쪽 자리로", async ({ page }) => {
  test.setTimeout(120_000);
  // The 14-inch app viewport: this is where the two lowest domains met the floor band.
  await page.setViewportSize({ width: 1512, height: 806 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off&p=capability%3Aexchange-request&open=domain%3Asupport", { waitUntil: "domcontentloaded" });
  await expect.poll(async () => (await read(page))?.selection, { timeout: 15_000 }).toBe("capability:exchange-request");
  await waitForMapStill(page, { what: "camera" });
  const state = (await read(page))!;

  const floorBand = state.canvasHeight - 72;
  const panelLeft = state.panelLeft;
  /*
   * The band, on the canvas, clear of the inspector. Names outside those three
   * are the cull doing its job, and asserting on them sent this spec red twice
   * for the wrong reason — once for nodes past the bottom edge, once for nodes
   * behind the panel.
   */
  const inBand = (d: { x: number; y: number; top: number }) =>
    d.y > floorBand - 40 && d.top > 0 && d.y < state.canvasHeight && d.x < panelLeft;

  const low = state.domains.filter(inBand);
  expect(low.length, "바닥 띠 가까이 그려진 도메인이 없다 — 이 스펙이 공회전한다").toBeGreaterThan(0);

  /*
   * What this can see from outside: a name near the floor is never placed **below**
   * its node, which is where it used to go before it vanished. Whether such a node
   * keeps a name at all is not assertable here — when the slot above is itself
   * outside the safe rect there is nowhere honest to put one, and that case is
   * pinned directly by `render/label-layout.test.ts#floorFlipBaseline`, which also
   * owns the arithmetic this spec can only observe the result of.
   */
  for (const d of low.filter((d) => d.label)) {
    expect(d.label!.maxY, `${d.id} 의 이름이 노드 아래에 남아 있다`).toBeLessThanOrEqual(d.top + 1);
    expect(d.label!.minY, `${d.id} 의 이름이 캔버스 위로 넘어갔다`).toBeGreaterThan(0);
  }
});
