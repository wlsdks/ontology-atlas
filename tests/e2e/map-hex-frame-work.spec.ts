import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { installFrameWork, p95, startFrameWork, stopFrameWork } from "./frame-work";

const PAN_MS = 3_000;
const bars = process.env.MAP_PERF_BARS === "1";
const BARS = { names: 8.3, pips: 8.3, regions: 4.0 } as const;

test.use({
  viewport: { width: 1512, height: 982 },
  deviceScaleFactor: 2,
  channel: "chromium",
  launchOptions: {
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"],
  },
});

type Probe = Window & { __gradients?: Map<number, number>; __frameT?: number };

interface Frame {
  band: string;
  R: number;
  tiles: number;
  drawnTiles: number;
}

const readFrame = (page: Page) =>
  page.evaluate(() => JSON.parse(document.querySelector<HTMLCanvasElement>('[data-testid="hex-board-map"] canvas')!.dataset.frame ?? "{}") as Frame);

async function still(page: Page) {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="hex-board-map"] canvas');
        const a = canvas?.dataset.frame;
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(!!a && canvas?.dataset.frame === a)));
      }),
    undefined,
    { timeout: 30_000 },
  );
}

async function centre(page: Page) {
  const box = (await page.getByTestId("hex-board-map").locator("canvas").boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function zoomTo(page: Page, R: number) {
  const c = await centre(page);
  await page.mouse.move(c.x, c.y);
  while ((await readFrame(page)).R < R) {
    await page.mouse.wheel(0, -60);
    await still(page);
  }
}

async function pan(page: Page) {
  const c = await centre(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await startFrameWork(page);
  await page.evaluate(() => (window as Probe).__gradients!.clear());
  const frames: Frame[] = [];
  const start = Date.now();
  let step = 0;
  while (Date.now() - start < PAN_MS) {
    const angle = step * 0.05;
    await page.mouse.move(c.x + Math.cos(angle) * 160, c.y + Math.sin(angle) * 120);
    frames.push(await page.evaluate(() => new Promise<Frame>((resolve) => requestAnimationFrame(() => resolve(JSON.parse(document.querySelector<HTMLCanvasElement>('[data-testid="hex-board-map"] canvas')!.dataset.frame ?? "{}") as Frame)))));
    step += 1;
  }
  const work = await stopFrameWork(page);
  const gradients = await page.evaluate(() => [...(window as Probe).__gradients!.values()]);
  await page.mouse.up();
  await still(page);
  return { work, gradients, frames };
}

test("the hex board at 10,000 concepts: one gradient per frame, culled tiles, frame work per band", async ({ page }) => {
  test.setTimeout(240_000);
  await installFrameWork(page);
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    const w = window as Probe;
    w.__gradients = new Map();
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      raf((t) => {
        w.__frameT = t;
        try {
          callback(t);
        } finally {
          w.__frameT = undefined;
        }
      });
    const proto = CanvasRenderingContext2D.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const name of ["createLinearGradient", "createRadialGradient"]) {
      const original = proto[name]!;
      proto[name] = function (this: unknown, ...args: unknown[]) {
        if (w.__frameT !== undefined) w.__gradients!.set(w.__frameT, (w.__gradients!.get(w.__frameT) ?? 0) + 1);
        return original.apply(this, args);
      };
    }
  });
  await page.goto("/en/topology/?synth=10000&synthDeps=1&synthEvidence=12&view=hex&guides=off&e2e=1");
  await expect(page.getByTestId("hex-board-map")).toHaveAttribute("data-hex-ready", "true", { timeout: 90_000 });
  await still(page);

  const results: Record<string, { p95: number; frames: number; maxGradients: number; maxDrawnShare: number }> = {};
  for (const [band, R] of [["regions", 0], ["pips", 36], ["names", 56]] as const) {
    await zoomTo(page, R);
    const { work, gradients, frames } = await pan(page);
    const drawn = frames.filter((f) => f.band === band);
    results[band] = {
      p95: +p95(work).toFixed(2),
      frames: work.length,
      maxGradients: Math.max(...gradients),
      maxDrawnShare: +Math.max(...drawn.map((f) => f.drawnTiles / f.tiles)).toFixed(3),
    };
    expect(drawn.length, `${band}: the pan stayed in its band`).toBeGreaterThan(0);
    expect(results[band].maxGradients, `${band}: gradients per frame`).toBeLessThanOrEqual(1);
    if (band !== "regions") expect(results[band].maxDrawnShare, `${band}: drawn tiles share`).toBeLessThan(0.25);
    if (bars) expect(results[band].p95, `${band}: p95 frame work`).toBeLessThanOrEqual(BARS[band]);
  }
  console.log(`[hex-frame-work] ${JSON.stringify(results)}`);
});
