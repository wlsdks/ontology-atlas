import { expect, test } from "@playwright/test";

// Hand-copying a value makes this test start lying the day the original changes —
// if the yield window (900ms) shrinks the sampling window must shrink with it, so
// it is read straight from the source. (That module has zero dependencies, so
// Playwright compiles it as is.)
import { NAVIGATION_YIELD_MS } from "../../../../src/shared/lib/navigation/navigation-intent";
import { seedFirstRunSeen } from "../../first-run-seed";

/**
 * Measures the contract directly: on a navigation signal the map stops drawing, and returns when
 * the signal expires or a hand moves. The signal is a window event in `navigation-intent.ts`;
 * the rail firing it is guarded by `AppNavRail.test.tsx`. Thresholds count events, not machine speed.
 */

/** The threshold for a "working" frame — synchronous time (ms) spent in the rAF callback. */
const BUSY_FRAME_MS = 0.4;
/** Working frames required to prove "it is drawing". Cumulative, not per window. */
const MIN_BUSY_PROOF = 10;
/** Settling slack that excludes signal delivery and already-in-flight frames from the sample. */
const SIGNAL_SETTLE_MS = 120;
/** End of the yield sampling window — it must close *before* expiry (900ms) so return frames do not mix in. */
const YIELD_WINDOW_END_MS = NAVIGATION_YIELD_MS - 80;
/** Below this many samples in the yield window the reading is invalid, so retry the cycle. */
const MIN_YIELD_SAMPLE = 6;

test("이동 신호가 오면 지도가 그리기를 멈추고, 손이 움직이면 돌아온다", async ({ page }) => {
  // The worst path (10s proof polling × 3 retries) can exceed the default 60s.
  test.setTimeout(90_000);
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    try {
      // 3D is opt-in and its switch lives in localStorage. 3D with auto-rotation running
      // is the "still drawing at the moment of leaving" state this fix targets.
      window.localStorage.setItem("atlas.appearance.view3d", "on");
    } catch {
      // Private mode — the dome() check below fails on the spot.
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
  await expect(page.getByTestId("ontology-map-canvas")).toBeVisible();

  /** {working, total} counts for samples after `fromT` (and optionally before `untilT`). */
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
   * Waits until the map is proven to **actually be drawing**. This is a cumulative
   * observation rather than a fixed-window frame count, so a slow machine only takes
   * longer to reach the same conclusion.
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

  // Premise ①: is 3D really on? (In 2D this check measures something else.) This
  // polls rather than waiting a fixed time — map initialisation also varies by
  // machine.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { __atlasMap?: { dome: () => unknown } }).__atlasMap?.dome() ??
            null,
        ),
      { message: "3D 가 켜지지 않았다 — 이 표본은 처방이 겨냥한 구간이 아니다", timeout: 15_000 },
    )
    .not.toBeNull();

  // Premise ②: the map must really be drawing *before* the signal. If it is asleep,
  // "it yielded" and "it was never drawing" are the same green — the idling guard.
  await proveDrawing("신호 전 지도가 유휴다 — 이 표본으로는 처방을 검증할 수 없다");

  /**
   * Fires the signal and returns the samples inside the yield window. The signal is
   * exactly what a rail click does (that wiring is guarded by a unit test). The window
   * closes before expiry.
   */
  const measureYield = async () => {
    const t0 = await page.evaluate(() => {
      window.dispatchEvent(new Event("ontology-atlas:navigation-intent"));
      return performance.now();
    });
    // measurement window: the frames drawn inside the yield window are the subject, so the window has to pass.
    await page.waitForTimeout(YIELD_WINDOW_END_MS + 50);
    return framesBetween(t0 + SIGNAL_SETTLE_MS, t0 + YIELD_WINDOW_END_MS);
  };

  const canvas = page.getByTestId("ontology-map-canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;

  let yielded = await measureYield();
  // The yield window is a finite 900ms, so there is no "wait longer" when the sample
  // is too small — the cycle is retried. Not skipped: three short samples fail
  // below.
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
  // The 2 is a count of events, not of speed — the frames already in flight before
  // the signal landed. Measured: with the fix 0; without it nearly every frame in the
  // window (20–26 at 60fps, 6–9 on a slow runner).
  expect(yielded.busy, "이동 신호를 받고도 지도가 계속 그린다").toBeLessThanOrEqual(2);

  // The return contract — a cancelled navigation must not stop the map forever. A
  // hand moving over the canvas releases it on the spot, without waiting for
  // expiry.
  await page.mouse.move(cx, cy);
  await page.mouse.move(cx + 8, cy + 8);
  await proveDrawing("양보가 풀리지 않았다 — 지도가 얼어붙는다");
});
