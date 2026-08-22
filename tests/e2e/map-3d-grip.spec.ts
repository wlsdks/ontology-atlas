import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **The 3D grip — inside the dome rotates, outside it pans** (2026-08-18, ledger
 * entry 80).
 *
 * The 3D view had **no e2e at all**. With this round adding one more interaction rule
 * on top (an empty-space drag splits by where it starts), that rule would be
 * unchecked from the moment it shipped — the state `/gate-probe` forbids.
 *
 * **Why an instrument rather than pixels.** Rotation and panning are
 * **indistinguishable on screen**: both look like "the dots moved", and a screenshot
 * comparison cannot separate them. What separates them is *what* changed — rotation
 * changes `dome().yaw` and leaves the camera, panning changes the camera and leaves
 * the yaw. So `__atlasMap` (via `?e2e=1`) is read instead.
 *
 * **Both directions are measured.** Measuring only "outside becomes a pan" stays
 * green even if orbit rotation is deleted entirely. Only measuring both places
 * verifies that they actually split.
 */

/** This frame's camera and dome attitude — both axes read at once. */
async function readPose(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const m = (
      window as unknown as {
        __atlasMap?: {
          camera: () => { x: number; y: number; scale: number } | null;
          dome: () => { yaw: number; pitch: number } | null;
        };
      }
    ).__atlasMap;
    const camera = m?.camera() ?? null;
    const dome = m?.dome() ?? null;
    return camera && dome ? { camX: camera.x, camY: camera.y, yaw: dome.yaw, pitch: dome.pitch } : null;
  });
}

/**
 * The rectangle the dome occupies on screen (canvas coordinates), derived from the
 * drawn nodes. Writing "roughly here is inside" as a constant makes the test
 * silently click the wrong place the day the layout changes.
 */
async function domeScreenBox(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const m = (
      window as unknown as { __atlasMap?: { nodes: () => Array<{ hidden: boolean; x: number; y: number }> } }
    ).__atlasMap;
    const box = document.querySelector('[data-testid="topology-map-v2-canvas"]')?.getBoundingClientRect();
    const nodes = (m?.nodes() ?? []).filter((n) => !n.hidden);
    if (!box || nodes.length === 0) return null;
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    return {
      left: box.left,
      top: box.top,
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  });
}

test("3D — 돔 안을 끌면 돌고, 돔 밖 검은 자리를 끌면 지도가 따라온다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    // 3D is opt-in and its switch lives in localStorage (`appearance-preferences`).
    window.localStorage.setItem("atlas.appearance.view3d", "on");
  });
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  // Measure after assembly (≈1.1s) and the entry sweep (1.5s) finish — while the
  // sweep is alive the drawn attitude keeps moving and cannot be told apart from what
  // the drag changed.
  await page.waitForTimeout(4000);

  const box = await domeScreenBox(page);
  expect(box, "3D 노드를 하나도 못 읽었다 — 계기가 공회전하고 있다").not.toBeNull();
  const b = box!;

  // Top-left margin — well outside the drawn nodes, unambiguously outside.
  const outsideX = Math.max(b.left + 8, b.left + b.minX - 160);
  const outsideY = Math.max(b.top + 8, b.top + b.minY - 120);
  expect(outsideX, "돔이 화면을 꽉 채워 «바깥»이 없다 — 시험이 성립 안 한다").toBeLessThan(
    b.left + b.minX - 40,
  );

  /* ── ① Drag outside the dome = camera pan ──────────────────────────────── */
  const before1 = await readPose(page);
  expect(before1).not.toBeNull();
  await page.mouse.move(outsideX, outsideY);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(outsideX + i * 14, outsideY + i * 9);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after1 = await readPose(page);
  expect(after1).not.toBeNull();

  expect(
    Math.hypot(after1!.camX - before1!.camX, after1!.camY - before1!.camY),
    "돔 밖을 끌었는데 지도가 안 움직였다 — 이 시험이 생긴 이유가 그 결함이다",
  ).toBeGreaterThan(20);
  expect(
    Math.abs(after1!.yaw - before1!.yaw),
    "돔 밖을 끌었는데 돔이 돌았다 — 바깥은 이동이어야 한다",
  ).toBeLessThan(0.02);

  /* ── ② Drag inside the dome = orbit rotation ───────────────────────────── */
  await page.waitForTimeout(600);
  /*
   * **Re-measure the dome's position.** ① moved the map, so an "inside" coordinate
   * computed before it may now be outside — which is exactly why the first version
   * went red with "it did not rotate". A textbook own goal: the test forgetting the
   * state it created itself.
   */
  const box2 = await domeScreenBox(page);
  expect(box2, "팬 뒤에 돔이 화면 밖으로 나갔다 — ①의 이동량이 과하다").not.toBeNull();
  const b2 = box2!;
  const insideX2 = b2.left + (b2.minX + b2.maxX) / 2;
  const insideY2 = b2.top + (b2.minY + b2.maxY) / 2;
  const before2 = await readPose(page);
  await page.mouse.move(insideX2, insideY2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(insideX2 + i * 14, insideY2);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(60);
  const after2 = await readPose(page);

  expect(
    Math.abs(after2!.yaw - before2!.yaw),
    "돔 안을 끌었는데 안 돌았다 — 안쪽은 회전이어야 한다",
  ).toBeGreaterThan(0.1);
  expect(
    Math.hypot(after2!.camX - before2!.camX, after2!.camY - before2!.camY),
    "돔 안을 끌었는데 지도가 따라왔다 — 안쪽은 회전만이어야 한다",
  ).toBeLessThan(1);
});

test("3D — 커서가 두 구역을 말한다 (돔 위 grab · 바깥 move)", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("atlas.appearance.view3d", "on");
  });
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(4000);

  const box = await domeScreenBox(page);
  expect(box, "3D 노드를 하나도 못 읽었다 — 계기가 공회전하고 있다").not.toBeNull();
  const b = box!;
  const cursor = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid="topology-map-v2-canvas"]') as HTMLElement | null;
      return el ? getComputedStyle(el).cursor : null;
    });

  /*
   * A rule with no cursor is discoverable only by dragging — the "drag-only
   * discovery" this repository forbids. So the cursor is part of the contract.
   */
  const outsideX = Math.max(b.left + 8, b.left + b.minX - 160);
  const outsideY = Math.max(b.top + 8, b.top + b.minY - 120);
  await page.mouse.move(outsideX, outsideY);
  await page.waitForTimeout(200);
  expect(await cursor(), "돔 바깥에서 «옮길 수 있다»는 표시가 없다").toBe("move");

  // Pick empty space between the rings, avoiding node discs — over a node the node's
  // cursor wins (a separate contract; measuring it here blurs what is being
  // measured).
  const gap = await page.evaluate(() => {
    const m = (
      window as unknown as { __atlasMap?: { nodes: () => Array<{ hidden: boolean; x: number; y: number }> } }
    ).__atlasMap;
    const el = document.querySelector('[data-testid="topology-map-v2-canvas"]');
    const rect = el?.getBoundingClientRect();
    const nodes = (m?.nodes() ?? []).filter((n) => !n.hidden);
    if (!rect || nodes.length === 0) return null;
    const cx = (Math.min(...nodes.map((n) => n.x)) + Math.max(...nodes.map((n) => n.x))) / 2;
    const cy = (Math.min(...nodes.map((n) => n.y)) + Math.max(...nodes.map((n) => n.y))) / 2;
    // The first point within half the distance to the farthest node that is at least
    // 24px from every node.
    for (let r = 0; r < 160; r += 8) {
      for (let a = 0; a < 360; a += 15) {
        const x = cx + Math.cos((a * Math.PI) / 180) * r;
        const y = cy + Math.sin((a * Math.PI) / 180) * r;
        if (nodes.every((n) => Math.hypot(n.x - x, n.y - y) > 24)) {
          return { px: rect.left + x, py: rect.top + y };
        }
      }
    }
    return null;
  });
  expect(gap, "돔 안에서 노드와 겹치지 않는 빈 자리를 못 찾았다").not.toBeNull();
  await page.mouse.move(gap!.px, gap!.py);
  await page.waitForTimeout(200);
  expect(await cursor(), "돔 위에서 «잡아 돌릴 수 있다»는 표시가 없다").toBe("grab");
});
