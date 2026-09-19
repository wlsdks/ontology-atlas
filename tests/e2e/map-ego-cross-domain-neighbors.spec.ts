import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

/**
 * **The ego graph draws every neighbour, including the ones another folded
 * domain holds** (map round, 2026-09-19).
 *
 * Measured before the fix: selecting the exchange-request capability opened
 * its panel, which listed three relations (one parent, one user, two
 * dependencies), while the map drew only the ones inside its own domain. The
 * two dependencies lived in folded domains (fulfillment, inventory), so their
 * nodes and lines were absent and the picture said "this needs nothing from
 * elsewhere". The density gate now holds a focused node's cross-parent
 * neighbours open, and each folded parent's chip claims only what still folds.
 */
type Probe = {
  nodes: () => Array<{ id: string; hidden: boolean; alpha: number }>;
  edges: () => Array<{ sourceId: string; targetId: string }>;
  labels: () => Array<{ nodeId: string }>;
  chips: () => Array<{ parentId: string; claimedCount: number; expanded: boolean; shownChildren: number }>;
  selection: () => { nodeId: string | null };
};
const read = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const m = (window as unknown as { __atlasMap?: Probe }).__atlasMap;
    if (!m) return null;
    const node = (id: string) => m.nodes().find((n) => n.id === id) ?? null;
    const labeled = new Set(m.labels().map((l) => l.nodeId));
    const edge = (a: string, b: string) => m.edges().some((e) => (e.sourceId === a && e.targetId === b) || (e.sourceId === b && e.targetId === a));
    return {
      selection: m.selection().nodeId,
      pickup: node("capability:return-pickup"),
      reserve: node("capability:stock-reservation"),
      pickupLabeled: labeled.has("capability:return-pickup"),
      reserveLabeled: labeled.has("capability:stock-reservation"),
      pickupEdge: edge("capability:exchange-request", "capability:return-pickup"),
      reserveEdge: edge("capability:exchange-request", "capability:stock-reservation"),
      fulfillmentChip: m.chips().find((c) => c.parentId === "domain:fulfillment") ?? null,
    };
  });

test("선택한 개념이 다른 도메인에 접힌 이웃도 지도에 나온다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await waitForMapStill(page);
  const before = (await read(page))!;
  expect(before.fulfillmentChip, "배송 칩이 없다 — 픽스처가 바뀌었다").not.toBeNull();
  expect(before.pickup?.hidden, "배송이 접혀 있으면 반품 회수는 숨어 있어야 한다").toBe(true);

  await page.goto("/ko/topology/?e2e=1&guides=off&p=capability%3Aexchange-request&open=domain%3Asupport", { waitUntil: "domcontentloaded" });
  await expect.poll(async () => (await read(page))?.selection, { timeout: 15_000 }).toBe("capability:exchange-request");
  // Under a selection the focus ring keeps breathing, so node stillness never
  // arrives; the camera coming to rest is the frame this spec reads.
  await waitForMapStill(page, { what: "camera" });
  const after = (await read(page))!;
  // The camera has arrived: the focus target lies inside the leash the physics
  // keeps around the focused node, so the spring settles and the idle gate can
  // close. Before, the target sat 370 world units out and the loop ran at full
  // frame rate for as long as the node stayed selected.
  const gap = await page.evaluate(() => {
    const m = (window as unknown as { __atlasMap: { camera: () => { x: number; y: number }; cameraTarget: () => { x: number; y: number } } }).__atlasMap;
    const c = m.camera();
    const t = m.cameraTarget();
    return Math.hypot(c.x - t.x, c.y - t.y);
  });
  expect(gap, "카메라가 목표에 닿지 못하고 있다").toBeLessThan(0.5);

  // Both dependencies are drawn, named, and joined to the focus by their line.
  expect(after.pickup?.hidden, "반품 회수(배송)가 숨어 있다").toBe(false);
  expect(after.reserve?.hidden, "재고 선점(재고)가 숨어 있다").toBe(false);
  expect(after.pickupEdge, "교환 접수 → 반품 회수 선이 없다").toBe(true);
  expect(after.reserveEdge, "교환 접수 → 재고 선점 선이 없다").toBe(true);
  expect(after.pickupLabeled, "반품 회수 이름이 없다").toBe(true);
  expect(after.reserveLabeled, "재고 선점 이름이 없다").toBe(true);
  // The folded parent's chip claims only what still folds: one fewer.
  expect(after.fulfillmentChip?.claimedCount, "배송 칩이 보이는 자식까지 접혔다고 주장한다").toBe(before.fulfillmentChip!.claimedCount - 1);
  expect(after.fulfillmentChip?.shownChildren).toBe(1);
});
