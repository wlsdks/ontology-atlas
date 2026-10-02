import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { installFrameWork, p95, startFrameWork, stopFrameWork } from "./frame-work";

const PAN_MS = 3_000;
const MIN_WORK_FRAMES = 30;
const PAN_MIN_STEPS = 45;
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
  await page.evaluate(() => {
    (window as Probe).__lastFrame = undefined;
  });
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
  while (Date.now() - start < PAN_MS || step < PAN_MIN_STEPS) {
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
  await page.mouse.move(c.x, c.y);
  await page.mouse.up();
  await still(page);
  return { work, gradients, painted };
}

for (const relief of [false, true]) {
test(`the hex board at 10,000 concepts${relief ? " in relief" : ""}: one gradient per frame, culled tiles, frame work per band`, async ({ page }) => {
  test.setTimeout(300_000);
  await installFrameWork(page);
  await seedFirstRunSeen(page);
  await page.addInitScript((tilted: boolean) => window.localStorage.setItem("atlas.appearance.hex-relief", tilted ? "on" : "off"), relief);
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
  await expect(page.getByTestId("hex-board-map")).toHaveAttribute("data-hex-relief-pitch", relief ? "0.750" : "0.000");

  const results: Record<string, { p95: number; runs: number[]; frames: number; offsets: number; maxGradients: number; maxDrawnShare: number }> = {};
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
    const p95s = [p95(work)];
    while (bars && p95s.length < 3) p95s.push(p95((await pan(page)).work));
    results[s.name] = {
      p95: +[...p95s].sort((a, b) => a - b)[p95s.length >> 1]!.toFixed(2),
      runs: p95s.map((v) => +v.toFixed(2)),
      frames: work.length,
      offsets: new Set(inBand.map((f) => f.offset.join(","))).size,
      maxGradients: max(gradients, `${s.name}: gradients`),
      maxDrawnShare: +max(inBand.map((f) => f.drawnTiles / f.tiles), `${s.name}: painted frames`).toFixed(3),
    };
    expect(results[s.name]!.frames, `${s.name}: work frames`).toBeGreaterThanOrEqual(MIN_WORK_FRAMES);
    expect(results[s.name]!.offsets, `${s.name}: the pan moved the camera`).toBeGreaterThanOrEqual(2);
    expect(results[s.name]!.maxGradients, `${s.name}: gradients per frame`).toBeLessThanOrEqual(1);
    if (s.band !== "regions") expect(results[s.name]!.maxDrawnShare, `${s.name}: drawn tiles share`).toBeLessThan(0.25);
    if (bars) expect(results[s.name]!.p95, `${s.name}: p95 frame work`).toBeLessThanOrEqual(s.bar);
  }
  console.log(`[hex-frame-work${relief ? "-relief" : ""}] ${JSON.stringify(results)}`);
});
}

type Reads = Window & { __rects?: { counting: boolean; calls: number }; __loaf?: number[] };

test("the hex board at 10,000 concepts: hover and wheel read no layout and leave no long frame", async ({ page }) => {
  test.setTimeout(300_000);
  await installFrameWork(page);
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    const w = window as Reads;
    const rects = { counting: false, calls: 0 };
    w.__rects = rects;
    w.__loaf = [];
    const read = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (rects.counting) rects.calls += 1;
      return read.call(this);
    };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (rects.counting) w.__loaf!.push(entry.duration);
    }).observe({ type: "long-animation-frame" });
  });
  await page.goto("/en/topology/?synth=10000&synthDeps=1&view=hex&guides=off&e2e=1");
  await expect(page.getByTestId("hex-board-map")).toHaveAttribute("data-hex-ready", "true", { timeout: 90_000 });
  await still(page);

  const box = (await page.getByTestId("hex-board-map").locator("canvas").boundingBox())!;
  const targets = await page.evaluate(() => {
    const picks: { x: number; y: number }[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('[data-testid="hex-board-list"] [data-hex-kind="capability"][data-mark]')) {
      const [x, y] = el.dataset.mark!.split(",").map(Number) as [number, number];
      if (x < 460 || x > 1300 || y < 160 || y > 820) continue;
      if (picks.every((p) => Math.hypot(p.x - x, p.y - y) > 90)) picks.push({ x, y });
      if (picks.length === 8) break;
    }
    return picks;
  });
  expect(targets.length, "hover targets").toBe(8);

  const counters = () =>
    page.evaluate(() => {
      const w = window as Reads;
      return { rects: w.__rects!.calls, loaf: [...w.__loaf!] };
    });
  await page.evaluate(() => {
    (window as Reads).__rects!.counting = true;
  });
  await startFrameWork(page);
  let moves = 0;
  let from = { x: targets[0]!.x + 40, y: targets[0]!.y + 40 };
  for (const t of targets) {
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(box.x + from.x + ((t.x - from.x) * i) / 6, box.y + from.y + ((t.y - from.y) * i) / 6);
      moves += 1;
    }
    await expect(page.getByTestId("hex-board-tooltip")).toBeVisible();
    await still(page);
    from = t;
  }
  const hoverWork = await stopFrameWork(page);
  const hover = await counters();

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (const dy of [...Array<number>(10).fill(-100), ...Array<number>(10).fill(100)]) await page.mouse.wheel(0, dy);
  await still(page);
  const wheel = await counters();

  console.log(
    `[hex-hover] ${JSON.stringify({ moves, rects: hover.rects, hoverLoaf: hover.loaf, wheelLoaf: wheel.loaf.slice(hover.loaf.length), hoverP95: +p95(hoverWork).toFixed(2), hoverMax: +max(hoverWork, "hover frames").toFixed(2) })}`,
  );
  expect(hover.rects, "layout reads while hovering").toBeLessThanOrEqual(moves * 2);
  if (bars) expect(wheel.loaf, "long animation frames while hovering and wheeling").toEqual([]);
});
