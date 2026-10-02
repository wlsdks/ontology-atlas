import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { installFrameWork, p95, startFrameWork, stopFrameWork } from "./frame-work";

const PAN_MS = 3_000;
const bars = process.env.MAP_PERF_BARS === "1";
const SCENARIOS = [
  { name: "rest", band: "regions", R: 0, bar: 4.0 },
  { name: "floors", band: "regions", R: 15, bar: 8.3 },
  { name: "pips", band: "pips", R: 36, bar: 8.3 },
  { name: "names", band: "names", R: 56, bar: 8.3 },
] as const;

test.use({
  viewport: { width: 1512, height: 982 },
  deviceScaleFactor: 2,
  channel: "chromium",
  launchOptions: {
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"],
  },
});

type Probe = Window & { __gradients?: Map<number, number>; __frameT?: number; __lastFrame?: string };

interface Frame {
  band: string;
  R: number;
  tiles: number;
  drawnTiles: number;
  slabs: boolean;
  arrived: boolean;
  offset: [number, number];
}

const readFrame = (page: Page) =>
  page.evaluate(() => JSON.parse(document.querySelector<HTMLCanvasElement>('[data-testid="hex-board-map"] canvas')!.dataset.frame ?? "{}") as Frame);

async function still(page: Page) {
  await page.waitForFunction(
    () => {
      const w = window as Probe;
      const frame = document.querySelector<HTMLCanvasElement>('[data-testid="hex-board-map"] canvas')?.dataset.frame;
      const same = !!frame && frame === w.__lastFrame;
      w.__lastFrame = frame;
      return same && (JSON.parse(frame) as Frame).arrived === true;
    },
    undefined,
    { polling: 200, timeout: 30_000 },
  );
}

function max(values: readonly number[], what: string): number {
  expect(values.length, `${what}: samples`).toBeGreaterThan(0);
  return Math.max(...values);
}

async function centre(page: Page) {
  const box = (await page.getByTestId("hex-board-map").locator("canvas").boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function zoomTo(page: Page, R: number) {
  const c = await centre(page);
  await page.mouse.move(c.x, c.y);
  while ((await readFrame(page)).R < R) {
    await page.mouse.wheel(0, -40);
    await still(page);
  }
}

async function plateOverlaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const plates = [...document.querySelectorAll<HTMLElement>("[data-hex-id][data-plate-box]")].map((el) => {
      const [x, y, w, h] = el.dataset.plateBox!.split(",").map(Number) as [number, number, number, number];
      return { id: el.dataset.hexId!, x, y, w, h };
    });
    const hits: string[] = [];
    for (let i = 0; i < plates.length; i++) {
      for (let j = i + 1; j < plates.length; j++) {
        const a = plates[i]!;
        const b = plates[j]!;
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) hits.push(`${a.id} × ${b.id}`);
      }
    }
    return hits;
  });
}

async function pan(page: Page) {
  const c = await centre(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await startFrameWork(page);
  await page.evaluate(() => (window as Probe).__gradients!.clear());
  const painted: Frame[] = [];
  let last = "";
  const start = Date.now();
  let step = 0;
  while (Date.now() - start < PAN_MS) {
    const angle = step * 0.05;
    await page.mouse.move(c.x + Math.cos(angle) * 160, c.y + Math.sin(angle) * 120);
    const frame = await page.evaluate(
      () => new Promise<string>((resolve) => requestAnimationFrame(() => resolve(document.querySelector<HTMLCanvasElement>('[data-testid="hex-board-map"] canvas')!.dataset.frame ?? ""))),
    );
    if (frame && frame !== last) painted.push(JSON.parse(frame) as Frame);
    last = frame;
    step += 1;
  }
  const work = await stopFrameWork(page);
  const gradients = await page.evaluate(() => [...(window as Probe).__gradients!.values()]);
  await page.mouse.up();
  await still(page);
  return { work, gradients, painted };
}

test("the hex board at 10,000 concepts: one gradient per frame, culled tiles, frame work per band", async ({ page }) => {
  test.setTimeout(300_000);
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

  const results: Record<string, { p95: number; frames: number; offsets: number; maxGradients: number; maxDrawnShare: number }> = {};
  for (const s of SCENARIOS) {
    await zoomTo(page, s.R);
    const at = await readFrame(page);
    expect(at.band, `${s.name}: band`).toBe(s.band);
    if (s.band === "regions") {
      expect(at.slabs, `${s.name}: slabs`).toBe(s.name === "rest");
      expect(await plateOverlaps(page), `${s.name}: name plates overlap`).toEqual([]);
    }
    const { work, gradients, painted } = await pan(page);
    const inBand = painted.filter((f) => f.band === s.band);
    results[s.name] = {
      p95: +p95(work).toFixed(2),
      frames: work.length,
      offsets: new Set(inBand.map((f) => f.offset.join(","))).size,
      maxGradients: max(gradients, `${s.name}: gradients`),
      maxDrawnShare: +max(inBand.map((f) => f.drawnTiles / f.tiles), `${s.name}: painted frames`).toFixed(3),
    };
    expect(results[s.name]!.frames, `${s.name}: work frames`).toBeGreaterThanOrEqual(30);
    expect(results[s.name]!.offsets, `${s.name}: the pan moved the camera`).toBeGreaterThanOrEqual(2);
    expect(results[s.name]!.maxGradients, `${s.name}: gradients per frame`).toBeLessThanOrEqual(1);
    if (s.band !== "regions") expect(results[s.name]!.maxDrawnShare, `${s.name}: drawn tiles share`).toBeLessThan(0.25);
    if (bars) expect(results[s.name]!.p95, `${s.name}: p95 frame work`).toBeLessThanOrEqual(s.bar);
  }
  console.log(`[hex-frame-work] ${JSON.stringify(results)}`);
});
