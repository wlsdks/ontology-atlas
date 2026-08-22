import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import type { AtlasMapProbe } from "./atlas-map-probe";

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
 * So the **consequence** is measured instead: after the cursor leaves and the grace
 * period (1,200ms) elapses, do the rAF callbacks actually stop working? Frame cost
 * surfaces the same whatever holds the gate open, so this check also catches copies
 * of this defect.
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
   * Time per second spent in rAF callbacks over the last `ms`. Why time rather than a
   * frame **count**: the "did work" threshold (0.4ms) overlaps ordinary frame cost on a
   * small vault and makes the verdict flaky (measured: a defective build reported
   * 2/143 on 200 nodes). Time separates the two states with no overlap at all — normal
   * ≈3, defective ≈29 ms/s.
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
  // The conclusion only means something if the premise holds — pin down that the
  // hover actually took. (Without this line, "the hover never took" and "the gate
  // closed" are the same green.)
  const hovered = await page.evaluate(
    () => (window as unknown as { __atlasMap?: AtlasMapProbe }).__atlasMap?.hover() ?? null,
  );
  expect(hovered).toBe(target!.id);

  /*
   * Move in one step onto chrome layered **over** the canvas — the left nav rail.
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
  await page.mouse.move(railBox!.x + railBox!.width / 2, railBox!.y + railBox!.height / 2);
  // The grace period (1,200ms) plus time for the ramp to decay.
  await page.waitForTimeout(3500);

  // ① Was the highlight actually released — the cause side. A verdict with no timing noise.
  expect(
    await page.evaluate(
      () => (window as unknown as { __atlasMap?: AtlasMapProbe }).__atlasMap?.hover() ?? null,
    ),
  ).toBeNull();

  // ② Did the gate actually close — the consequence side. Caught here even if the cause moves to another ref.
  const after = await idleCost(1500);
  // If no frames arrived at all (a backgrounded tab, say) this measurement is void.
  expect(after.frames).toBeGreaterThan(20);
  // Measured headroom: normal 2.8 vs defective 29.2 ms/s (headless, synth=800).
  expect(after.cpuMsPerSec).toBeLessThan(12);
});
