import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

/**
 * **Opening a fan near an edge reframes, so the fan is on screen** (2026-09-21).
 *
 * The promise a person can check: after the expand, every node the press revealed stands
 * inside the canvas minus the live obstacle insets — the same `measureCanvasInsets` the
 * camera itself consumes, so this spec cannot drift from the product's own idea of what
 * is visible.
 *
 * ⚠️ **What this spec does and does not prove.** It was written for a report of a fan
 * opening crushed against the top edge at 1200×863, and that state did not reproduce on
 * either bundled sample: planting the pre-2026-09-21 cluster-dive target back into a
 * running build left this measurement unchanged, because a double-click also selects,
 * and the selection dive runs a frame later and lands last. So this is a standing
 * barrier for the invariant, not the evidence for the dive's own framing. The dive is
 * the camera a chip press moves on its own, and `topology-camera-math.ts` carries why it
 * now measures the visible region like every other fit.
 */
type Node = { id: string; hidden: boolean; label: string; x: number; y: number; radius: number };
type Probe = {
  nodes: () => Node[];
  chips: () => Array<{ parentId: string; claimedCount: number; expanded: boolean; shownChildren: number }>;
  camera: () => { x: number; y: number; scale: number };
  obstacleInsets: () => { left: number; right: number } | null;
  interaction: () => { kind: string; nodeId: string | null };
};

const PARENT = "domain:order";

const read = (page: import("@playwright/test").Page) => ({
  canvasBox: () =>
    page.evaluate(() => {
      const box = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
      return { left: box.left, top: box.top, width: box.width, height: box.height };
    }),
  visible: () =>
    page.evaluate(() =>
      (window as unknown as { __atlasMap: Probe }).__atlasMap
        .nodes()
        .filter((n) => !n.hidden)
        .map((n) => ({ id: n.id, x: n.x, y: n.y, radius: n.radius, label: n.label })),
    ),
  chip: () =>
    page.evaluate(
      (parent) => (window as unknown as { __atlasMap: Probe }).__atlasMap.chips().find((c) => c.parentId === parent) ?? null,
      PARENT,
    ),
  camera: () => page.evaluate(() => (window as unknown as { __atlasMap: Probe }).__atlasMap.camera()),
  insets: () => page.evaluate(() => (window as unknown as { __atlasMap: Probe }).__atlasMap.obstacleInsets()),
  parentAt: () =>
    page.evaluate((parent) => {
      const m = (window as unknown as { __atlasMap: Probe }).__atlasMap;
      const box = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
      const n = m.nodes().find((n) => n.id === parent && !n.hidden);
      return n ? { px: box.left + n.x, py: box.top + n.y, x: n.x, y: n.y } : null;
    }, PARENT),
});

test("가장자리에서 펼치면 카메라가 한 번 다시 잡아, 펼친 자식이 전부 보이는 자리에 선다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1200, height: 863 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await waitForMapStill(page);
  const probe = read(page);

  const before = await probe.chip();
  expect(before, "주문 칩이 없다 — 이 스펙이 공회전한다").not.toBeNull();
  expect(before!.expanded).toBe(false);
  expect(before!.claimedCount).toBeGreaterThan(0);

  // Push the parent up against the top edge, so its fan would open off screen. The drag
  // starts on empty canvas; `interaction()` says whether the map panned or a node was
  // grabbed, because both draw the same cursor (the 2026-07-31 precedent).
  const box = await probe.canvasBox();
  const start = await probe.parentAt();
  expect(start, "주문 도메인이 지도에 없다").not.toBeNull();
  const occupied = await probe.visible();
  const emptyX = box.left + box.width - 60;
  const emptyY = box.top + box.height - 60;
  expect(
    occupied.every((n) => Math.hypot(box.left + n.x - emptyX, box.top + n.y - emptyY) > n.radius + 24),
    "빈 자리로 고른 지점에 마크가 있다",
  ).toBe(true);
  // Dragged in stages rather than one throw: a single fast move reads as a flick, and the
  // map is still carrying momentum when the next coordinate is taken (map harness, 2026-08).
  const lift = start!.y - 240;
  await page.mouse.move(emptyX, emptyY);
  await page.mouse.down();
  await page.mouse.move(emptyX, emptyY - lift / 3, { steps: 20 });
  const during = await page.evaluate(() => (window as unknown as { __atlasMap: Probe }).__atlasMap.interaction());
  await page.mouse.move(emptyX, emptyY - (lift * 2) / 3, { steps: 20 });
  await page.mouse.move(emptyX, emptyY - lift, { steps: 20 });
  await page.mouse.up();
  expect(during.kind, "배경이 아니라 노드를 잡았다 — 이 측정은 무효다").toBe("pan");
  await waitForMapStill(page);

  const nearEdge = await probe.parentAt();
  expect(nearEdge!.y, "도메인을 위쪽 가장자리로 못 밀었다").toBeLessThan(280);
  const cameraBefore = await probe.camera();
  const visibleBefore = new Set((await probe.visible()).map((n) => n.id));

  await page.mouse.dblclick(nearEdge!.px, nearEdge!.py);
  await expect
    .poll(async () => (await probe.chip())?.expanded, { timeout: 20_000, message: "더블클릭이 자식을 펼치지 않았다" })
    .toBe(true);
  await waitForMapStill(page);

  const cameraAfter = await probe.camera();
  expect(
    cameraAfter.x !== cameraBefore.x || cameraAfter.y !== cameraBefore.y || cameraAfter.scale !== cameraBefore.scale,
    "펼쳤는데 카메라가 그대로다",
  ).toBe(true);

  const insets = await probe.insets();
  expect(insets, "obstacleInsets 창구가 죽었다").not.toBeNull();
  const after = await probe.visible();
  const opened = after.filter((n) => !visibleBefore.has(n.id));
  expect(opened.length, "펼쳤는데 새로 드러난 노드가 없다").toBeGreaterThan(0);

  // The visible region: the canvas minus what the INDEX panel and any open surface cover.
  const leftEdge = insets!.left;
  const rightEdge = box.width - insets!.right;
  const offscreen = [...opened, ...after.filter((n) => n.id === PARENT)].filter(
    (n) => n.x - n.radius < leftEdge || n.x + n.radius > rightEdge || n.y - n.radius < 0 || n.y + n.radius > box.height,
  );
  expect(
    offscreen.map((n) => `${n.label} (${Math.round(n.x)}, ${Math.round(n.y)})`),
    "펼친 자식이 보이는 영역 밖에 있다",
  ).toEqual([]);
});
