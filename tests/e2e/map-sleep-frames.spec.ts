import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapSettled } from "./settle";

test("a resting map schedules no animation frame until input wakes it", async ({ page }) => {
  test.setTimeout(120_000);
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __rafTimes?: number[] };
    w.__rafTimes = [];
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback: FrameRequestCallback) =>
      raf((time) => {
        w.__rafTimes!.push(performance.now());
        callback(time);
      });
  });
  await page.goto("/ko/topology?synth=300&guides=off&e2e=1");
  await expect(page.getByTestId("ontology-map-canvas")).toBeVisible();
  await waitForMapSettled(page);

  // rAF polling would itself schedule frames.
  await page.waitForFunction(
    () => {
      const times = (window as unknown as { __rafTimes: number[] }).__rafTimes;
      return performance.now() - (times.at(-1) ?? 0) > 3_000;
    },
    undefined,
    { polling: 250, timeout: 90_000 },
  );

  const box = await page.getByTestId("ontology-map-canvas").boundingBox();
  const wokenAt = await page.evaluate(() => performance.now());
  await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height * 0.6, { steps: 4 });
  await expect
    .poll(() =>
      page.evaluate(
        (since) => (window as unknown as { __rafTimes: number[] }).__rafTimes.filter((t) => t > since).length,
        wokenAt,
      ),
    )
    .toBeGreaterThan(5);
});
