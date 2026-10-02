import { expect, test, type Page } from "@playwright/test";
import { waitForCosmosStill } from "./atlas-cosmos-probe";
import { seedFirstRunSeen } from "./first-run-seed";
import { p95 } from "./frame-work";

const CANVAS = '[data-testid="ontology-map-canvas"]';
const PAN_MS = 3_000;
const IN_PAGE_PAN_MS = 4_000;
const IDLE_MS = 10_000;
const ZOOM_RATIO = 2.6;
const FRAME_BAR_MS = 16.7;
const OVERVIEW_WORK_P95_MS = 4.0;
const ZOOMED_WORK_P95_MS = 8.3;
const SHARE_BAR = 0.99;
const MAX_INTERVAL_MS = 50;
const CACHE_CAP_BYTES = 48 * 1024 * 1024;
const bars = process.env.MAP_PERF_BARS === "1";

test.use({
  viewport: { width: 1512, height: 982 },
  deviceScaleFactor: 2,
  channel: "chromium",
  launchOptions: {
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"],
  },
});

type Window_ = Window & { __paintCalls?: Map<number, number>; __longTasks?: { start: number; ms: number }[] };

async function instrument(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as Window_;
    const calls = new Map<number, number>();
    w.__paintCalls = calls;
    w.__longTasks = [];
    for (const proto of [CanvasRenderingContext2D.prototype, globalThis.OffscreenCanvasRenderingContext2D?.prototype]) {
      if (!proto) continue;
      for (const name of ["createRadialGradient", "createLinearGradient", "createPattern"] as const) {
        const original = proto[name] as (...args: unknown[]) => unknown;
        Object.defineProperty(proto, name, {
          configurable: true,
          writable: true,
          value(this: unknown, ...args: unknown[]) {
            const frame = window.__atlasCosmos?.frames() ?? -1;
            calls.set(frame, (calls.get(frame) ?? 0) + 1);
            return original.apply(this, args);
          },
        });
      }
    }
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__longTasks!.push({ start: e.startTime, ms: e.duration });
      }).observe({ type: "longtask", buffered: true });
    } catch {}
  });
}

async function openGalaxy(page: Page): Promise<void> {
  await seedFirstRunSeen(page);
  await page.goto("/en/topology/?view=galaxy&synth=10000&synthDeps=1&guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(() => window.__atlasCosmos?.layout()?.galaxies.length ?? 0), { timeout: 90_000 }).toBeGreaterThan(0);
  await settled(page);
}

async function settled(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const probe = window.__atlasCosmos!;
          const stats = probe.stats();
          return Boolean(stats && stats.pendingBuilds === 0 && !probe.arrival().active);
        }),
      { timeout: 60_000 },
    )
    .toBe(true);
  await waitForCosmosStill(page);
}

interface Window_Frames {
  frames: { n: number; t: number; ms: number; builds: number; firstDraws: number; calls: number }[];
  kinds: string[];
  longTasks: number;
}

async function markStart(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as Window_ & { __kinds?: string[]; __kindRaf?: number };
    w.__kinds = [];
    let last = window.__atlasCosmos!.frames();
    const tick = () => {
      const probe = window.__atlasCosmos!;
      if (probe.frames() !== last) {
        last = probe.frames();
        w.__kinds!.push(probe.interaction().kind);
      }
      w.__kindRaf = requestAnimationFrame(tick);
    };
    w.__kindRaf = requestAnimationFrame(tick);
    return performance.now();
  });
}

async function collect(page: Page, since: number): Promise<Window_Frames> {
  return page.evaluate((start) => {
    const w = window as Window_ & { __kinds?: string[]; __kindRaf?: number };
    cancelAnimationFrame(w.__kindRaf ?? 0);
    const probe = window.__atlasCosmos!;
    const log = probe.frameLog();
    const first = probe.frames() - log.length;
    const frames = log
      .map((e, i) => ({ n: first + i, t: e.t, ms: e.ms, builds: e.builds, firstDraws: e.firstDraws, calls: w.__paintCalls!.get(first + i) ?? 0 }))
      .filter((f) => f.t >= start);
    const longTasks = w.__longTasks!.filter((l) => l.start >= start).length;
    return { frames, kinds: w.__kinds ?? [], longTasks };
  }, since);
}

async function canvasCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator(CANVAS).boundingBox();
  if (box === null) throw new Error("the cosmos canvas has no box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function pointerPan(page: Page): Promise<Window_Frames> {
  const center = await canvasCenter(page);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 12, center.y + 4, { steps: 3 });
  const start = await markStart(page);
  const began = Date.now();
  let step = 0;
  while (Date.now() - began < PAN_MS) {
    const angle = step * 0.05;
    await page.mouse.move(center.x + Math.cos(angle) * 160, center.y + Math.sin(angle) * 120);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    step += 1;
  }
  const result = await collect(page, start);
  await page.mouse.up();
  await waitForCosmosStill(page);
  return result;
}

async function inPagePan(page: Page): Promise<Window_Frames> {
  const center = await canvasCenter(page);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  const start = await page.evaluate(
    ({ selector, ms, cx, cy }) =>
      new Promise<number>((resolve) => {
        const canvas = document.querySelector(selector)!;
        const t0 = performance.now();
        let step = 0;
        const tick = (now: number) => {
          step += 1;
          const angle = step * 0.06;
          canvas.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, pointerType: "mouse", buttons: 1, bubbles: true, clientX: cx + Math.cos(angle) * 180, clientY: cy + Math.sin(angle) * 130 }));
          if (now - t0 < ms) requestAnimationFrame(tick);
          else resolve(t0);
        };
        requestAnimationFrame(tick);
      }),
    { selector: CANVAS, ms: IN_PAGE_PAN_MS, cx: center.x, cy: center.y },
  );
  const result = await collect(page, start + 250);
  await page.mouse.up();
  await waitForCosmosStill(page);
  return result;
}

function paintCallsWithoutBuilds(frames: Window_Frames["frames"]): number {
  return frames.filter((f) => f.builds === 0).reduce((sum, f) => sum + f.calls, 0);
}

function intervals(frames: Window_Frames["frames"]): number[] {
  return frames.slice(1).map((f, i) => f.t - frames[i]!.t);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

test("Galaxy at 10,000 concepts: pans draw no new gradients, stay inside the cache cap and the frame bars", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await instrument(page);
  await openGalaxy(page);

  const overview = await page.evaluate(() => window.__atlasCosmos!.stats()!);
  expect(overview.liveStars, "no live star at the overview").toBe(0);
  expect(overview.impostorGalaxies, "every galaxy is an impostor at the overview").toBe(33);

  const overviewPan = await pointerPan(page);
  expect(overviewPan.frames.length, "the overview pan drew frames").toBeGreaterThan(10);
  expect(overviewPan.kinds.filter((k) => k !== "pan"), "every overview pan frame is a pan").toEqual([]);
  expect(paintCallsWithoutBuilds(overviewPan.frames), "gradients or patterns made in overview pan frames without a bake").toBe(0);

  const center = await canvasCenter(page);
  await page.mouse.move(center.x, center.y);
  while ((await page.evaluate(() => window.__atlasCosmos!.camera().zoomRatio)) < ZOOM_RATIO) {
    await page.mouse.wheel(0, -120);
    await waitForCosmosStill(page, 6);
  }
  await settled(page);
  const zoomRatio = await page.evaluate(() => window.__atlasCosmos!.camera().zoomRatio);
  const zoomedPan = await pointerPan(page);
  expect(zoomedPan.kinds.filter((k) => k !== "pan"), "every zoomed pan frame is a pan").toEqual([]);
  expect(paintCallsWithoutBuilds(zoomedPan.frames), "gradients or patterns made in zoomed pan frames without a bake").toBe(0);

  const runs: { share: number; max: number; frames: number; longTasks: number; afterFirstDraw: number[] }[] = [];
  for (let run = 0; run < 3; run += 1) {
    if (run === 0) {
      await page.evaluate(() => window.__atlasCosmos!.dropBitmaps());
      await settled(page);
    }
    const pan = await inPagePan(page);
    expect(paintCallsWithoutBuilds(pan.frames), `gradients or patterns made in in-page pan ${run + 1} frames without a bake`).toBe(0);
    const gaps = intervals(pan.frames);
    const afterFirstDraw = pan.frames.slice(1).flatMap((f, i) => (pan.frames[i]!.firstDraws > 0 && gaps[i]! > FRAME_BAR_MS ? [+gaps[i]!.toFixed(1)] : []));
    runs.push({
      share: gaps.filter((g) => g <= FRAME_BAR_MS).length / Math.max(1, gaps.length),
      max: Math.max(0, ...gaps),
      frames: pan.frames.length,
      longTasks: pan.longTasks,
      afterFirstDraw,
    });
  }

  const flown = await page.evaluate(() => window.__atlasCosmos!.layout()!.galaxies.slice().sort((a, b) => b.members - a.members).slice(0, 5).map((g) => g.id));
  for (const id of flown) {
    await page.evaluate((galaxy) => window.__atlasCosmos!.flyTo(galaxy), id);
    await settled(page);
  }
  await page.evaluate(() => window.__atlasCosmos!.overview());
  await settled(page);
  const cacheBytes = await page.evaluate(() => window.__atlasCosmos!.cacheBytes());

  const result = {
    overviewWorkP95: +p95(overviewPan.frames.map((f) => f.ms)).toFixed(2),
    overviewFrames: overviewPan.frames.length,
    overviewLongTasks: overviewPan.longTasks,
    zoomRatio: +zoomRatio.toFixed(2),
    zoomedWorkP95: +p95(zoomedPan.frames.map((f) => f.ms)).toFixed(2),
    zoomedFrames: zoomedPan.frames.length,
    zoomedLongTasks: zoomedPan.longTasks,
    inPage: runs.map((r) => ({ ...r, share: +r.share.toFixed(4), max: +r.max.toFixed(1) })),
    inPageShareMedian: +median(runs.map((r) => r.share)).toFixed(4),
    cacheMiB: +(cacheBytes / 1024 / 1024).toFixed(2),
  };
  console.log(`[galaxy-frame-work] ${JSON.stringify(result)}`);

  expect(cacheBytes, "baked bitmaps after five galaxies and back").toBeLessThanOrEqual(CACHE_CAP_BYTES);
  expect(errors).toEqual([]);
  if (bars) {
    expect(result.overviewWorkP95, "overview pan work p95").toBeLessThanOrEqual(OVERVIEW_WORK_P95_MS);
    expect(result.zoomedWorkP95, "zoomed pan work p95").toBeLessThanOrEqual(ZOOMED_WORK_P95_MS);
    expect(result.inPageShareMedian, "in-page zoomed pan share of intervals within 16.7 ms").toBeGreaterThanOrEqual(SHARE_BAR);
    for (const run of runs) expect(run.max, "in-page zoomed pan max interval").toBeLessThanOrEqual(MAX_INTERVAL_MS);
    expect(overviewPan.longTasks + zoomedPan.longTasks + runs.reduce((s, r) => s + r.longTasks, 0), "long tasks during pans").toBe(0);
  }
});

test("Galaxy at 10,000 concepts draws no frame in ten idle seconds under reduced motion", async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openGalaxy(page);
  await expect.poll(() => page.evaluate(() => window.__atlasCosmos!.awake()), { timeout: 30_000 }).toBe(false);
  let seen = -1;
  await expect
    .poll(
      async () => {
        const now = await page.evaluate(() => window.__atlasCosmos!.frames());
        const stable = now === seen;
        seen = now;
        return stable;
      },
      { timeout: 30_000, intervals: [1_500] },
    )
    .toBe(true);
  const before = await page.evaluate(() => window.__atlasCosmos!.frames());
  // measurement window: ten idle seconds with no input
  await page.evaluate((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)), IDLE_MS);
  const after = await page.evaluate(() => window.__atlasCosmos!.frames());
  console.log(`[galaxy-frame-work] reduced-motion idle frames: ${after - before}`);
  expect(after - before, "frames drawn in 10 s of reduced-motion idle").toBe(0);
});
