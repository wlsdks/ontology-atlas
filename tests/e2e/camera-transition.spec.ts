import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
// The `window.__atlasMap` type is declared in exactly one place — two copies raise TS2717.
import "./atlas-map-probe";

/**
 * The camera transition spec — **measured and locked.**
 *
 * The claim is already written in code (`model/camera-easing.ts`): a
 * programmatic move follows a symmetric ease-in-out cubic, its duration is
 * **proportional to distance** and clamped to 200–420ms, and a user gesture hands
 * it straight to the spring. But **no check measured that claim on screen** — it
 * was being judged by "looks smooth".
 *
 * **Why camera values rather than pixels.** `/motion-verify` judges motion from
 * pixel deltas between recorded frames; that is the instrument for when you do not
 * know what moved. The camera is different — `__atlasMap.camera()` returns x, y,
 * and zoom **as numbers**, so the curve's shape and duration can be measured
 * directly. Pixel deltas cannot tell 200ms from 420ms.
 *
 * **Why arrow keys drive the camera.** Synthetic pointer events (`dispatchEvent`)
 * do not select a node on this canvas (measured). And in the installed app,
 * osascript reaches the canvas with **neither arrow keys nor clicks** (measured
 * 2026-08-10 — DOM buttons work, the canvas does not). In the browser, Playwright's
 * key events are real events, so **walking with arrow keys** is the only
 * automatable path that causes a camera transition. It is also the path users take.
 *
 * **Probes — does this gate actually catch anything** (2026-08-10):
 *
 * | Defect reverted in | Result |
 * |---|---|
 * | Transition removed entirely (`beginCameraTween` returns immediately) | **fails** with "it is a hard cut" |
 * | Transition duration floor 200 → 900ms | **fails** with "it was 676ms" |
 * | Transition duration **ceiling** only, 420 → 1600ms | **not caught** |
 *
 * The third matters: a move of this distance already lands **near the floor**, so
 * raising the ceiling does not change the value
 * (`CAMERA_TRANSITION_MIN + min(1,normalized) × span`). This spec therefore locks
 * **"does it actually take time to move inside that window"**, not "does it respect
 * the ceiling". The ceiling itself is locked by the pure-function test (the clamp
 * in `cameraTransitionDurationMs`). Different instruments catch different things,
 * and without writing that boundary down the next person mistakes this spec for a
 * ceiling gate.
 */

/*
 * **Keep the video** (owner request: *"다 녹화해서 자리가 완벽하게 세팅되게끔"* —
 * record everything so the setup is provably perfect). The assertions below catch
 * the numbers; this video is what a person checks by eye. It lands as `.webm`
 * under `output/playwright/test-results/**`.
 *
 * ⚠️ This must be at the **top level of the file** — inside a `describe`,
 * Playwright rejects it with *"forces a new worker"* (measured).
 */
test.use({ video: "on" });

interface CameraSample {
  t: number;
  x: number;
  y: number;
  s: number;
}

/**
 * A recording hook used only by this spec. Unlike `__atlasMap` it is not product
 * code but **something this test creates**, so it lives here (the canonical
 * declaration is in `./atlas-map-probe`).
 */
declare global {
  interface Window {
    __camTrace?: CameraSample[];
    __camStop?: () => void;
  }
}

/** Starts recording the camera every frame. */
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
 * Cuts the **actually-moving span** out of the trajectory.
 *
 * The camera keeps settling on the spring even with no transition running, so
 * using "the value changed" directly lets noise stretch the span. Only samples
 * that moved **at least 0.5%** of the total distance are counted.
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

/** Walks with arrow keys to cause a camera transition; `null` if none happens. */
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
   * **One input = one event** — do the three things that move on selection read as
   * the same event?
   *
   * The rule is pinned in `design.md`: *"같은 입력에서 나온 단계들은 같은 프레임에
   * 시작한다. 시작 시점 차가 `--motion-fast`(120ms)를 넘으면 사용자가 두 사건으로
   * 읽으므로 결함이다."* (stages caused by the same input start on the same frame;
   * a start-time gap over `--motion-fast` (120ms) reads as two events and is a
   * defect). This repository has **already produced that value** — the node popover
   * finished at 88.8% on the first frame while only the background map received a
   * 100ms transition.
   *
   * The gate exists because of **a change made here** (2026-08-10): measuring free
   * space requires the popover to be open, so the camera was delayed by **one
   * frame**. That delay has to be measured so it does not widen into "two events".
   * Measured (120fps machine): canvas 16.6ms · popover 31ms · camera 43.9ms — a
   * spread of about 27ms.
   *
   * **What this gate is actually attached to — the probes told us.**
   *
   * ⚠️ **The camera assertions are not attached to any specific code path.**
   * Blocking the selection effect's camera setup **entirely** still left this test
   * green (3 probes: 300ms delay · raised threshold · blocked path), because on
   * selection a **different path** (the cluster fit of the neighbour expansion) moves
   * the camera.
   *
   * So what this assertion locks is the observable property **"the camera reacts
   * within a few frames of the input"**, not "free-space re-aiming runs on time".
   * Locking the latter would require finding and isolating every path that moves the
   * camera, which is separate work on those paths rather than this gate.
   *
   * **The popover side is proven discriminating** — deleting its entry animation
   * turns it red. Grouping by target element rather than by animation name was also
   * the probes' doing (the name-based version was satisfied by a chip instead).
   *
   * **Instrument boundary — canvas hard cuts are not measured here.** Whether the
   * protagonist hard-cuts can only be known by reading canvas pixels every frame,
   * and **that reading drops the frame interval from 8ms to 75ms** (measured). That
   * changes the very timing being measured, so it is not in this gate — it belongs to
   * a one-off measurement and to `/motion-verify` (in that measurement the first
   * frame's share was 14.3%, so not a hard cut).
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
      const before = { x: cam0.x, y: cam0.y, s: cam0.scale };  // Refreshed after confirming stillness

      /*
       * **Counted in frames, not milliseconds.**
       *
       * ⚠️ This was measured in ms at first and **broke in CI** (43.9ms locally, 267ms
       * in CI). An ease-in curve barely moves at the start, so the time of "the first
       * detectable movement" **depends on the frame interval** and gets later on a slow
       * machine automatically. This is the rule the repository already wrote down:
       * *"게이트는 밀리초가 아니라 횟수로 잠근다"* (`architecture.md` — a gate locks on
       * counts, not milliseconds).
       *
       * Counting frames makes two machines comparable (4–5 frames in the same
       * situation).
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
       * **Wait for the camera to come to rest first.**
       *
       * ⚠️ Without this the residual spring settling crosses our threshold first and
       * "the camera moved promptly" is always true — confirmed by probe: delaying the
       * camera by **300ms** still left the test green. Only after confirming stillness
       * does a subsequent change belong to us.
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

      // Re-anchor on the moment of rest.
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
       * ⚠️ **Do not match on the animation name alone** — `topologyChromeIn` is the
       * shared surface primitive's entry, so chips and menus use the same name. A probe
       * caught the name-based version: deleting the popover's entry **entirely** left the
       * test green (a chip satisfied it instead). So it groups on whether the
       * animation's **target element is inside the popover**.
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
       * The threshold is **1 world unit** — at 0.001 the micro-drift that remains even
       * after confirming stillness satisfies it (which is why all three probes went
       * green).
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
     * The one-event window is expressed in **frames**. At 60fps, 6 frames is 100ms,
     * which carries the same meaning as `--motion-fast` (120ms), and on a slow machine
     * it still means the same "within a few frames". Measured locally: camera 5
     * frames · popover 4 frames.
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
     * Slack on the ceiling: two frame intervals (≈16.7ms each) can fit, and the last
     * frame can be recorded **after** the target is reached. The slack is given in
     * frames rather than by hand-raising the milliseconds — pinning a machine-dependent
     * value as a ceiling produces flaky failures (`architecture.md`).
     */
    const FRAME_MS = 1000 / 60;
    expect(
      span.durationMs,
      `전환이 ${span.durationMs.toFixed(0)}ms 였다 — 코드의 창은 200~420ms 다`,
    ).toBeLessThanOrEqual(420 + FRAME_MS * 3);
    expect(span.durationMs, "전환이 한 프레임 만에 끝났다 — 하드컷이다").toBeGreaterThan(FRAME_MS * 2);
  });

  /*
   * ⚠️ **The acceleration curve is not measured here** — it was tried, and this
   * instrument cannot resolve it.
   *
   * Judging ease-in-out by "is the middle faster than the ends" produced a
   * measurement where the ends were faster than the middle. The cause is not a wrong
   * curve but that **more than one thing is being measured**: one arrow key moves pan
   * and zoom together (measured zoom 1.298 → 1.602 → 1.298 → 2.337), and after the
   * transition ends node physics and spring settling overlap it. A "per-segment
   * average speed" pulled from that composite trajectory is not a property of the
   * curve.
   *
   * **The curve already has a place where it is measured exactly** —
   * `model/camera-easing.test.ts` locks symmetric midpoint, ease-in first half,
   * monotonicity, distance-proportional duration, the clamp, and simultaneous warp on
   * all axes, as a pure function. A pure function has zero noise, so that is the
   * right instrument.
   *
   * What stays here is **what only the screen can tell you**: does it really finish
   * within that time, does it stall midway, does it overshoot the target. The
   * assertion was not weakened to make it pass — the instrument was moved to the
   * right place.
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
     * ⚠️ **A floor must not depend on the machine** (2026-08-11, caught by CI).
     *
     * The floor started at `> 3`. The transition is 200–420ms, so the sample count is
     * decided by **how many frames the machine produced in that time** — the CI runner
     * produced only 3 and went red on all three retries (local passed). This is the
     * discipline the repository already set: locking a gate to milliseconds or frame
     * counts produces machine-dependent flakiness.
     *
     * The floor's purpose is the **idling guard** (not stamping an empty set as
     * passing), not a performance verdict. And the verdict itself ("is there a frame at
     * 0") holds with two samples. So the floor drops to 2 and the sample count is
     * logged — a shrinking sample must be visible rather than a silent weakening.
     */
    console.log(`[camera] 전환 표본 ${steps.length}개 · ${span.durationMs.toFixed(0)}ms`);
    expect(steps.length, "구간이 비었다 — 아무것도 재지 못했다").toBeGreaterThanOrEqual(2);
    /*
     * A **fully stopped frame** (0) in the middle half means it stalled. The ends are
     * not counted because ease-in-out is slow there by design — near-zero at the ends
     * is the spec. On a machine with three or fewer samples there is no slack to trim,
     * so all are checked (there the ends' slowness does not reach 0 — 0 is a stop, and a
     * stop is a defect in any segment).
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
     * ease-in-out **never overshoots and comes back** (unlike a spring). This checks
     * that the remaining distance to the target decreases monotonically — a frame where
     * it grows means an overshoot. About one frame of rounding is tolerated.
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
