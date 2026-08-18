import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **3D 손잡이 — 돔 안은 회전, 돔 밖은 이동** (2026-08-18, 원장 (80)).
 *
 * 3D 보기에는 e2e 가 **한 개도 없었다.** 그 상태에서 이번 라운드가 조작 규칙을
 * 하나 더 얹었으니(빈 곳 드래그가 자리에 따라 갈린다) 그 규칙은 켜는 순간부터
 * 검사 없는 규칙이 된다 — 이 저장소가 `/gate-probe` 로 금지하는 상태다.
 *
 * ## 왜 픽셀이 아니라 계기를 읽나
 *
 * 회전과 이동은 **화면에서 구별되지 않는다.** 둘 다 「점들이 움직였다」로 보이고,
 * 스크린샷 비교는 그 둘을 가르지 못한다. 가르는 것은 「무엇이 바뀌었나」다:
 * 회전이면 `dome().yaw` 가 바뀌고 카메라는 그대로, 이동이면 카메라가 바뀌고
 * yaw 는 그대로. 그래서 `__atlasMap`(=`?e2e=1`) 을 읽는다.
 *
 * ## 두 방향을 다 잰다
 *
 * 「바깥에서 팬이 된다」만 재면 궤도 회전을 통째로 지워도 초록이다. 두 자리를
 * 모두 재야 «갈린다»가 검증된다.
 */

/** 이번 프레임의 카메라와 돔 자세 — 두 축을 한 번에 읽는다. */
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
 * 돔이 화면에서 차지하는 사각형(캔버스 좌표) — 그려진 노드에서 직접 낸다.
 * 상수로 «대략 여기가 안» 이라고 적으면 레이아웃이 바뀌는 날 시험이 조용히
 * 엉뚱한 자리를 찍는다.
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
    // 3D 는 옵트인이고 그 스위치는 localStorage 다(`appearance-preferences`).
    window.localStorage.setItem("atlas.appearance.view3d", "on");
  });
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  // 조립(≈1.1s) + 진입 스윕(1.5s)이 끝난 뒤에 잰다 — 스윕이 사는 동안에는
  // 그리는 자세가 계속 움직여서 「내 드래그가 바꾼 것」과 구별되지 않는다.
  await page.waitForTimeout(4000);

  const box = await domeScreenBox(page);
  expect(box, "3D 노드를 하나도 못 읽었다 — 계기가 공회전하고 있다").not.toBeNull();
  const b = box!;

  // 좌상단 여백 — 그려진 노드보다 한참 바깥, 확실히 «밖».
  const outsideX = Math.max(b.left + 8, b.left + b.minX - 160);
  const outsideY = Math.max(b.top + 8, b.top + b.minY - 120);
  expect(outsideX, "돔이 화면을 꽉 채워 «바깥»이 없다 — 시험이 성립 안 한다").toBeLessThan(
    b.left + b.minX - 40,
  );

  /* ── ① 돔 밖 드래그 = 카메라 이동 ─────────────────────────────────────── */
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

  /* ── ② 돔 안 드래그 = 궤도 회전 ───────────────────────────────────────── */
  await page.waitForTimeout(600);
  /*
   * **돔 위치를 다시 잰다.** ①에서 지도를 옮겼으므로 그 전에 계산한 «안쪽»
   * 좌표는 이제 바깥일 수 있다 — 첫 작성 때 정확히 그래서 「안 돌았다」로
   * 빨개졌다. 시험이 자기가 만든 상태를 잊는 전형적인 자책골이다.
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
   * 커서 없이 규칙만 있으면 그 규칙은 드래그해 봐야만 발견된다 — 이 저장소가
   * 금지하는 «drag-only discovery» 다. 그래서 커서가 계약의 일부다.
   */
  const outsideX = Math.max(b.left + 8, b.left + b.minX - 160);
  const outsideY = Math.max(b.top + 8, b.top + b.minY - 120);
  await page.mouse.move(outsideX, outsideY);
  await page.waitForTimeout(200);
  expect(await cursor(), "돔 바깥에서 «옮길 수 있다»는 표시가 없다").toBe("move");

  // 노드 원판을 피해 링 사이의 빈 자리를 고른다 — 노드 위에서는 노드의 커서가
  // 이긴다(그건 별개 계약이고, 여기서 재면 무엇을 재는지 흐려진다).
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
    // 중심에서 가장 먼 노드까지의 거리 절반 안에서, 어떤 노드와도 24px 이상
    // 떨어진 첫 점.
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
