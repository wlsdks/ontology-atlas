import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import type { AtlasMapProbe } from "./atlas-map-probe";
import { waitForMapSettled } from "./settle";

/**
 * **When the cursor leaves the canvas the map goes back to sleep** (measured defect,
 * 2026-08-19).
 *
 * ## What happened
 *
 * The canvas's `pointerleave` cleared only the background coordinate and left the
 * node hover (`hoveredNodeIdRef`) in place. The only path that released that value
 * was a pointermove to empty space **inside** the canvas, so leaving the window with
 * the cursor on a node left a highlight pointing at nobody, **forever**.
 *
 * The idle gate (`model/idle-gate.ts`) counts "there is a hover target" as activity.
 * So this was not a wrong-picture problem but a **gate that never closes again**: on
 * a 2,000-node 2D map it burned 130ms per second even 48 seconds after the last
 * input (normal idle is 3ms/s).
 *
 * ## What this check measures is the point of this file
 *
 * The first version checked whether `__atlasMap.hover()` became null. **That check
 * stayed green even with the defect reinjected** — `hover()` reports the hover the
 * frame *drew*, which comes from the background coordinate, and leave was already
 * clearing that. The value holding the gate open was a different ref. In other
 * words, the check was measuring beside the defect.
 *
 * So the **consequence** is measured instead, in two layers:
 *
 * - **The proof** reads the map's own e2e record: after the cursor leaves, the idle
 *   gate's last awake frame (`idleDebug().lastActive.t`) stops advancing. Any flag
 *   that keeps counting as activity — the stale hover or a copy of it — keeps that
 *   stamp moving. It does not depend on machine load.
 * - **A coarse backstop** compares rAF callback time after release with time while
 *   hovering, in the same run. It catches a broken idle gate that keeps drawing
 *   without recording activity, which the stamp cannot see.
 */
test("커서가 캔버스를 벗어나면 지도가 프레임을 그만 그린다", async ({ page }) => {
  await seedFirstRunSeen(page);
  // Accumulates the time rAF callbacks spent **synchronously** — frame intervals are
  // contaminated by refresh rate, but callback time belongs to the app (the same
  // discipline as scripts/perf-node-drag.mjs).
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

  const canvas = page.getByTestId("ontology-map-canvas");
  await expect(canvas).toBeVisible();
  await waitForMapSettled(page);

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
   * Time per second spent in rAF callbacks over the last `ms`. Why time rather than a
   * frame **count**: the "did work" threshold (0.4ms) overlaps ordinary frame cost on a
   * small vault and makes the verdict flaky (measured: a defective build reported
   * 2/143 on 200 nodes). Time is only a backstop here; the ratio numbers sit at the
   * assertion below.
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

  /** When the idle gate last recorded an awake frame, in the page's own clock. */
  const lastActiveStamp = () =>
    page.evaluate(() => {
      const m = (window as unknown as {
        __atlasMap?: { idleDebug: () => { lastActive: { t: number } | null } };
      }).__atlasMap;
      return m?.idleDebug().lastActive?.t ?? 0;
    });

  // The conclusion only means something if the premise holds — pin down that the
  // hover actually took. (Without this line, "the hover never took" and "the gate
  // closed" are the same green.) That is also the condition, so it is polled rather
  // than slept in front of.
  const hovered = () =>
    page.evaluate(() => (window as unknown as { __atlasMap?: AtlasMapProbe }).__atlasMap?.hover() ?? null);

  /*
   * Leave onto chrome layered **over** the canvas — the left nav rail.
   *
   * Why not "a coordinate outside the canvas": this map's canvas **covers the whole
   * screen** (measured box = viewport). So a coordinate written as "outside" was
   * actually inside it, and that move emitted a pointermove over empty canvas, which
   * the old path used to release the hover — that is how a check that stays green with
   * the defect reinjected gets built.
   *   (This paragraph stays because the next person makes the same mistake.)
   *
   * Moving onto the rail makes the canvas receive `pointerleave` and no pointermove —
   * exactly the shape of the most common exit, looking at a node and then going to the
   * sidebar.
   */
  const rail = page.getByTestId("app-nav-rail-item-agents");
  const railBox = await rail.boundingBox();
  expect(railBox).not.toBeNull();

  /*
   * Three alternating hover / release rounds. Each round yields one awake and one
   * released frame-cost sample; the backstop compares the minimum of each side
   * (the duplicate-pairs model), so one noisy window does not decide it.
   */
  const awakeSamples: number[] = [];
  const releasedSamples: number[] = [];
  for (let round = 0; round < 3; round++) {
    await page.mouse.move(box!.x + target!.x, box!.y + target!.y);
    await expect.poll(hovered, { timeout: 15_000 }).toBe(target!.id);
    // The hover's opening animation runs its first ~500 ms hotter (69-89 vs 48-66
    // ms/s, 2026-09-27 review), so only the steady last second is sampled.
    // measurement window: 1.5 s of hovered frames, the last 1 s of which is sampled.
    await page.waitForTimeout(1_500);
    const awake = await idleCost(1_000);
    expect(awake.frames).toBeGreaterThan(20);
    awakeSamples.push(awake.cpuMsPerSec);

    await page.mouse.move(railBox!.x + railBox!.width / 2, railBox!.y + railBox!.height / 2);
    // ① Was the highlight actually released — the cause side, no timing noise. With
    //    the pointerleave release removed (2026-09-27) this poll already fails here.
    await expect.poll(hovered, { message: "레일로 나갔는데 호버가 안 풀렸다" }).toBeNull();

    /*
     * ② The proof: the idle gate stops recording awake frames. Poll until two reads
     * a poll interval apart agree (the gate stamps every awake frame, so equal reads
     * mean it has gone quiet), then hold for a labelled window and require that no
     * awake frame was recorded in it. With the hover-never-released defect the stamp
     * advances every frame and the poll never settles: measured red on 2026-09-27
   * with the pointerleave release removed and ① disabled.
     */
    let previous = -1;
    await expect
      .poll(
        async () => {
          const now = await lastActiveStamp();
          const still = now === previous;
          previous = now;
          return still;
        },
        { message: "커서가 나간 뒤에도 유휴 게이트가 깨어 있는 프레임을 기록한다", timeout: 15_000 },
      )
      .toBe(true);
    const quietFrom = await lastActiveStamp();
    // measurement window: 1 s in which a sleeping gate must record no awake frame.
    await page.waitForTimeout(1_000);
    expect(await lastActiveStamp(), "잠든 지도가 1초 안에 다시 깨어났다").toBe(quietFrom);

    /*
     * The released cost sample waits out another subsystem's tail (2026-09-13 sweep,
     * `?synth=800`): with the pointer parked on a rail tile, roughly one further
     * `requestAnimationFrame` callback per frame keeps working for about three seconds
     * after the pointer leaves, and that loop exposes no state to wait on —
     * `document.getAnimations()` reports nothing because it is script-driven. Measured
     * released cost by what was waited for: camera and layout still 38 ms/s, the
     * map's gate skipping for 1.5 s 45 ms/s, 3,500 ms after the pointer left 2.7 ms/s.
     */
    // measurement window: outlasts the rail's script-driven tail described above.
    await page.waitForTimeout(3_500);
    const released = await idleCost(1_000);
    // A backgrounded tab draws no frame either; rule it out.
    expect(await page.evaluate(() => document.visibilityState)).toBe("visible");
    releasedSamples.push(released.cpuMsPerSec);
  }

  const awakeMin = Math.min(...awakeSamples);
  const releasedMin = Math.min(...releasedSamples);
  /*
   * ③ The coarse backstop, not the proof: it catches an idle gate that keeps drawing
   * without recording activity (② cannot see that). Relative to awake in the same
   * run, so load inflates both sides alike. Measured 2026-09-27, 5 runs each,
   * headless static build, synth=800, min of three rounds: healthy ratio
   * 0.039-0.243; `shouldSkipFrame` pinned to false 0.855-0.951. The bound sits
   * between the healthy worst and the forced-awake best; it is not 3x from either.
   */
  expect(
    releasedMin,
    `released ${releasedSamples.map((v) => v.toFixed(1)).join("/")} ms/s vs awake ${awakeSamples.map((v) => v.toFixed(1)).join("/")} ms/s`,
  ).toBeLessThan(awakeMin * 0.5);
});
