import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "../../first-run-seed";
import type { AtlasMapProbe } from "../../atlas-map-probe";
import { waitForMapSettled } from "../../settle";

/**
 * After the cursor leaves, the idle gate's last awake frame (`idleDebug().lastActive.t`)
 * must stop advancing. `hover()` reports the drawn hover, so it cannot see a stale
 * `hoveredNodeIdRef`; a coarse rAF-time comparison backs this up.
 */
test("커서가 캔버스를 벗어나면 지도가 프레임을 그만 그린다", async ({ page }) => {
  await seedFirstRunSeen(page);
  // Accumulates the time rAF callbacks spent **synchronously** — frame intervals are
  // contaminated by refresh rate, but callback time belongs to the app (the same
  // discipline as scripts/perf/perf-node-drag.mjs).
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
   * Time rather than frame count: the 0.4ms threshold overlaps ordinary frame cost on a
   * small vault, so a frame count is unstable.
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
   * Leave onto the nav rail: the canvas covers the whole screen, so an outside coordinate
   * would still be a pointermove over empty canvas. The rail gives `pointerleave` only.
   */
  const rail = page.getByTestId("app-nav-rail-item-agents");
  const railBox = await rail.boundingBox();
  expect(railBox).not.toBeNull();

  /*
   * Three alternating hover / release rounds. Each round yields one awake and one
   * released frame-cost sample; the backstop compares the minimum of each side,
   * so one noisy window does not decide it.
   */
  const awakeSamples: number[] = [];
  const releasedSamples: number[] = [];
  for (let round = 0; round < 3; round++) {
    await page.mouse.move(box!.x + target!.x, box!.y + target!.y);
    await expect.poll(hovered, { timeout: 15_000 }).toBe(target!.id);
    // The hover's opening animation runs hotter for its first ~500 ms, so only the last
    // second is sampled.
    await page.waitForTimeout(1_500);
    const awake = await idleCost(1_000);
    expect(awake.frames).toBeGreaterThan(20);
    awakeSamples.push(awake.cpuMsPerSec);

    await page.mouse.move(railBox!.x + railBox!.width / 2, railBox!.y + railBox!.height / 2);
    // Cause side, no timing noise: the highlight must be released.
    await expect.poll(hovered, { message: "레일로 나갔는데 호버가 안 풀렸다" }).toBeNull();

    /*
     * The proof: poll until two reads a poll interval apart agree, then require no awake
     * frame in a held window. A never-released hover advances the stamp every frame.
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
     * The rail's script-driven rAF loop keeps working about three seconds after the pointer leaves
     * and exposes no state to wait on (`document.getAnimations()` reports nothing), so wait it out.
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
   * The coarse backstop, not the proof: it catches an idle gate that keeps drawing without
   * recording activity. Relative to awake in the same run so load inflates both sides alike;
   * the bound sits between the healthy worst and the forced-awake best.
   */
  expect(
    releasedMin,
    `released ${releasedSamples.map((v) => v.toFixed(1)).join("/")} ms/s vs awake ${awakeSamples.map((v) => v.toFixed(1)).join("/")} ms/s`,
  ).toBeLessThan(awakeMin * 0.5);
});
