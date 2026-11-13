import { expect, test, type Page } from "@playwright/test";

import "../../atlas-map-probe";
import { seedFirstRunSeen } from "../../first-run-seed";
import { useDogfoodSample } from "../../sample-source";
import { waitForMapSettled, waitForMapStill } from "../../settle";
import type { DialProbe } from "../../../../src/widgets/ontology-map/dial/types";

const IDLE_QUIET_MS = 3_000;
const PAN_STEPS = 40;
/** Canvas calls a frame may spend beyond its drawn marks: background, lights per domain, grouped paths. */
const CALL_BASE = 80;
const CALLS_PER_DOMAIN = 16;
/** A drawn disc costs its glow sprite plus its share of grouped paths; a name its halo and fill. */
const CALLS_PER_MARK = 2;

type CallWindow = Window & { __calls?: { calls: number; frames: number[]; lastAt: number } };

async function instrument(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as CallWindow;
    const state = { calls: 0, frames: [] as number[], lastAt: 0 };
    w.__calls = state;
    const proto = CanvasRenderingContext2D.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const name of ["stroke", "fill", "drawImage", "fillText", "strokeText", "fillRect", "strokeRect"]) {
      const original = proto[name]!;
      proto[name] = function (this: unknown, ...args: unknown[]) {
        state.calls += 1;
        return original.apply(this, args);
      };
    }
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => raf((t) => {
      const before = state.calls;
      state.lastAt = performance.now();
      callback(t);
      if (state.calls > before) state.frames.push(state.calls - before);
    });
  });
}

async function open(page: Page, query: string): Promise<DialProbe> {
  await seedFirstRunSeen(page);
  await page.goto(`/en/topology/?${query}guides=off&e2e=1`, { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page, { timeout: 120_000 });
  await page.waitForFunction(() => window.__atlasMap?.dial?.()?.owns === true, undefined, { timeout: 120_000 });
  await waitForMapStill(page);
  return page.evaluate(() => window.__atlasMap!.dial!() as DialProbe);
}

function namesOutside(dial: DialProbe): string[] {
  const r = dial.freeRect;
  return dial.texts
    .filter((t) => t.box.minX < r.minX - 0.5 || t.box.maxX > r.maxX + 0.5 || t.box.minY < r.minY - 0.5 || t.box.maxY > r.maxY + 0.5)
    .map((t) => `${t.role}:${t.id} ${Math.round(t.box.minX)}..${Math.round(t.box.maxX)} in ${Math.round(r.minX)}..${Math.round(r.maxX)}`);
}

function discsOnTitles(dial: DialProbe): string[] {
  const titles = dial.texts.filter((t) => t.id !== null && (t.role === "domain" || t.role === "units"));
  const hits: string[] = [];
  for (const t of titles) {
    for (const d of dial.discs) {
      if (d.id === t.id) continue;
      const nx = Math.min(t.box.maxX, Math.max(t.box.minX, d.x));
      const ny = Math.min(t.box.maxY, Math.max(t.box.minY, d.y));
      if (Math.hypot(d.x - nx, d.y - ny) < d.r) hits.push(`${d.id} on ${t.role}:${t.id}`);
    }
  }
  return hits;
}

test("at 2,000 concepts a pan paints per drawn mark, never per concept, and a resting map draws nothing", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await instrument(page);
  const dial = await open(page, "synth=2000&synthDeps=1&");
  const box = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  const r = dial.freeRect;
  const corners = [{ x: r.minX + 30, y: r.maxY - 30 }, { x: r.maxX - 30, y: r.maxY - 30 }, { x: r.minX + 30, y: r.minY + 30 }, { x: r.maxX - 30, y: r.minY + 30 }];
  let start: { x: number; y: number } | null = null;
  for (const c of corners) {
    await page.mouse.move(box.x + c.x, box.y + c.y);
    const hit = await page.evaluate(() => new Promise<string | null>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.__atlasMap!.hover())))));
    if (hit === null) {
      start = { x: box.x + c.x, y: box.y + c.y };
      break;
    }
  }
  expect(start, "an empty corner to pan from").not.toBeNull();
  await page.evaluate(() => { (window as CallWindow).__calls!.frames.length = 0; });
  await page.mouse.down();
  for (let step = 1; step <= PAN_STEPS; step += 1) await page.mouse.move(start!.x + step * 4, start!.y - step * 2);
  await page.mouse.up();
  const frames = await page.evaluate(() => [...(window as CallWindow).__calls!.frames]);
  const panned = await page.evaluate(() => window.__atlasMap!.dial!() as DialProbe);
  expect(frames.length, "the pan drew frames").toBeGreaterThan(5);
  const median = [...frames].sort((a, b) => a - b)[frames.length >> 1]!;
  const bound = CALL_BASE + CALLS_PER_DOMAIN * dial.clusters.length + CALLS_PER_MARK * (Math.max(dial.discs.length, panned.discs.length) + Math.max(dial.texts.length, panned.texts.length));
  console.log(`[flat-graph-scale] calls/frame median ${median}, bound ${bound}, frames ${frames.length}, discs ${dial.discs.length}, texts ${dial.texts.length}`);
  expect(median, "canvas calls per panned frame").toBeLessThanOrEqual(bound);

  await waitForMapStill(page);
  await page.waitForFunction((quietMs) => performance.now() - (window as CallWindow).__calls!.lastAt > quietMs, IDLE_QUIET_MS, { polling: 250, timeout: 60_000 });
});

/** Pairs of capability discs drawn into each other, by more than antialiasing. O(n²) over the drawn discs. */
function overlappingCapabilityDiscs(dial: DialProbe, capabilityIds: ReadonlySet<string>): string[] {
  const discs = dial.discs.filter((d) => capabilityIds.has(d.id));
  const hits: string[] = [];
  for (let i = 0; i < discs.length; i += 1) {
    for (let j = i + 1; j < discs.length; j += 1) {
      const a = discs[i]!;
      const b = discs[j]!;
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r - 0.5) hits.push(`${a.id} × ${b.id}`);
    }
  }
  return hits;
}

test("at 5,000 concepts on a laptop a crowded domain's capability discs shrink until none overlaps another", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const dial = await open(page, "synth=5000&synthDeps=1&");
  const capabilityIds = new Set(await page.evaluate(() => window.__atlasMap!.nodes().filter((n) => n.kind === "capability").map((n) => n.id)));
  const drawn = dial.discs.filter((d) => capabilityIds.has(d.id));
  const smallestFullPx = Number(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--map-graph-cap-disc-min-px")));
  expect(drawn.length).toBeGreaterThan(100);
  expect(drawn.filter((d) => d.r < smallestFullPx).length, "the overview is crowded enough to shrink discs").toBeGreaterThan(0);
  expect(overlappingCapabilityDiscs(dial, capabilityIds)).toEqual([]);
});

for (const source of ["dogfood", "storefront", "synth"] as const) {
  test(`at a laptop width every ${source} name stays inside the free map and no disc sits on a domain title`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1512, height: 900 });
    if (source === "dogfood") await useDogfoodSample(page);
    if (source === "storefront") await page.addInitScript(() => window.localStorage.setItem("demo:sample-source:v1", "storefront"));
    const dial = await open(page, source === "synth" ? "synth=2000&synthDeps=1&" : "");
    expect(dial.texts.length).toBeGreaterThan(0);
    expect(namesOutside(dial)).toEqual([]);
    expect(discsOnTitles(dial)).toEqual([]);
  });
}
