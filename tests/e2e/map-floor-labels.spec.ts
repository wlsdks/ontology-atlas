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
      y: n.y,
      top: n.y - n.radius,
      label: labels.get(n.id) ? { minY: labels.get(n.id)!.minY, maxY: labels.get(n.id)!.maxY } : null,
    }));
    return { selection: m.selection().nodeId, canvasHeight: box.height, domains };
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
  const low = state.domains.filter((d) => d.y > floorBand - 40);
  expect(low.length, "바닥 띠 가까이 그려진 도메인이 없다 — 이 스펙이 공회전한다").toBeGreaterThan(0);
  await expect
    .poll(async () => (await read(page))!.domains.filter((d) => !d.label).map((d) => d.id), { timeout: 15_000, message: "이름을 잃은 도메인" })
    .toEqual([]);
  const after = (await read(page))!;
  for (const d of after.domains.filter((d) => d.y > floorBand - 40)) {
    // Above the node, inside the canvas.
    expect(d.label!.maxY, `${d.id} 의 이름이 노드 위에 있지 않다`).toBeLessThanOrEqual(d.top + 1);
    expect(d.label!.minY).toBeGreaterThan(0);
  }
});
