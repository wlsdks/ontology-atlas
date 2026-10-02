import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { waitForAnimationsDone, waitForMapSettled } from "./settle";

async function countFrames(page: Page): Promise<void> {
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
}

async function waitForNoFrames(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const times = (window as unknown as { __rafTimes: number[] }).__rafTimes;
      return performance.now() - (times.at(-1) ?? 0) > 3_000;
    },
    undefined,
    { polling: 250, timeout: 90_000 },
  );
}

test("a layout morph stops its own frames once the new view has landed", async ({ page }) => {
  test.setTimeout(120_000);
  await countFrames(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("atlas.appearance.territories", "off");
    window.localStorage.setItem("atlas.appearance.hex-board", "off");
    window.localStorage.setItem("atlas.appearance.galaxy", "off");
    window.localStorage.setItem("atlas.appearance.view3d", "off");
  });
  await page.goto("/ko/topology?synth=300&guides=off&e2e=1");
  await waitForMapSettled(page);
  await page.getByTestId("topology-view-3d").click();
  await waitForAnimationsDone(page.getByTestId("topology-view-3d-menu"));
  await page.getByTestId("topology-view-3d-choice-hex").click();
  await expect(page.getByTestId("hex-board-map")).toHaveAttribute("data-hex-ready", "true");
  await expect(page.getByTestId("map-layout-morph")).toHaveCount(0);
  await waitForNoFrames(page);
});

test("a resting map schedules no animation frame until input wakes it", async ({ page }) => {
  test.setTimeout(120_000);
  await countFrames(page);
  await page.goto("/ko/topology?synth=300&guides=off&e2e=1");
  await expect(page.getByTestId("ontology-map-canvas")).toBeVisible();
  await waitForMapSettled(page);
  await waitForNoFrames(page);

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

test("a resting Galaxy stops its frames once its sky has gone to sleep, and input wakes it", async ({ page }) => {
  test.setTimeout(150_000);
  await countFrames(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("atlas.appearance.territories", "off");
    window.localStorage.setItem("atlas.appearance.hex-board", "off");
    window.localStorage.setItem("atlas.appearance.galaxy", "on");
    window.localStorage.setItem("atlas.appearance.view3d", "off");
  });
  await page.goto("/en/topology?synth=300&synthDeps=1&guides=off&e2e=1");
  await expect(page.getByTestId("topology-view-3d")).toHaveText(/Galaxy/);
  await waitForMapSettled(page);
  await waitForNoFrames(page);

  type SkyProbe = { __atlasMap: { skyTime: () => number } };
  const restingSky = await page.evaluate(() => (window as unknown as SkyProbe).__atlasMap.skyTime());
  const box = await page.getByTestId("ontology-map-canvas").boundingBox();
  const wokenAt = await page.evaluate(() => performance.now());
  await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height * 0.6, { steps: 4 });
  const wokenSky = await page.waitForFunction(
    (resting) => {
      const sky = (window as unknown as SkyProbe).__atlasMap.skyTime();
      return sky !== resting ? sky : null;
    },
    restingSky,
    { polling: "raf" },
  );
  expect(Number(await wokenSky.jsonValue()) - restingSky, "the sky resumes where it stopped").toBeLessThan(100);
  await expect
    .poll(() =>
      page.evaluate(
        (since) => (window as unknown as { __rafTimes: number[] }).__rafTimes.filter((t) => t > since).length,
        wokenAt,
      ),
    )
    .toBeGreaterThan(5);
});
