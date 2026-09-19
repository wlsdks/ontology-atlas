import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

/**
 * **A path is the only bright thing while a path is asked for** (2026-09-19).
 *
 * The path lens sank everything off the path to the recent-changes lens's rest
 * alpha (0.65), chosen so that a whole-map lens keeps its context readable. A
 * path is two ends and a line; at 0.65 the off-path domain rings measured 123
 * against 143 on the path and every drawn name measured the same 185, so a
 * still frame did not say which two the person had asked about. The path lens
 * now has its own rest alpha (`--map-path-rest-alpha`).
 *
 * Read from the canvas pixels, because alpha is not in the DOM: the brightest
 * pixel under an off-path domain's name against the brightest under an on-path
 * one.
 */
test("off the path, a domain's name is at most half as bright as one on it", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1512, height: 806 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off&mode=path&pathFrom=domain:order&pathTo=domain:fulfillment", {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByTestId("ontology-map")).toHaveAttribute("data-map-lens", "path");
  await waitForMapStill(page);
  // The sink ramps on its own clock; wait for the frame it has arrived in.
  await page.waitForTimeout(600);

  const reading = await page.evaluate(() => {
    const probe = window.__atlasMap!;
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="ontology-map-canvas"]')!;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio;
    const brightest = (box: { minX: number; minY: number; maxX: number; maxY: number }) => {
      const x = Math.round(box.minX * dpr);
      const y = Math.round(box.minY * dpr);
      const w = Math.max(1, Math.round((box.maxX - box.minX) * dpr));
      const h = Math.max(1, Math.round((box.maxY - box.minY) * dpr));
      const data = ctx.getImageData(x, y, w, h).data;
      let max = 0;
      for (let i = 0; i < data.length; i += 4) max = Math.max(max, 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
      return max;
    };
    const onPath = new Set(["domain:order", "domain:fulfillment"]);
    const on: number[] = [];
    const off: number[] = [];
    for (const label of probe.labels()) {
      if (!label.nodeId.startsWith("domain:")) continue;
      (onPath.has(label.nodeId) ? on : off).push(brightest(label));
    }
    return { on, off };
  });
  expect(reading.on.length, "경로 위 도메인 이름이 안 그려졌다").toBe(2);
  expect(reading.off.length, "경로 밖 도메인 이름이 하나도 없으면 비교할 게 없다").toBeGreaterThan(0);
  const onMin = Math.min(...reading.on);
  const offMax = Math.max(...reading.off);
  expect(offMax / onMin, `경로 밖 이름(${Math.round(offMax)})이 경로 위 이름(${Math.round(onMin)})의 절반보다 밝다`).toBeLessThanOrEqual(0.5);
});
