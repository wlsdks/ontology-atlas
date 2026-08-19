import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **관문은 내려놓으면 잠든다** (2026-08-19, 실측 결함).
 *
 * ## 무엇이 있었나
 *
 * 관문(`/` · `/download`)은 무입력 40초 뒤에도 초당 55~68ms 를 영구히 태웠다 —
 * 같은 앱의 지도 화면이 무입력 32초 뒤 0 busy 프레임(1.7ms/s)으로 완전히
 * 잠드는 것과 정반대다. rAF 루프가 셋이었고(전류장 · 히어로 돔 · 증거 절 지도
 * 엔진, 5초 창 콜백 900회 = 60Hz × 3) 그중 관문 소유의 둘에는 앰비언트 휴면
 * (`ambient-sleep.ts` — "손 안에서는 살아 있고, 내려놓으면 잠든다")이 아예
 * 배선돼 있지 않았다. `idle-gate.ts` 독블록이 경고한 「새 모션을 게이트에
 * 등록하는 것을 잊는」 사고의 관문판이다.
 *
 * 처방: 관문 소유의 두 루프를 `gateway-frame-loop.ts` 하나로 합치고, 그
 * 드라이버가 지도와 같은 상수(딜레이 30s · 램프 2s)로 재운다.
 *
 * ## 무엇을 재나
 *
 * `map-hover-release.spec.ts` 와 같은 규율 — 원인(어느 플래그가 열려 있나)이
 * 아니라 **결과**를 잰다: rAF 콜백이 «동기적으로» 쓴 초당 시간. 휴면이 어느
 * 소비처에서 빠지든(전류장이든 돔이든, 새로 생길 세 번째 캔버스든) 프레임
 * 비용으로 똑같이 드러나므로, 이 검사는 결함의 사본에도 걸린다.
 *
 * 세 단언: ① 깨어 있는 동안 실제로 일한다(측정기가 헛돌지 않는다는 증명 —
 * 「한 번도 빨간불이 된 적 없는 검사는 없는 것과 같다」) ② 무입력
 * 30s+램프 2s 가 지나면 프레임 비용이 바닥에 닿는다 ③ 입력 하나에 다음
 * 프레임부터 되살아난다.
 *
 * 실측 여유 (headless, 1440×900): 깨어 있음 55~78 ms/s · 잠듦 1.5~2.2 ms/s ·
 * 결함 재주입(휴면 계수 상시 1) 시 40초 시점 55+ ms/s. 임계 10 은 두 상태
 * 사이 한 자리도 안 겹치게 놓인다.
 */
test("관문은 무입력이 이어지면 프레임 일을 그만두고, 입력 하나에 되살아난다", async ({ page }) => {
  // 딜레이 30s + 램프 2s + 측정 창 — 기본 60s 타임아웃으로는 모자란다.
  test.setTimeout(120_000);
  await seedFirstRunSeen(page);
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
  await page.goto("/ko/download/", { waitUntil: "networkidle" });

  /** 최근 `ms` 동안 rAF 콜백이 쓴 초당 시간 + 일한(≥0.4ms) 프레임 수. */
  const idleCost = (ms: number) =>
    page.evaluate((windowMs) => {
      const w = window as unknown as { __frameWork?: { w: number; t: number }[] };
      const now = performance.now();
      const recent = (w.__frameWork ?? []).filter((e) => e.t > now - windowMs);
      return {
        cpuMsPerSec: recent.reduce((acc, e) => acc + e.w, 0) / (windowMs / 1000),
        busyFrames: recent.filter((e) => e.w >= 0.4).length,
        frames: recent.length,
      };
    }, ms);

  // 무입력 상태를 만든다 — 구석으로 한 번 옮기고 손을 뗀다. 이 이동이
  // 마지막 입력이므로 휴면 시계는 여기서 출발한다.
  await page.mouse.move(4, 4);

  // ① 깨어 있는 동안 전류장·돔이 실제로 일한다 — 이 바닥이 없으면 아래
  //    잠듦 판정은 «아무것도 안 그리는 페이지»에서도 초록이라 헛돈다.
  await page.waitForTimeout(6_000);
  const awake = await idleCost(4_000);
  expect(awake.frames).toBeGreaterThan(20);
  expect(awake.busyFrames, "깨어 있는 관문에 일한 프레임이 없다 — 측정기가 헛돈다").toBeGreaterThan(20);

  // ② 딜레이(30s) + 램프(2s)가 지나면 잠든다. 총 38.5초 시점에서 마지막
  //    4초(전부 휴면 구간)를 잰다. 실측: 정상 1.5~2.2 · 결함 55+ ms/s.
  await page.waitForTimeout(32_500);
  const asleep = await idleCost(4_000);
  // 프레임이 아예 안 왔으면(탭 백그라운드 등) 이 측정은 무효다.
  expect(asleep.frames).toBeGreaterThan(20);
  expect(asleep.cpuMsPerSec).toBeLessThan(10);

  // ③ 입력 하나(마우스 이동)에 다음 프레임부터 되살아난다 — 잠듦이 「꺼짐」이
  //    아니라는 절대 조건. 실측: 1.5초 창에 일한 프레임 31.
  await page.mouse.move(700, 450, { steps: 10 });
  await page.waitForTimeout(1_500);
  const woken = await idleCost(1_500);
  expect(woken.busyFrames, "입력 뒤에도 관문이 안 깨어난다").toBeGreaterThan(5);
});
