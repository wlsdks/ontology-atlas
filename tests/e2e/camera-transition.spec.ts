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

  /**
   * **한 입력 = 한 사건** — 선택 순간에 움직이는 셋이 같은 사건으로 읽히나.
   *
   * `design.md` 가 못박아 둔 규칙이다: *"같은 입력에서 나온 단계들은 같은 프레임에
   * 시작한다. 시작 시점 차가 `--motion-fast`(120ms)를 넘으면 사용자가 두 사건으로
   * 읽으므로 결함이다."* 그리고 이 저장소는 **이미 그 값을 냈다** — 노드 팝오버가 첫
   * 프레임에 88.8% 로 끝나 버렸는데 배경 지도만 100ms 짜리 전환을 받고 있었다.
   *
   * 이 게이트가 생긴 계기는 **내 변경**이다(2026-08-10): 자유 영역을 재려면 팝오버가
   * 열린 뒤여야 해서 카메라를 **한 프레임 미뤘다.** 그 미룸이 「두 사건」으로 벌어지지
   * 않는지 재야 한다. 실측(120fps 환경): 캔버스 16.6ms · 팝오버 31ms · 카메라 43.9ms
   * — 시차 약 27ms.
   *
   * ## 이 게이트가 실제로 걸려 있는 곳 — 프로브가 알려 줬다
   *
   * ⚠️ **카메라 쪽 단언은 「특정 코드 경로」에 걸려 있지 않다.** 선택 effect 의
   * 카메라 설정을 **통째로 막아도** 이 시험은 초록이었다(프로브 3회: 300ms 지연 ·
   * 임계값 상향 · 경로 차단). 선택할 때 **다른 경로**(이웃 전개의 클러스터 핏)가
   * 카메라를 움직이기 때문이다.
   *
   * 그래서 이 단언이 잠그는 것은 **「입력 뒤 몇 프레임 안에 카메라가 반응한다」**는
   * 관측 가능한 성질이고, 「자유 영역 재조준이 제때 돈다」는 아니다. 후자를 잠그려면
   * 카메라를 움직이는 경로를 다 찾아 격리해야 하는데, 그건 이 게이트가 아니라 그
   * 경로들을 정리하는 별개의 작업이다.
   *
   * **팝오버 쪽은 판별력이 증명됐다** — 등장 애니메이션을 지우면 빨개진다.
   * 그리고 「이름이 아니라 대상 요소로」 묶은 것도 프로브가 시켰다(이름으로 재던
   * 판은 칩이 대신 만족시켰다).
   *
   * ## 계기의 경계 — 캔버스 하드컷은 여기서 재지 않는다
   *
   * 「주인공이 하드컷인가」는 캔버스 픽셀을 매 프레임 읽어야 알 수 있는데, **그 읽기가
   * 프레임 간격을 8ms → 75ms 로 떨어뜨린다**(실측). 그러면 재려던 타이밍 자체가
   * 바뀌므로 이 게이트에 넣지 않는다 — 한 번짜리 측정과 `/motion-verify` 의 몫이다
   * (그 측정에서 첫 프레임 지분 14.3%, 하드컷 아님).
   */
  test("입력 뒤 카메라와 팝오버가 한 사건으로 시작한다", async ({ page }) => {
    const canvas = page.getByTestId("topology-map-v2-canvas");
    await canvas.focus();
    const measured = await page.evaluate(async () => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const el = document.querySelector('[data-surface-role="map-canvas"]');
      const probe = window.__atlasMap;
      if (!el || !probe) return null;
      const cam0 = probe.camera();
      if (!cam0) return null;
      const before = { x: cam0.x, y: cam0.y, s: cam0.scale };  // 정지 확인 뒤 갱신한다

      /*
       * **프레임 번호로 센다 — 밀리초가 아니다.**
       *
       * ⚠️ 처음엔 ms 로 쟀고 **CI 에서 터졌다**(내 기계 43.9ms · CI 267ms). ease-in
       * 곡선은 처음에 거의 안 움직이므로, 「감지되는 첫 움직임」의 시각은 **프레임
       * 간격에 딸린다** — 느린 기계에서 자동으로 늦어진다. 이 저장소가 이미 적어 둔
       * 규칙 그대로다: *"게이트는 밀리초가 아니라 횟수로 잠근다"*(`architecture.md`).
       *
       * 프레임으로 세면 두 기계가 비교 가능해진다(같은 상황에서 4~5프레임).
       */
      const trace: { frame: number; d: number }[] = [];
      let frame = 0;
      let running = true;
      const tick = () => {
        if (!running) return;
        const c = probe.camera();
        if (c) {
          trace.push({
            frame,
            d: Math.hypot(c.x - before.x, c.y - before.y) + Math.abs(c.scale - before.s) * 1000,
          });
        }
        frame += 1;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);

      /*
       * **먼저 카메라가 멈출 때까지 기다린다.**
       *
       * ⚠️ 이걸 안 하면 잔여 스프링 정착이 우리 임계값을 먼저 넘겨, 「카메라가 곧
       * 움직였다」가 항상 참이 된다 — 프로브로 확인했다: 카메라를 **300ms 늦춰도**
       * 시험이 초록이었다. 정지를 확인해야 그 뒤의 변화가 우리 것이 된다.
       */
      const quiet = async () => {
        for (let attempt = 0; attempt < 120; attempt += 1) {
          const a = probe.camera();
          await new Promise((r) => requestAnimationFrame(() => r(null)));
          await new Promise((r) => requestAnimationFrame(() => r(null)));
          await new Promise((r) => requestAnimationFrame(() => r(null)));
          const b = probe.camera();
          if (!a || !b) continue;
          const moved = Math.hypot(b.x - a.x, b.y - a.y) + Math.abs(b.scale - a.scale) * 1000;
          if (moved < 0.001) return true;
        }
        return false;
      };
      const settled = await quiet();

      // 정지 시점을 기준으로 다시 잡는다.
      const rest = probe.camera();
      if (rest) {
        before.x = rest.x;
        before.y = rest.y;
        before.s = rest.scale;
      }
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
      const dispatchFrame = frame;

      let popoverFrame: number | null = null;
      /*
       * ⚠️ **애니메이션 이름만 보면 안 된다** — `topologyChromeIn` 은 공용 표면
       * 프리미티브의 등장이라 칩·메뉴도 같은 이름을 쓴다. 이름만으로 재던 판을
       * 프로브가 잡았다: 팝오버의 등장을 **통째로 지워도** 시험이 초록이었다(칩이
       * 대신 만족시켰다). 그래서 애니메이션의 **대상 요소가 팝오버 안인지**로 묶는다.
       */
      const watcher = setInterval(() => {
        if (popoverFrame !== null) return;
        const positioner = document.querySelector('[data-testid="topology-node-popover-positioner"]');
        if (!positioner) return;
        const hit = document.getAnimations().some((a) => {
          const target = (a.effect as unknown as { target?: Element } | null)?.target;
          return target instanceof Element && positioner.contains(target);
        });
        if (hit) popoverFrame = frame;
      }, 4);
      await wait(700);
      clearInterval(watcher);
      running = false;

      const after = trace.filter((s) => s.frame >= dispatchFrame);
      /*
       * 임계값은 **월드 1단위** 다 — 0.001 로 두면 정지 확인 뒤에도 남는 미세
       * 드리프트가 만족시켜 버린다(프로브 셋이 전부 초록이던 이유).
       */
      const camFirst = after.find((s) => s.d > 1);
      return {
        cameraFrames: camFirst ? camFirst.frame - dispatchFrame : null,
        popoverFrames: popoverFrame !== null ? popoverFrame - dispatchFrame : null,
        totalFrames: frame,
        settled,
      };
    });

    expect(measured, "측정 창구를 못 열었다").not.toBeNull();
    const { cameraFrames, popoverFrames, totalFrames, settled } = measured!;
    expect(totalFrames, "프레임이 돌지 않았다 — 이 시험이 공회전한다").toBeGreaterThan(10);
    expect(settled, "카메라가 멈추기를 기다리지 못했다 — 잔여 정착이 판정을 오염시킨다").toBe(true);
    expect(cameraFrames, "카메라가 아예 안 움직였다").not.toBeNull();
    expect(popoverFrames, "팝오버 안에서 도는 애니메이션을 못 봤다 — 등장이 하드컷이다").not.toBeNull();

    /*
     * 한 사건의 창을 **프레임 수**로 둔다. 6프레임은 60fps 에서 100ms 로
     * `--motion-fast`(120ms)와 같은 뜻이고, 느린 기계에서도 같은 「몇 프레임 안에」를
     * 뜻한다. 실측: 내 기계 카메라 5프레임 · 팝오버 4프레임.
     */
    const ONE_EVENT_FRAMES = 6;
    expect(
      cameraFrames!,
      `카메라가 입력 뒤 ${cameraFrames}프레임에 움직였다 — 한 사건의 창(${ONE_EVENT_FRAMES}프레임)을 넘었다`,
    ).toBeLessThanOrEqual(ONE_EVENT_FRAMES);
    expect(
      popoverFrames!,
      `팝오버가 입력 뒤 ${popoverFrames}프레임에 시작했다 — 한 사건의 창을 넘었다`,
    ).toBeLessThanOrEqual(ONE_EVENT_FRAMES);
    expect(
      Math.abs(cameraFrames! - popoverFrames!),
      `팝오버(${popoverFrames}프레임)와 카메라(${cameraFrames}프레임)가 ` +
        `${Math.abs(cameraFrames! - popoverFrames!)}프레임 벌어졌다 — 두 사건으로 읽힌다`,
    ).toBeLessThanOrEqual(ONE_EVENT_FRAMES);
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
    /*
     * ⚠️ **하한이 기계에 의존하면 안 된다** (2026-08-11, CI 가 잡았다).
     *
     * 처음 하한은 `> 3` 이었다. 전환은 200~420ms 라 표본 수가 **그 시간에 기계가 낸
     * 프레임 수**로 정해지는데, CI 러너는 3개만 냈고 세 번 재시도해서 세 번 다
     * 빨갰다(로컬은 통과). 이 저장소가 이미 정해 둔 규율 그대로다 — 게이트를 밀리초나
     * 프레임 수로 잠그면 기계마다 들쭉날쭉 실패한다.
     *
     * 하한의 목적은 **공회전 차단**(빈 집합에 통과 도장을 찍지 않는 것)이지 성능
     * 판정이 아니다. 그리고 판정 자체(「0인 프레임이 있나」)는 표본이 둘이어도 성립한다.
     * 그래서 하한을 2로 내리고, 표본 수를 로그에 남긴다 — 표본이 적어지는 것은
     * 「조용히 약해지는 것」이 아니라 눈에 보여야 한다.
     */
    console.log(`[camera] 전환 표본 ${steps.length}개 · ${span.durationMs.toFixed(0)}ms`);
    expect(steps.length, "구간이 비었다 — 아무것도 재지 못했다").toBeGreaterThanOrEqual(2);
    /*
     * 가운데 절반에서 **완전히 멈춘 프레임**(0)이 있으면 끊긴 것이다. 양 끝은
     * ease-in-out 이라 원래 느리므로 세지 않는다 — 거기서 0에 가까운 것은 규격이다.
     * 표본이 셋 이하로 적은 기계에서는 잘라낼 여유가 없으니 전부 본다(그때는 양 끝의
     * 느림이 0까지 가지는 않는다 — 0은 정지이고, 정지는 어느 구간에서도 결함이다).
     */
    const interior =
      steps.length >= 6
        ? steps.slice(Math.floor(steps.length * 0.25), Math.ceil(steps.length * 0.75))
        : steps;
    const stalled = interior.filter((s) => s === 0).length;
    expect(stalled, `전환 중에 멈춘 프레임이 ${stalled}개 있다 (표본 ${interior.length})`).toBe(0);
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
