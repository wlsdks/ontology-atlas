import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
// `window.__atlasMap` 타입은 한 곳에만 선언한다 — 사본이 둘이면 TS2717 이 난다.
import "./atlas-map-probe";

/**
 * 카메라 전환 규격 — **재서 잠근다.**
 *
 * 코드에는 이미 주장이 적혀 있다(`model/camera-easing.ts`): 프로그램이 데려가는
 * 이동은 대칭 ease-in-out 3차 곡선이고, 시간은 **거리에 비례**하며 200~420ms 로
 * 잘리고, 사용자가 제스처로 끼어들면 즉시 스프링에 넘긴다. 그런데 **그 주장을
 * 화면에서 재는 검사가 없었다** — 「부드러워 보인다」로 판정되고 있었다.
 *
 * ## 왜 픽셀이 아니라 카메라 값을 재나
 *
 * `/motion-verify` 는 녹화 프레임의 픽셀 변화량으로 모션을 판정한다. 그것은 「무엇이
 * 움직였는지 모를 때」의 계기다. 카메라는 다르다 — `__atlasMap.camera()` 가 x·y·배율을
 * **숫자로** 내주므로, 곡선의 모양과 시간을 직접 잴 수 있다. 픽셀 차이로는 「200ms 인가
 * 420ms 인가」를 가를 수 없다.
 *
 * ## 왜 방향키로 카메라를 미나
 *
 * 합성 포인터 사건(`dispatchEvent`)으로는 이 캔버스의 노드가 선택되지 않는다(실측).
 * 그리고 설치 앱에서는 osascript 로 **방향키도 클릭도** 캔버스에 닿지 않는다(2026-08-10
 * 실측 — DOM 버튼은 되는데 캔버스는 안 된다). 브라우저에서 Playwright 의 키 사건은
 * 진짜 사건이므로, **방향키로 걷기**가 카메라 전환을 일으키는 유일하게 자동화 가능한
 * 경로다. 그 경로가 곧 사용자가 쓰는 경로이기도 하다.
 *
 * ## 프로브 — 이 게이트가 정말 잡나 (2026-08-10)
 *
 * | 되돌린 것 | 결과 |
 * |---|---|
 * | 전환을 아예 없앰(`beginCameraTween` 즉시 반환) | 「하드컷이다」로 **실패** |
 * | 전환 시간 하한을 200 → 900ms | 「676ms 였다」로 **실패** |
 * | 전환 시간 **상한**만 420 → 1600ms | **안 잡힘** |
 *
 * 셋째가 중요하다: 이 거리의 이동은 시간이 이미 **하한 근처**라 상한을 올려도 값이
 * 안 변한다(`CAMERA_TRANSITION_MIN + min(1,normalized) × span`). 즉 이 spec 은
 * 「상한을 지키나」가 아니라 **「그 창 안에서 실제로 시간을 들여 움직이나」**를 잠근다.
 * 상한 자체는 순수 함수 시험(`cameraTransitionDurationMs` 의 클램프)이 잠근다 —
 * 계기마다 잡을 수 있는 것이 다르고, 그 경계를 적어 두지 않으면 다음 사람이 이
 * spec 을 「상한 게이트」로 착각한다.
 */

/*
 * **영상을 남긴다** (소유자 요청: *"다 녹화해서 자리가 완벽하게 세팅되게끔"*).
 * 숫자는 아래 단언이 잡고, 사람이 눈으로 확인할 것은 이 영상이다 —
 * `output/playwright/test-results/**` 아래에 `.webm` 으로 떨어진다.
 *
 * ⚠️ 파일 **최상단**이어야 한다 — `describe` 안에 두면 Playwright 가
 * *"forces a new worker"* 로 거절한다(실측).
 */
test.use({ video: "on" });

interface CameraSample {
  t: number;
  x: number;
  y: number;
  s: number;
}

/**
 * 이 spec 만 쓰는 기록용 창구. `__atlasMap` 과 달리 제품이 아니라 **이 시험이
 * 만드는 것**이라 여기 남는다(정본 선언은 `./atlas-map-probe`).
 */
declare global {
  interface Window {
    __camTrace?: CameraSample[];
    __camStop?: () => void;
  }
}

/** 카메라를 매 프레임 기록하기 시작한다. */
async function startCameraTrace(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    window.__camTrace = [];
    let running = true;
    const t0 = performance.now();
    const tick = () => {
      if (!running) return;
      const c = window.__atlasMap?.camera();
      if (c) {
        window.__camTrace!.push({
          t: +(performance.now() - t0).toFixed(1),
          x: +c.x.toFixed(3),
          y: +c.y.toFixed(3),
          s: +c.scale.toFixed(5),
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.__camStop = () => {
      running = false;
    };
  });
}

async function readCameraTrace(page: import("@playwright/test").Page): Promise<CameraSample[]> {
  return page.evaluate(() => {
    window.__camStop?.();
    return window.__camTrace ?? [];
  });
}

/**
 * 궤적에서 **실제로 움직인 구간**을 잘라낸다.
 *
 * 카메라는 전환이 없을 때도 스프링이 미세하게 정착하므로, 「값이 변했다」를 그대로
 * 쓰면 잡음이 구간을 늘린다. 그래서 전체 이동량의 **0.5% 이상** 움직인 표본만 센다.
 */
function movingSpan(trace: CameraSample[]) {
  if (trace.length < 3) return null;
  const first = trace[0];
  const last = trace[trace.length - 1];
  const total = Math.hypot(last.x - first.x, last.y - first.y) + Math.abs(last.s - first.s) * 1000;
  if (total < 1) return null;
  const step = (i: number) =>
    Math.hypot(trace[i].x - trace[i - 1].x, trace[i].y - trace[i - 1].y) +
    Math.abs(trace[i].s - trace[i - 1].s) * 1000;
  const threshold = total * 0.005;
  let start = -1;
  let end = -1;
  for (let i = 1; i < trace.length; i += 1) {
    if (step(i) > threshold) {
      if (start < 0) start = i - 1;
      end = i;
    }
  }
  if (start < 0) return null;
  return { start, end, durationMs: trace[end].t - trace[start].t, total };
}

/** 방향키로 걸어 카메라 전환을 일으킨다. 일으키지 못하면 `null`. */
async function walkUntilCameraMoves(page: import("@playwright/test").Page) {
  const DIRECTIONS = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"] as const;
  for (let round = 0; round < 6; round += 1) {
    for (const key of DIRECTIONS) {
      const before = await page.evaluate(() => {
        const c = window.__atlasMap?.camera();
        return c ? { x: c.x, y: c.y, s: c.scale } : null;
      });
      await startCameraTrace(page);
      await page.keyboard.press(key);
      await page.waitForTimeout(900);
      const trace = await readCameraTrace(page);
      const span = movingSpan(trace);
      const after = await page.evaluate(() => {
        const c = window.__atlasMap?.camera();
        return c ? { x: c.x, y: c.y, s: c.scale } : null;
      });
      if (span && before && after && Math.hypot(after.x - before.x, after.y - before.y) > 1) {
        return { trace, span, key };
      }
    }
  }
  return null;
}

test.describe("카메라 전환 규격", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 982 });
    await seedFirstRunSeen(page);
    await page.goto("/ko/topology/?guides=off&e2e=1");
    const canvas = page.getByTestId("topology-map-v2-canvas");
    await canvas.waitFor({ state: "visible", timeout: 20_000 });
    await expect
      .poll(() => page.evaluate(() => Boolean(window.__atlasMap)), { timeout: 15_000 })
      .toBe(true);
    await canvas.focus();
  });

  test("전환이 200~420ms 안에 끝난다 — 코드가 주장하는 그 창", async ({ page }) => {
    const moved = await walkUntilCameraMoves(page);
    expect(moved, "방향키로 카메라 전환을 한 번도 일으키지 못했다").not.toBeNull();
    const { span } = moved!;
    /*
     * 상한에 여유를 준다: 프레임 간격(≈16.7ms)이 두 번 들어갈 수 있고, 마지막
     * 프레임이 목표에 도달한 **뒤** 기록될 수 있다. 여유는 프레임 단위로 주고
     * 밀리초를 손으로 늘리지 않는다 — 기계마다 다른 값을 상한으로 박으면 들쭉날쭉
     * 실패한다(`architecture.md`).
     */
    const FRAME_MS = 1000 / 60;
    expect(
      span.durationMs,
      `전환이 ${span.durationMs.toFixed(0)}ms 였다 — 코드의 창은 200~420ms 다`,
    ).toBeLessThanOrEqual(420 + FRAME_MS * 3);
    expect(span.durationMs, "전환이 한 프레임 만에 끝났다 — 하드컷이다").toBeGreaterThan(FRAME_MS * 2);
  });

  /*
   * ⚠️ **가속 곡선은 여기서 재지 않는다** — 재 봤고, 이 계기로는 못 가른다.
   *
   * 「가운데가 양 끝보다 빠른가」로 ease-in-out 을 판정하려 했는데 실측에서
   * 끝이 가운데보다 빨랐다. 원인은 곡선이 틀린 게 아니라 **측정 대상이 하나가
   * 아니라서**다: 방향키 한 번이 팬과 줌을 함께 움직이고(실측 배율
   * 1.298 → 1.602 → 1.298 → 2.337), 전환이 끝난 뒤 노드 물리와 스프링 정착이
   * 겹친다. 그 합성 궤적에서 뽑은 「구간별 평균 속도」는 곡선의 성질이 아니다.
   *
   * **곡선은 이미 정확히 재는 자리가 있다** —
   * `model/camera-easing.test.ts` 가 순수 함수로 대칭 중점 · 전반부 ease-in ·
   * 단조 증가 · 거리 비례 시간 · 클램프 · 전 축 동시 워프를 전부 잠근다. 순수
   * 함수는 잡음이 0이라 그쪽이 옳은 계기다.
   *
   * 그래서 여기서는 **화면에서만 알 수 있는 것**을 남긴다: 정말 그 시간 안에
   * 끝나나 · 도중에 멈추지 않나 · 목표를 지나치지 않나. 통과시키려고 단언을
   * 약하게 고치지 않고, 계기를 옳은 자리로 옮긴 것이다.
   */

  test("전환 중에 멈춘 프레임이 없다", async ({ page }) => {
    const moved = await walkUntilCameraMoves(page);
    expect(moved).not.toBeNull();
    const { trace, span } = moved!;
    const seg = trace.slice(span.start, span.end + 1);
    const steps: number[] = [];
    for (let i = 1; i < seg.length; i += 1) {
      steps.push(
        Math.hypot(seg[i].x - seg[i - 1].x, seg[i].y - seg[i - 1].y) +
          Math.abs(seg[i].s - seg[i - 1].s) * 1000,
      );
    }
    expect(steps.length, "구간이 비었다").toBeGreaterThan(3);
    /*
     * 가운데 절반에서 **완전히 멈춘 프레임**(0)이 있으면 끊긴 것이다. 양 끝은
     * ease-in-out 이라 원래 느리므로 세지 않는다 — 거기서 0에 가까운 것은 규격이다.
     */
    const from = Math.floor(steps.length * 0.25);
    const to = Math.ceil(steps.length * 0.75);
    const stalled = steps.slice(from, to).filter((s) => s === 0).length;
    expect(stalled, `전환 가운데에 멈춘 프레임이 ${stalled}개 있다`).toBe(0);
  });

  test("목표를 지나치지 않는다 — 되돌아오는 프레임이 없다", async ({ page }) => {
    const moved = await walkUntilCameraMoves(page);
    expect(moved).not.toBeNull();
    const { trace, span } = moved!;
    const seg = trace.slice(span.start, span.end + 1);
    const target = seg[seg.length - 1];
    /*
     * ease-in-out 은 **넘어갔다 되돌아오지 않는다**(스프링과 다른 점이다). 목표까지의
     * 남은 거리가 단조롭게 줄어드는지 본다 — 늘어나는 프레임이 있으면 지나친 것이다.
     * 한 프레임 정도의 반올림은 봐준다.
     */
    let increased = 0;
    let previous = Number.POSITIVE_INFINITY;
    for (const sample of seg) {
      const remaining = Math.hypot(target.x - sample.x, target.y - sample.y);
      if (remaining > previous + 0.5) increased += 1;
      previous = remaining;
    }
    expect(increased, `목표를 지나쳐 되돌아온 프레임이 ${increased}개 있다`).toBe(0);
  });
});
