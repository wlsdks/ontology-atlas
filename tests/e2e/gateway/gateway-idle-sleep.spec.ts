import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "../first-run-seed";

/**
 * Measures the effect, not the cause: per-second rAF callback time as a fraction of the awake
 * cost from the same page. A small extra canvas left awake under the bound's share would pass unseen.
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

  /*
   * The waits stay in milliseconds: the claims are about elapsed time against the 30 s sleep delay
   * and 2 s ramp. The awake floor keeps the sleep assertion from passing on a page that draws nothing.
   */
  await page.waitForTimeout(6_000);
  const awake = await idleCost(4_000);
  expect(awake.frames).toBeGreaterThan(20);
  expect(awake.busyFrames, "깨어 있는 관문에 일한 프레임이 없다 — 측정기가 헛돈다").toBeGreaterThan(20);

  // ② After the delay (30 s) plus ramp (2 s) it sleeps. At the 38.5 s mark, measure
  //    the last 4 s (entirely inside the sleeping window). Numbers sit at the
  //    assertion below.
  await page.waitForTimeout(32_500);
  const asleep = await idleCost(4_000);
  // If no frames arrived at all (a backgrounded tab, say), the measurement is void.
  expect(asleep.frames).toBeGreaterThan(20);
  /*
   * Relative to the awake measurement so load inflates both sides alike. The bound sits 3.5x over
   * the worst healthy ratio (0.086); a gateway loop left awake reads 0.67-0.71.
   */
  expect(
    asleep.cpuMsPerSec,
    `asleep ${asleep.cpuMsPerSec.toFixed(1)} ms/s vs awake ${awake.cpuMsPerSec.toFixed(1)} ms/s`,
  ).toBeLessThan(awake.cpuMsPerSec * 0.3);

  // ③ One input (a mouse move) revives it from the next frame — the absolute
  //    condition that sleeping is not the same as switched off. Measured: 31 busy
  //    frames in a 1.5 s window.
  await page.mouse.move(700, 450, { steps: 10 });
  await page.waitForTimeout(1_500);
  const woken = await idleCost(1_500);
  expect(woken.busyFrames, "입력 뒤에도 관문이 안 깨어난다").toBeGreaterThan(5);
});
