import { expect, test } from "@playwright/test";

// 값 하나를 손으로 복사하면 원본이 바뀌는 날 이 시험이 거짓말을 시작한다 —
// 양보 창(900ms)이 줄면 표본 창도 같이 줄어야 하므로 원본에서 직접 읽는다.
// (이 모듈은 의존성이 0이라 Playwright 가 그대로 컴파일한다.)
import { NAVIGATION_YIELD_MS } from "../../src/shared/lib/navigation-intent";
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
 *
 * ## 임계값은 기계 무관이어야 한다 (2026-08-20, CI 가 잡았다)
 *
 * 첫 판은 «400ms 창에 프레임 10개 초과» 같은 **절대 프레임 수**로 단언했다.
 * 그 수는 계약의 성질이 아니라 **그 기계의 rAF 헤르츠**다 — 공유 러너가 같은
 * 창에서 9 를 내서 처방이 멀쩡한데 빨개졌다. `architecture.md` 의 규율
 * 그대로다: 밀리초·프레임 수로 게이트를 만들면 기계마다 들쭉날쭉 실패한다.
 * 「닫혀 있으면 그리기 0회」는 어느 기계에서나 참이다.
 *
 * 그래서 지금 판은 셋 다 기계 무관 형태다:
 *
 * - **전제(그리고 있었나)** — 고정 창의 개수가 아니라 «일한 프레임 N개가
 *   관측될 때까지» 기다린다. 느린 기계는 시간이 더 걸릴 뿐 결론이 같고,
 *   원래 유휴인 지도는 아무리 기다려도 N 을 못 채워 그 자리에서 실패한다.
 * - **양보(멈췄나)** — 양보 창 안에서 «일한 프레임 수 ≤ 2» 를 본다. 이 2 는
 *   기계 속도가 아니라 **사건 수**다(신호가 닿기 전 이미 날아가던 프레임).
 *   멈추지 않은 지도는 창 안의 거의 모든 프레임을 일하며 보내므로, 프레임이
 *   6개뿐인 기계에서도 두 상태는 겹치지 않는다.
 * - **복귀(풀렸나)** — 다시 «일한 프레임 N개가 관측될 때까지» 기다린다.
 *   얼어붙은 지도는 시간을 아무리 줘도 N 을 못 채운다.
 *
 * 표본이 모자라면(양보 창은 900ms 로 유한해서 «더 기다리기» 가 불가능하다)
 * **스킵하지 않고 사이클을 다시 돈다** — 손을 움직여 양보를 풀고, 그리기를
 * 확인하고, 신호를 다시 쏜다. 세 번 다 모자라면 그건 측정 무효이고, 초록
 * 도장 없이 그대로 실패한다.
 */

/** «일한» 프레임 판정 임계 — rAF 콜백이 동기적으로 쓴 시간(ms). */
const BUSY_FRAME_MS = 0.4;
/** 「그리고 있다」증명에 요구하는 일한 프레임 수. 창이 아니라 누적이다. */
const MIN_BUSY_PROOF = 10;
/** 신호 전달 + 이미 진행 중이던 프레임을 표본에서 빼는 정착 여유. */
const SIGNAL_SETTLE_MS = 120;
/** 양보 표본 창의 끝 — 만료(900ms) «전»에 닫아야 복귀 프레임이 안 섞인다. */
const YIELD_WINDOW_END_MS = NAVIGATION_YIELD_MS - 80;
/** 양보 창 표본이 이보다 적으면 판정 불가 — 사이클을 다시 돈다. */
const MIN_YIELD_SAMPLE = 6;

test("이동 신호가 오면 지도가 그리기를 멈추고, 손이 움직이면 돌아온다", async ({ page }) => {
  // 최악 경로(증명 폴링 10s × 재시도 3회)가 기본 60s 를 넘을 수 있다.
  test.setTimeout(90_000);
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

  /** `fromT` 이후(옵션: `untilT` 이전) 표본의 {일한 수, 전체 수}. */
  const framesBetween = (fromT: number, untilT?: number) =>
    page.evaluate(
      ([from, until, busyMs]) => {
        const w = window as unknown as { __fw?: { w: number; t: number }[] };
        const win = (w.__fw ?? []).filter(
          (e) => e.t > from && (until === null || e.t < until),
        );
        return { busy: win.filter((e) => e.w >= busyMs).length, frames: win.length };
      },
      [fromT, untilT ?? null, BUSY_FRAME_MS] as const,
    );

  const pageNow = () => page.evaluate(() => performance.now());

  /**
   * 지도가 «실제로 그리고 있다» 를 증명될 때까지 기다린다. 고정 창의 프레임
   * 수가 아니라 누적 관측이라, 기계가 느리면 오래 걸릴 뿐 결론이 같다.
   */
  const proveDrawing = async (why: string) => {
    const from = await pageNow();
    await expect
      .poll(async () => (await framesBetween(from)).busy, {
        message: why,
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(MIN_BUSY_PROOF);
  };

  // 전제 ①: 3D 가 정말 켜졌나. (2D 였다면 이 검사는 다른 것을 재고 있다.)
  await page.waitForTimeout(1_000);
  const dome = await page.evaluate(
    () =>
      (window as unknown as { __atlasMap?: { dome: () => unknown } }).__atlasMap?.dome() ?? null,
  );
  expect(dome, "3D 가 켜지지 않았다 — 이 표본은 처방이 겨냥한 구간이 아니다").not.toBeNull();

  // 전제 ②: 신호 «전» 에 지도가 실제로 그리고 있어야 한다. 잠들어 있으면
  // 「양보했다」와 「원래 안 그렸다」가 같은 초록이 된다 — 공회전 차단.
  await proveDrawing("신호 전 지도가 유휴다 — 이 표본으로는 처방을 검증할 수 없다");

  /**
   * 신호를 쏘고 양보 창 안의 표본을 돌려준다. 신호는 레일 클릭이 하는 일과
   * 정확히 같다(그 배선은 유닛이 지킨다). 창은 만료 전에 닫는다.
   */
  const measureYield = async () => {
    const t0 = await page.evaluate(() => {
      window.dispatchEvent(new Event("ontology-atlas:navigation-intent"));
      return performance.now();
    });
    await page.waitForTimeout(YIELD_WINDOW_END_MS + 50);
    return framesBetween(t0 + SIGNAL_SETTLE_MS, t0 + YIELD_WINDOW_END_MS);
  };

  const canvas = page.getByTestId("topology-map-v2-canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;

  let yielded = await measureYield();
  // 양보 창은 900ms 로 유한하다 — 표본이 모자라면 «더 기다리기» 가 없으므로
  // 사이클을 다시 돈다. 스킵이 아니다: 세 번 다 모자라면 아래에서 실패한다.
  for (let attempt = 2; yielded.frames < MIN_YIELD_SAMPLE && attempt <= 3; attempt += 1) {
    await page.mouse.move(cx, cy);
    await page.mouse.move(cx + 8, cy + 8);
    await proveDrawing(`재시도 ${attempt}: 양보를 풀었는데 지도가 다시 그리지 않는다`);
    yielded = await measureYield();
  }
  expect(
    yielded.frames,
    "양보 구간에 rAF 표본이 재시도 후에도 부족하다 — 측정 무효",
  ).toBeGreaterThanOrEqual(MIN_YIELD_SAMPLE);
  // 2 는 속도가 아니라 사건 수다 — 신호가 닿기 전 이미 날아가던 프레임 몫.
  // 실측: 처방 있음 0 · 처방 없음 «창 안의 거의 전부»(20~26@60fps, 6~9@느린 러너).
  expect(yielded.busy, "이동 신호를 받고도 지도가 계속 그린다").toBeLessThanOrEqual(2);

  // 복귀 계약 — 이동이 취소돼도 지도가 영영 멎지 않는다. 캔버스 위에서 손이
  // 움직이면 그 자리에서 풀린다(만료를 기다리지 않는다).
  await page.mouse.move(cx, cy);
  await page.mouse.move(cx + 8, cy + 8);
  await proveDrawing("양보가 풀리지 않았다 — 지도가 얼어붙는다");
});
