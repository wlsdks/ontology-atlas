import { expect, test } from "@playwright/test";

// Hand-copying a value makes this test start lying the day the original changes —
// if the yield window (900ms) shrinks the sampling window must shrink with it, so
// it is read straight from the source. (That module has zero dependencies, so
// Playwright compiles it as is.)
import { NAVIGATION_YIELD_MS } from "../../src/shared/lib/navigation-intent";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **A screen you have decided to leave does not draw** (measured 2026-08-19).
 *
 * **What happened.** The time for a new screen to appear after pressing a rail tab
 * **differed by where you started from.** To the docs surface, at 4× CPU throttling:
 *
 * | Starting state | Before | After |
 * |---|---|---|
 * | 2D, 2,000 nodes | 194ms | 194ms |
 * | 3D, 2,000 nodes (dome auto-rotating) | **529ms** | 373ms |
 * | 3D, 3,000 nodes | **745ms** | 502ms |
 *
 * The new screen was not slow. The map's rAF loop was repainting fully every frame
 * **right up to the moment of leaving**, so the new screen's first render was
 * competing with those frames for the frame budget — frames nobody looks at.
 *
 * **Why the contract is measured rather than the navigation time.** The first
 * attempt actually pressed the rail and counted "working frames" between click and
 * address change. **That check returned 10 even with the fix in place** — the rAF
 * wrapper wraps every callback on the page, so from outside there is no way to tell
 * whether those 10 belong to the map or to the incoming docs screen. A number that
 * cannot be attributed guards nothing.
 *
 * So the contract is measured directly: **on a navigation signal the map stops
 * drawing, and it returns when the signal expires or a hand moves over the map.**
 * The signal is a single window event in the shared layer
 * (`shared/lib/navigation-intent.ts`), so it can be fired from outside and the
 * incoming screen never contaminates the sample. Whether the rail actually fires it
 * is guarded separately by `AppNavRail.test.tsx` — the circuit closes only with
 * both.
 *
 * **Thresholds must be machine-independent** (2026-08-20, caught by CI). The first
 * version asserted **absolute frame counts** such as "more than 10 frames in a
 * 400ms window". That number is not a property of the contract but **that machine's
 * rAF rate** — a shared runner produced 9 in the same window and went red with the
 * fix perfectly intact. This is `architecture.md`'s discipline: a gate built on
 * milliseconds or frame counts fails erratically per machine. "Zero draws while
 * closed" is true on every machine.
 *
 * All three parts are now machine-independent:
 *
 * - **Premise (was it drawing)** — waits **until N working frames are observed**
 *   rather than counting a fixed window. A slow machine only takes longer to reach
 *   the same conclusion, and a genuinely idle map never reaches N no matter how long
 *   it waits, failing on the spot.
 * - **Yield (did it stop)** — checks **working frames ≤ 2** inside the yield window.
 *   That 2 is a **count of events**, not of machine speed (frames already in flight
 *   before the signal arrived). A map that did not stop spends nearly every frame in
 *   the window working, so the two states do not overlap even on a machine that
 *   produces only 6 frames.
 * - **Return (did it release)** — waits **until N working frames are observed**
 *   again. A frozen map never reaches N however much time it is given.
 *
 * If the sample is too small (the yield window is a finite 900ms, so "wait longer"
 * is impossible) the cycle is **retried rather than skipped** — move the hand to
 * release the yield, confirm drawing, fire the signal again. Failing three times
 * means the measurement is invalid, and it fails outright rather than stamping
 * green.
 */

/** The threshold for a "working" frame — synchronous time (ms) spent in the rAF callback. */
const BUSY_FRAME_MS = 0.4;
/** Working frames required to prove "it is drawing". Cumulative, not per window. */
const MIN_BUSY_PROOF = 10;
/** Settling slack that excludes signal delivery and already-in-flight frames from the sample. */
const SIGNAL_SETTLE_MS = 120;
/** End of the yield sampling window — it must close *before* expiry (900ms) so return frames do not mix in. */
const YIELD_WINDOW_END_MS = NAVIGATION_YIELD_MS - 80;
/** Below this many samples in the yield window the verdict is invalid — retry the cycle. */
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
  await expect(page.getByTestId("topology-map-v2-canvas")).toBeVisible();

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
    await page.waitForTimeout(YIELD_WINDOW_END_MS + 50);
    return framesBetween(t0 + SIGNAL_SETTLE_MS, t0 + YIELD_WINDOW_END_MS);
  };

  const canvas = page.getByTestId("topology-map-v2-canvas");
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
