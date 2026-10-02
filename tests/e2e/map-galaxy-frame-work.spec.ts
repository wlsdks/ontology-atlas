import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { installFrameWork, p95, startFrameWork, stopFrameWork } from "./frame-work";
import { waitForMapStill } from "./settle";

const FRAME_BAR_MS = 16.7;
const PAN_MS = 3_000;
const IDLE_MS = 10_000;
const ZOOM_RATIO = 2.5;
const bars = process.env.MAP_PERF_BARS === "1";

test.use({
  viewport: { width: 1512, height: 982 },
  deviceScaleFactor: 2,
  channel: "chromium",
  launchOptions: {
    args: [
      "--use-angle=metal",
      "--enable-gpu",
      "--ignore-gpu-blocklist",
      "--disable-renderer-backgrounding",
      "--disable-background-timer-throttling",
    ],
  },
});

const scale = (page: Page) => page.evaluate(() => window.__atlasMap!.camera()!.scale);

async function canvasCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId("ontology-map-canvas").boundingBox();
  if (box === null) throw new Error("the map canvas has no box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function pan(page: Page): Promise<number[]> {
  const center = await canvasCenter(page);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await startFrameWork(page);
  const start = Date.now();
  let step = 0;
  while (Date.now() - start < PAN_MS) {
    const angle = step * 0.05;
    await page.mouse.move(center.x + Math.cos(angle) * 160, center.y + Math.sin(angle) * 120);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    step += 1;
  }
  const work = await stopFrameWork(page);
  await page.mouse.up();
  return work;
}

test("Galaxy at 10,000 concepts: pan frame work and idle frames", async ({ page }) => {
  test.setTimeout(180_000);
  await installFrameWork(page);
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    localStorage.setItem("atlas.appearance.galaxy", "on");
    localStorage.setItem("atlas.appearance.view3d", "off");
    localStorage.setItem("atlas.appearance.territories", "off");
    localStorage.setItem("atlas.appearance.hex-board", "off");
  });
  await page.goto("/en/topology/?synth=10000&synthDeps=1&guides=off&e2e=1");
  await expect(page.getByTestId("topology-view-3d")).toHaveText(/Galaxy/);
  await waitForMapStill(page, { timeout: 90_000 });

  const overviewPan = await pan(page);
  await waitForMapStill(page, { what: "camera" });

  const overview = await scale(page);
  const center = await canvasCenter(page);
  await page.mouse.move(center.x, center.y);
  while ((await scale(page)) < overview * ZOOM_RATIO) {
    await page.mouse.wheel(0, -120);
    await waitForMapStill(page, { what: "camera" });
  }
  const zoomRatio = (await scale(page)) / overview;
  const zoomedPan = await pan(page);

  await startFrameWork(page);
  await page.evaluate((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)), IDLE_MS);
  const idle = await stopFrameWork(page);

  const result = {
    overviewPanP95: +p95(overviewPan).toFixed(2),
    overviewPanFrames: overviewPan.length,
    zoomedPanP95: +p95(zoomedPan).toFixed(2),
    zoomedPanFrames: zoomedPan.length,
    zoomRatio: +zoomRatio.toFixed(2),
    idleP95: idle.length ? +p95(idle).toFixed(2) : 0,
    idleFrames: idle.length,
  };
  console.log(`[galaxy-frame-work] ${JSON.stringify(result)}`);

  expect(overviewPan.length, "the overview pan drew map frames").toBeGreaterThan(0);
  expect(zoomedPan.length, "the zoomed pan drew map frames").toBeGreaterThan(0);
  if (bars) {
    expect(result.overviewPanP95, "overview pan p95").toBeLessThanOrEqual(FRAME_BAR_MS);
    expect(result.zoomedPanP95, "zoomed pan p95").toBeLessThanOrEqual(FRAME_BAR_MS);
  }
});
