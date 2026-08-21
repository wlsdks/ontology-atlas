import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import type { AtlasMapProbe } from "./atlas-map-probe";

/**
 * **커서가 캔버스를 떠나면 지도는 다시 잠든다** (2026-08-19, 실측 결함).
 *
 * ## 무엇이 있었나
 *
 * 캔버스의 `pointerleave` 는 배경 좌표만 지우고 노드 호버(`hoveredNodeIdRef`)
 * 는 그대로 뒀다. 그 값이 풀리는 유일한 경로가 «캔버스 «안»에서 빈 자리로
 * 움직이는 pointermove» 였기 때문에, 노드 위에 커서를 둔 채 창을 벗어나면
 * 아무도 가리키지 않는 강조가 **영원히** 남았다.
 *
 * 유휴 게이트(`model/idle-gate.ts`)는 «호버 대상이 있다»를 활동으로 친다.
 * 그러니 그것은 그림이 틀린 문제가 아니라 **게이트가 다시는 안 닫히는** 문제였다:
 * 2,000 노드 2D 에서 무입력 48초 뒤에도 초당 130ms 를 태웠다(정상 유휴 3ms/s).
 *
 * ## 이 검사가 «무엇을» 재는지가 이 파일의 요점이다
 *
 * 처음에는 `__atlasMap.hover()` 가 null 이 되는지를 봤다. **그 검사는 결함을
 * 재주입해도 초록이었다** — `hover()` 는 프레임이 «그린» 호버라 배경 좌표에서
 * 나오고, 그 좌표는 leave 가 이미 지우고 있었다. 게이트를 열어 두는 값은 그것과
 * 다른 ref 였다. 즉 그 검사는 결함 옆을 재고 있었다.
 *
 * 그래서 **결과**를 잰다: 커서가 나간 뒤 유예(1,200ms)가 지나면 rAF 콜백이
 * 실제로 일을 그만두는가. 프레임 비용은 어떤 원인으로 게이트가 열려 있든
 * 똑같이 드러나므로, 이 검사는 이번 결함의 사본에도 걸린다.
 */
test("커서가 캔버스를 벗어나면 지도가 프레임을 그만 그린다", async ({ page }) => {
  await seedFirstRunSeen(page);
  // rAF 콜백이 «동기적으로» 쓴 시간을 모은다 — 프레임 간격은 주사율에
  // 오염되지만 콜백 시간은 앱의 몫이다(scripts/perf-node-drag.mjs 와 같은 규율).
  await page.addInitScript(() => {
    const w = window as unknown as { __frameWork?: { w: number; t: number }[] };
    w.__frameWork = [];
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn: FrameRequestCallback) =>
      raf((t) => {
        const start = performance.now();
        try {
          fn(t);
        } finally {
          w.__frameWork!.push({ w: performance.now() - start, t: start });
        }
      });
  });
  await page.goto("/ko/topology?synth=800&guides=off&e2e=1");

  const canvas = page.getByTestId("topology-map-v2-canvas");
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(3000);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const target = await page.evaluate(() => {
    const probe = (window as unknown as { __atlasMap?: AtlasMapProbe }).__atlasMap;
    const nodes = (probe?.nodes() ?? []).filter(
      (n) => !n.hidden && n.x > 140 && n.y > 140 && n.x < innerWidth - 140 && n.y < innerHeight - 140,
    );
    return nodes[0] ? { id: nodes[0].id, x: nodes[0].x, y: nodes[0].y } : null;
  });
  expect(target).not.toBeNull();

  /**
   * 최근 `ms` 동안 rAF 콜백이 쓴 «초당 시간». 프레임 «수» 가 아니라 시간을
   * 보는 이유: 「일한 프레임」의 임계(0.4ms)는 작은 볼트에서 프레임 비용과
   * 겹쳐 판정이 흔들린다(실측: 200노드에서 결함 빌드가 2/143 로 나왔다).
   * 시간은 두 상태를 한 자리도 겹치지 않게 가른다 — 정상 ≈3, 결함 ≈29 ms/s.
   */
  const idleCost = (ms: number) =>
    page.evaluate((windowMs) => {
      const w = window as unknown as { __frameWork?: { w: number; t: number }[] };
      const now = performance.now();
      const recent = (w.__frameWork ?? []).filter((e) => e.t > now - windowMs);
      return {
        cpuMsPerSec: recent.reduce((acc, e) => acc + e.w, 0) / (windowMs / 1000),
        frames: recent.length,
      };
    }, ms);

  await page.mouse.move(box!.x + target!.x, box!.y + target!.y);
  await page.waitForTimeout(400);
  // 전제가 성립해야 결론이 의미가 있다 — 호버가 «걸렸다»를 먼저 못 박는다.
  // (이 줄이 없으면 「호버를 못 걸었다」와 「게이트가 닫혔다」가 같은 초록이다.)
  const hovered = await page.evaluate(
    () => (window as unknown as { __atlasMap?: AtlasMapProbe }).__atlasMap?.hover() ?? null,
  );
  expect(hovered).toBe(target!.id);

  /*
   * 캔버스 «위에 덮인» 크롬으로 한 번에 옮긴다 — 왼쪽 내비 레일.
   *
   * 왜 「캔버스 바깥 좌표」가 아닌가: 이 지도의 캔버스는 **화면 전체를 덮는다**
   * (실측 box = 뷰포트). 그래서 「밖으로 나간다」고 적은 좌표가 사실은 캔버스
   * 안이었고, 그 이동이 빈 캔버스 위 pointermove 를 내면서 종전 경로가 호버를
   * 풀어 줬다 — **결함을 재주입해도 초록인** 검사가 그렇게 만들어진다.
   *   (이 문단이 남아 있는 이유: 같은 실수를 다음 사람이 다시 한다.)
   *
   * 레일 위로 옮기면 캔버스는 `pointerleave` 만 받고 pointermove 는 못 받는다 —
   * 「노드를 보다가 사이드바로 간다」는 가장 흔한 이탈이 정확히 그 모양이다.
   */
  const rail = page.getByTestId("app-nav-rail-item-agents");
  const railBox = await rail.boundingBox();
  expect(railBox).not.toBeNull();
  await page.mouse.move(railBox!.x + railBox!.width / 2, railBox!.y + railBox!.height / 2);
  // 유예(1,200ms) + 램프 감쇠가 끝날 시간.
  await page.waitForTimeout(3500);

  // ① 강조가 실제로 걷혔나 — 원인 쪽. 타이밍 잡음이 없는 판정이다.
  expect(
    await page.evaluate(
      () => (window as unknown as { __atlasMap?: AtlasMapProbe }).__atlasMap?.hover() ?? null,
    ),
  ).toBeNull();

  // ② 게이트가 실제로 닫혔나 — 결과 쪽. 원인이 다른 ref 로 옮겨 가도 여기서 걸린다.
  const after = await idleCost(1500);
  // 프레임이 아예 안 왔으면(탭 백그라운드 등) 이 측정은 무효다.
  expect(after.frames).toBeGreaterThan(20);
  // 실측 여유: 정상 2.8 · 결함 29.2 ms/s (headless, synth=800).
  expect(after.cpuMsPerSec).toBeLessThan(12);
});
