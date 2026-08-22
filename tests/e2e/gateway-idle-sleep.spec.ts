import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **The gateway sleeps when you put it down** (2026-08-19, measured defect).
 *
 * **What happened.** The gateway (`/`, `/download`) burned 55–68 ms per second
 * forever, even 40 s after the last input — the exact opposite of the same app's map
 * screen, which sleeps completely 32 s after input stops (0 busy frames, 1.7 ms/s).
 * There were three rAF loops (the electric field, the hero dome, and the evidence
 * section's map engine — 900 callbacks in a 5 s window = 60 Hz × 3), and the two
 * owned by the gateway had no ambient-sleep wiring at all (`ambient-sleep.ts` —
 * "alive in your hand, asleep when you put it down"). This is the gateway's instance
 * of the accident `idle-gate.ts`'s doc-block warns about: forgetting to register new
 * motion with the gate.
 *
 * The fix: merge the gateway's own two loops into `gateway-frame-loop.ts` and let
 * that driver put them to sleep on the same constants as the map (30 s delay, 2 s
 * ramp).
 *
 * **What is measured.** The same discipline as `map-hover-release.spec.ts` — measure
 * the **effect**, not the cause (which flag is open): the per-second time rAF
 * callbacks spent *synchronously*. Whichever consumer loses its sleep (the electric
 * field, the dome, or a third canvas added later), it shows up identically as frame
 * cost, so this check also catches copies of the defect.
 *
 * Three assertions: ① it really works while awake (proof the instrument is not
 * idling — "a check that has never once turned red is the same as no check") ② after
 * 30 s of no input plus the 2 s ramp, frame cost reaches the floor ③ one input
 * revives it from the next frame.
 *
 * Measured margins (headless, 1440×900): awake 55–78 ms/s · asleep 1.5–2.2 ms/s ·
 * with the defect reinjected (sleep factor pinned to 1) 55+ ms/s at the 40 s mark.
 * The threshold of 10 sits with no overlap at all between the two states.
 */
test("관문은 무입력이 이어지면 프레임 일을 그만두고, 입력 하나에 되살아난다", async ({ page }) => {
  // 30 s delay + 2 s ramp + measurement window — the default 60 s timeout is not enough.
  test.setTimeout(120_000);
  await seedFirstRunSeen(page);
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
  await page.goto("/ko/download/", { waitUntil: "networkidle" });

  /** Per-second time rAF callbacks spent over the last `ms`, plus the number of busy (≥0.4 ms) frames. */
  const idleCost = (ms: number) =>
    page.evaluate((windowMs) => {
      const w = window as unknown as { __frameWork?: { w: number; t: number }[] };
      const now = performance.now();
      const recent = (w.__frameWork ?? []).filter((e) => e.t > now - windowMs);
      return {
        cpuMsPerSec: recent.reduce((acc, e) => acc + e.w, 0) / (windowMs / 1000),
        busyFrames: recent.filter((e) => e.w >= 0.4).length,
        frames: recent.length,
      };
    }, ms);

  // Create the no-input state: move to a corner once and stop. That move is the last
  // input, so the sleep clock starts here.
  await page.mouse.move(4, 4);

  // ① While awake, the electric field and dome really work. Without this floor the
  //    sleep assertion below would also be green on a page that draws nothing.
  await page.waitForTimeout(6_000);
  const awake = await idleCost(4_000);
  expect(awake.frames).toBeGreaterThan(20);
  expect(awake.busyFrames, "깨어 있는 관문에 일한 프레임이 없다 — 측정기가 헛돈다").toBeGreaterThan(20);

  // ② After the delay (30 s) plus ramp (2 s) it sleeps. At the 38.5 s mark, measure
  //    the last 4 s (entirely inside the sleeping window). Measured: healthy
  //    1.5–2.2 ms/s, defective 55+ ms/s.
  await page.waitForTimeout(32_500);
  const asleep = await idleCost(4_000);
  // If no frames arrived at all (a backgrounded tab, say), the measurement is void.
  expect(asleep.frames).toBeGreaterThan(20);
  expect(asleep.cpuMsPerSec).toBeLessThan(10);

  // ③ One input (a mouse move) revives it from the next frame — the absolute
  //    condition that sleeping is not the same as switched off. Measured: 31 busy
  //    frames in a 1.5 s window.
  await page.mouse.move(700, 450, { steps: 10 });
  await page.waitForTimeout(1_500);
  const woken = await idleCost(1_500);
  expect(woken.busyFrames, "입력 뒤에도 관문이 안 깨어난다").toBeGreaterThan(5);
});
