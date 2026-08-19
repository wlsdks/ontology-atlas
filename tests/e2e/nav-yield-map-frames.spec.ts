import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **떠나기로 한 화면은 그리지 않는다** (2026-08-19, 실측).
 *
 * ## 무엇이 있었나
 *
 * 레일 탭을 눌렀을 때 새 화면이 뜨는 시간이 **출발지에 따라 갈렸다.** CPU 4배
 * 스로틀에서 문서함까지:
 *
 * | 출발 상태 | 전 | 후 |
 * |---|---|---|
 * | 2D 2,000 노드 | 194ms | 194ms |
 * | 3D 2,000 노드 (돔 자율 회전 중) | **529ms** | 373ms |
 * | 3D 3,000 노드 | **745ms** | 502ms |
 *
 * 새 화면이 느린 것이 아니었다. 지도의 rAF 루프가 **떠나는 순간까지도** 매
 * 프레임 전면 재도색을 해서, 새 화면의 첫 렌더가 그 프레임들과 프레임 예산을
 * 다투고 있었다. 그 프레임들은 아무도 보지 않는 그림이다.
 *
 * ## 왜 «이동 시간» 이 아니라 «계약» 을 재나
 *
 * 처음엔 레일을 실제로 눌러 클릭~주소변경 사이의 «일한 프레임» 을 셌다. **그
 * 검사는 처방이 살아 있는데도 10 을 돌려줬다** — rAF 래퍼는 페이지의 모든
 * 콜백을 감싸므로, 그 10 이 지도의 것인지 «들어오는 문서함 화면» 의 것인지
 * 밖에서 가를 방법이 없었다. 귀속되지 않는 수치로는 무엇도 못 지킨다.
 *
 * 그래서 계약을 직접 잰다: **이동 신호가 오면 지도가 그리기를 멈추고, 신호가
 * 만료되거나 지도 위에서 손이 움직이면 돌아온다.** 신호는 shared 층의 window
 * 이벤트 하나뿐이라(`shared/lib/navigation-intent.ts`) 밖에서 그대로 쏠 수 있고,
 * 그러면 들어오는 화면이 표본을 오염시키지 않는다. 레일이 그 신호를 실제로
 * 쏘는지는 `AppNavRail.test.tsx` 가 따로 지킨다 — 둘을 합쳐야 회로가 닫힌다.
 */
test("이동 신호가 오면 지도가 그리기를 멈추고, 손이 움직이면 돌아온다", async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    try {
      // 3D 는 옵트인이고 그 스위치는 localStorage 다. 자율 회전이 도는 3D 가
      // 이 처방이 겨냥한 «떠나는 순간까지 그리는» 상태다.
      window.localStorage.setItem("atlas.appearance.view3d", "on");
    } catch {
      // 프라이빗 모드 — 아래 dome() 확인이 그 자리에서 실패시킨다.
    }
    const w = window as unknown as { __fw?: { w: number; t: number }[] };
    w.__fw = [];
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn: FrameRequestCallback) =>
      raf((t) => {
        const start = performance.now();
        try {
          fn(t);
        } finally {
          w.__fw!.push({ w: performance.now() - start, t: start });
        }
      });
  });

  await page.goto("/ko/topology/?synth=1500&guides=off&e2e=1");
  await expect(page.getByTestId("topology-map-v2-canvas")).toBeVisible();
  await page.waitForTimeout(4000);

  /** 최근 `ms` 동안 «일한»(≥0.4ms) 프레임 수. */
  const busy = (ms: number) =>
    page.evaluate((windowMs) => {
      const w = window as unknown as { __fw?: { w: number; t: number }[] };
      const now = performance.now();
      const win = (w.__fw ?? []).filter((e) => e.t > now - windowMs);
      return { busy: win.filter((e) => e.w >= 0.4).length, frames: win.length };
    }, ms);

  // 전제 ①: 3D 가 정말 켜졌나. (2D 였다면 이 검사는 다른 것을 재고 있다.)
  const dome = await page.evaluate(
    () =>
      (window as unknown as { __atlasMap?: { dome: () => unknown } }).__atlasMap?.dome() ?? null,
  );
  expect(dome, "3D 가 켜지지 않았다 — 이 표본은 처방이 겨냥한 구간이 아니다").not.toBeNull();

  // 전제 ②: 신호 «전» 에 지도가 실제로 그리고 있어야 한다. 잠들어 있으면
  // 「양보했다」와 「원래 안 그렸다」가 같은 초록이 된다 — 공회전 차단.
  const before = await busy(1000);
  expect(
    before.busy,
    "신호 전 지도가 이미 유휴다 — 이 표본으로는 처방을 검증할 수 없다",
  ).toBeGreaterThan(10);

  // 신호를 쏜다. 레일 클릭이 하는 일과 정확히 같은 것이다(그 배선은 유닛이 지킨다).
  await page.evaluate(() => {
    window.dispatchEvent(new Event("ontology-atlas:navigation-intent"));
  });
  await page.waitForTimeout(500);
  const yielded = await busy(400);
  expect(yielded.frames, "양보 구간에 rAF 표본이 없다 — 측정 무효").toBeGreaterThan(10);
  // 실측 여유: 처방 있음 0 · 처방 없음 20~26 (400ms 창).
  expect(yielded.busy, "이동 신호를 받고도 지도가 계속 그린다").toBeLessThanOrEqual(2);

  // 복귀 계약 — 이동이 취소돼도 지도가 영영 멎지 않는다. 캔버스 위에서 손이
  // 움직이면 그 자리에서 풀린다(만료를 기다리지 않는다).
  const box = await page.getByTestId("topology-map-v2-canvas").boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.move(box!.x + box!.width / 2 + 8, box!.y + box!.height / 2 + 8);
  await page.waitForTimeout(500);
  const resumed = await busy(400);
  expect(resumed.busy, "양보가 풀리지 않았다 — 지도가 얼어붙는다").toBeGreaterThan(10);
});
