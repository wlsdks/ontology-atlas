import { expect, test, type Page } from "@playwright/test";

import "./atlas-cosmos-probe";
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

function framesBetween(page: Page, from: number, to: number): Promise<number> {
  return page.evaluate(
    ([a, b]) => (window as unknown as { __rafTimes: number[] }).__rafTimes.filter((t) => t >= a! && t <= b!).length,
    [from, to],
  );
}

async function sleepUntil(page: Page, at: number): Promise<void> {
  const now = await page.evaluate(() => performance.now());
  // measurement window: the claim is about frames scheduled across real time on the page clock.
  await page.waitForTimeout(Math.max(0, at - now));
}

function cosmosMarks(page: Page): Promise<string> {
  return page.evaluate(() =>
    JSON.stringify(
      window.__atlasCosmos!.marks()
        .map((m) => `${m.id}:${m.x.toFixed(3)},${m.y.toFixed(3)},${m.r.toFixed(3)}`)
        .sort(),
    ),
  );
}

async function openCosmos(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 860 });
  await page.addInitScript(() => {
    for (const key of ["galaxy", "view3d", "territories", "hex-board"]) window.localStorage.setItem(`atlas.appearance.${key}`, "off");
  });
  await page.goto("/en/topology?synth=300&synthDeps=1&guides=off&e2e=1");
  await waitForMapSettled(page);
  await page.getByTestId("topology-view-3d").click();
  await waitForAnimationsDone(page.getByTestId("topology-view-3d-menu"));
  await page.getByTestId("topology-view-3d-choice-galaxy").click();
  await expect(page.getByTestId("topology-map-view")).toHaveAttribute("data-map-view", "galaxy");
  await expect.poll(() => page.evaluate(() => window.__atlasCosmos?.layout()?.galaxies.length ?? 0)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__atlasCosmos!.arrival().active)).toBe(false);
  await expect(page.getByTestId("map-layout-morph")).toHaveCount(0);
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

test("the Galaxy haze moves no star, sleeps twelve seconds after input, and a wheel wakes it", async ({ page }) => {
  test.setTimeout(300_000);
  await countFrames(page);
  await openCosmos(page);
  const box = (await page.getByTestId("ontology-map-canvas").boundingBox())!;

  for (let round = 0; round < 3; round += 1) {
    const x = box.x + box.width * (0.3 + round * 0.1);
    const y = box.y + box.height * 0.2;
    await page.mouse.move(x - 8, y, { steps: 2 });
    await page.mouse.move(x, y, { steps: 2 });
    const t0 = await page.evaluate(() => performance.now());

    await sleepUntil(page, t0 + 1_000);
    const early = await cosmosMarks(page);
    await sleepUntil(page, t0 + 9_000);
    const late = await cosmosMarks(page);
    expect(await framesBetween(page, t0 + 1_000, t0 + 9_000), `round ${round}: the haze runs`).toBeGreaterThan(0);
    expect(late, `round ${round}: no star moves`).toBe(early);

    await sleepUntil(page, t0 + 22_500);
    expect(await framesBetween(page, t0 + 12_500, t0 + 22_500), `round ${round}: asleep`).toBe(0);

    await sleepUntil(page, t0 + 23_000);
    const wheelAt = await page.evaluate(() => performance.now());
    await page.mouse.wheel(0, -60);
    await sleepUntil(page, wheelAt + 500);
    expect(await framesBetween(page, wheelAt, wheelAt + 500), `round ${round}: a wheel wakes it`).toBeGreaterThan(0);
  }
});

test("under reduced motion the Galaxy draws no haze and schedules no frame at rest", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await countFrames(page);
  await openCosmos(page);
  const settled = await page.evaluate(() => performance.now());
  await sleepUntil(page, settled + 3_000);
  expect(await framesBetween(page, settled + 1_500, settled + 3_000)).toBe(0);
  expect(await page.evaluate(() => window.__atlasCosmos!.haze().factor)).toBe(0);
});
