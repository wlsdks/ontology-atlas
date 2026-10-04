import { expect, test, type Browser, type Page } from "@playwright/test";

import "./atlas-map-probe";
import { seedFirstRunSeen } from "./first-run-seed";
import { installFrameWork, p95, startFrameWork, stopFrameWork } from "./frame-work";
import { waitForMapSettled, waitForMapStill } from "./settle";
import type { DialProbe } from "../../src/widgets/ontology-map/dial/types";

const SHAPES = [
  { name: "synth 10,000", query: "synth=10000&synthDeps=1&" },
  { name: "layered 10,000", query: "synth=10000&synthDeps=1&synthShape=layered&" },
] as const;
const VIEWPORT = { width: 1512, height: 982 };
const LAUNCH_ARGS = ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"];
const PAN_MS = 3_000;
const PAN_MIN_STEPS = 45;
const IDLE_MS = 10_000;
const WORK_P95_MS = 8.3;
const LEDGER_CAPACITY = 46;
const LIGHT_WINDOW_MS = 2_400;
const LIGHT_FRAMES_LOST = 12;
const LIGHT_MARKER = "light: no shader";
const bars = process.env.MAP_PERF_BARS === "1";

test.use({ viewport: VIEWPORT, deviceScaleFactor: 2, channel: "chromium", launchOptions: { args: LAUNCH_ARGS } });

type CallWindow = Window & { __dialCalls?: { calls: number; frames: number; times: number[] } };

async function instrument(page: Page): Promise<void> {
  await installFrameWork(page);
  await page.addInitScript(() => {
    const w = window as CallWindow;
    const state = { calls: 0, frames: 0, times: [] as number[] };
    w.__dialCalls = state;
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
        if (state.times[state.times.length - 1] !== t) {
          state.frames += 1;
          state.times.push(t);
          if (state.times.length > 4_000) state.times.splice(0, 2_000);
        }
        callback(t);
      });
  });
}

async function openDial(page: Page, query: string): Promise<DialProbe> {
  await seedFirstRunSeen(page);
  await page.goto(`/en/topology/?${query}guides=off&e2e=1`, { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page, { timeout: 90_000 });
  await page.waitForFunction(() => {
    const dial = window.__atlasMap?.dial?.() as DialProbe | undefined;
    return !!dial && dial.owns && dial.placement.state === "settled";
  }, undefined, { polling: "raf", timeout: 90_000 });
  await waitForMapStill(page);
  return readDial(page);
}

const readDial = (page: Page) => page.evaluate(() => window.__atlasMap!.dial!() as DialProbe);

async function canvasOrigin(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId("ontology-map-canvas").boundingBox();
  if (box === null) throw new Error("the map canvas has no box");
  return { x: box.x, y: box.y };
}

async function callsPerFrame(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const state = (window as CallWindow).__dialCalls!;
        const probe = window.__atlasMap as unknown as { wake: () => void };
        const perFrame: number[] = [];
        let last = state.calls;
        const deadline = performance.now() + 30_000;
        const sample = () => {
          if (state.calls > last) perFrame.push(state.calls - last);
          last = state.calls;
          if (perFrame.length >= 24) {
            perFrame.sort((a, b) => a - b);
            resolve(perFrame[perFrame.length >> 1]!);
            return;
          }
          if (performance.now() > deadline) {
            reject(new Error(`the map drew ${perFrame.length} frames before the deadline`));
            return;
          }
          probe.wake();
          requestAnimationFrame(sample);
        };
        probe.wake();
        requestAnimationFrame(sample);
      }),
  );
}

async function zoomTo(page: Page, at: { x: number; y: number }, ratio: number): Promise<number> {
  const origin = await canvasOrigin(page);
  await page.mouse.move(origin.x + at.x, origin.y + at.y);
  for (;;) {
    const now = (await readDial(page)).zoomRatio;
    if (now >= ratio) return now;
    await page.mouse.wheel(0, now * 1.3 >= ratio ? -20 : -60);
    await waitForMapStill(page, { what: "camera" });
    if ((await readDial(page)).zoomRatio <= now + 1e-4) return now;
  }
}

async function emptySpot(page: Page, dial: DialProbe, origin: { x: number; y: number }): Promise<{ x: number; y: number }> {
  const r = dial.freeRect;
  const grid = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9];
  const candidates = grid.flatMap((fx) => grid.map((fy) => ({ x: r.minX + (r.maxX - r.minX) * fx, y: r.minY + (r.maxY - r.minY) * fy })));
  const clearance = (p: { x: number; y: number }) =>
    Math.min(Infinity, ...dial.clusters.map((c) => Math.hypot(c.chip.x - p.x, c.chip.y - p.y)), ...dial.discs.map((d) => Math.hypot(d.x - p.x, d.y - p.y) - d.r));
  for (const spot of candidates.sort((a, b) => clearance(b) - clearance(a))) {
    await page.mouse.move(origin.x + spot.x, origin.y + spot.y);
    const hovered = await page.evaluate(() => new Promise<string | null>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.__atlasMap!.hover())))));
    if (hovered === null) return spot;
  }
  throw new Error("no empty spot to pan from");
}

async function pan(page: Page): Promise<{ work: number[]; kinds: string[] }> {
  const dial = await readDial(page);
  const origin = await canvasOrigin(page);
  const spot = await emptySpot(page, dial, origin);
  const c = { x: origin.x + spot.x, y: origin.y + spot.y };
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 12, c.y + 4, { steps: 3 });
  await startFrameWork(page);
  const kinds = new Set<string>();
  const began = Date.now();
  let step = 0;
  while (Date.now() - began < PAN_MS || step < PAN_MIN_STEPS) {
    const angle = step * 0.05;
    await page.mouse.move(c.x + Math.cos(angle) * 60, c.y + Math.sin(angle) * 45);
    kinds.add(await page.evaluate(() => new Promise<string>((resolve) => requestAnimationFrame(() => resolve(window.__atlasMap!.interaction?.().kind ?? "none")))));
    step += 1;
  }
  const work = await stopFrameWork(page);
  await page.mouse.up();
  await waitForMapStill(page);
  return { work, kinds: [...kinds] };
}

async function idleFrames(page: Page): Promise<number> {
  await waitForMapStill(page);
  let seen = -1;
  await expect
    .poll(
      async () => {
        const now = await page.evaluate(() => (window as CallWindow).__dialCalls!.frames);
        const stable = now === seen;
        seen = now;
        return stable;
      },
      { timeout: 30_000, intervals: [1_500] },
    )
    .toBe(true);
  const before = await page.evaluate(() => (window as CallWindow).__dialCalls!.frames);
  await page.evaluate((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)), IDLE_MS);
  return (await page.evaluate(() => (window as CallWindow).__dialCalls!.frames)) - before;
}

const round = (n: number) => +n.toFixed(2);

for (const shape of SHAPES) {
  test(`${shape.name}: the dial's calls per frame stay inside the count bar, pans inside the work bar, idle draws nothing`, async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await instrument(page);
    const dial = await openDial(page, shape.query);
    const D = dial.clusters.length;

    const overviewCalls = await callsPerFrame(page);
    const overviewPan = await pan(page);
    const idle = await idleFrames(page);

    const target = [...dial.clusters].sort((a, b) => b.capabilityIds.length - a.capabilityIds.length)[0]!;
    const zoom25 = await zoomTo(page, target.chip, 2.5);
    const zoomCalls = await callsPerFrame(page);
    const zoom5 = await zoomTo(page, (await readDial(page)).clusters.find((c) => c.domainId === target.domainId)!.chip, 5);
    const zoomPan = await pan(page);

    const result = {
      D,
      overviewCalls,
      overviewCallBar: 40 + 14 * D,
      zoom25: round(zoom25),
      zoomCalls,
      zoomCallBar: 200 + 14 * D,
      overviewWorkP95: round(p95(overviewPan.work)),
      overviewFrames: overviewPan.work.length,
      zoom5: round(zoom5),
      zoomWorkP95: round(p95(zoomPan.work)),
      zoomFrames: zoomPan.work.length,
      idleFrames: idle,
      kinds: [overviewPan.kinds, zoomPan.kinds],
    };
    console.log(`[flat-dial-frame-work] ${shape.name} ${JSON.stringify(result)}`);

    expect(overviewPan.kinds, "the overview pan moved the camera, never a node").toContain("pan");
    expect(overviewPan.kinds, "the overview pan grabbed no node").not.toContain("node");
    expect(zoomPan.kinds, "the zoomed pan moved the camera").toContain("pan");
    expect(zoomPan.kinds, "the zoomed pan grabbed no node").not.toContain("node");
    expect(zoom25, "reached zoom 2.5").toBeGreaterThanOrEqual(2.5);
    expect.soft(overviewCalls, "canvas calls per frame at the overview").toBeLessThanOrEqual(result.overviewCallBar);
    expect.soft(zoomCalls, "canvas calls per frame at zoom 2.5").toBeLessThanOrEqual(result.zoomCallBar);
    expect(errors).toEqual([]);
    if (bars) {
      expect(zoom5, "reached zoom 5").toBeGreaterThanOrEqual(5);
      expect.soft(result.overviewWorkP95, "overview pan work p95").toBeLessThanOrEqual(WORK_P95_MS);
      expect.soft(result.zoomWorkP95, "zoom-5× pan work p95").toBeLessThanOrEqual(WORK_P95_MS);
      expect.soft(idle, "frames in 10 s of idle").toBe(0);
    }
  });

  test(`${shape.name}: the largest domain's ledger lists min(n, capacity) whole names and counts the rest`, async ({ page }) => {
    test.setTimeout(240_000);
    const dial = await openDial(page, shape.query);
    const target = [...dial.clusters].sort((a, b) => b.capabilityIds.length - a.capabilityIds.length)[0]!;
    const n = target.capabilityIds.length;
    const origin = await canvasOrigin(page);
    await page.mouse.move(origin.x + target.chip.x, origin.y + target.chip.y);
    let ledger: DialProbe["ledger"] = null;
    let last: DialProbe = dial;
    for (let step = 0; step < 40; step += 1) {
      last = await readDial(page);
      if (last.ledger?.domainId === target.domainId) {
        ledger = last.ledger;
        break;
      }
      const chip = last.clusters.find((c) => c.domainId === target.domainId)!.chip;
      await page.mouse.move(origin.x + chip.x, origin.y + chip.y);
      await page.mouse.wheel(0, -60);
      await waitForMapStill(page, { what: "camera" });
    }
    const texts = last.texts.filter((t) => t.role === "ledger" || t.role === "more");
    console.log(`[flat-dial-frame-work] ${shape.name} ledger ${JSON.stringify({ domain: target.domainId, n, zoom: round(last.zoomRatio), ledger })}`);
    expect(ledger, `${target.domainId} (${n} capabilities) opens a ledger`).not.toBeNull();
    expect(ledger!.total, "the ledger counts the domain's capabilities").toBe(n);
    expect.soft(ledger!.shown, "shown = min(n, capacity), capacity ≥ 46").toBeGreaterThanOrEqual(Math.min(n, LEDGER_CAPACITY));
    expect.soft(ledger!.more, "more = n − shown").toBe(n - ledger!.shown);
    expect.soft(ledger!.leaderCrossings, "leader crossings").toBe(0);
    expect.soft(texts.filter((t) => t.text.includes("…")).map((t) => t.text), "every ledger name whole").toEqual([]);
  });
}

async function lightRun(browser: Browser, blocked: boolean): Promise<{ lost: number; frames: number; layer: boolean }> {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    if (blocked) {
      await page.route("**/_next/static/chunks/*.js", async (route) => {
        const response = await route.fetch();
        const body = await response.text();
        if (body.includes(LIGHT_MARKER)) await route.abort();
        else await route.fulfill({ response, body });
      });
    }
    await instrument(page);
    const dial = await openDial(page, SHAPES[0].query);
    const domain = dial.flows.find((f) => f.drawn && !f.relatesOnly)?.a ?? dial.clusters[0]!.domainId;
    const start = await page.evaluate((id) => {
      (window.__atlasMap as unknown as { select: (id: string) => void }).select(id);
      return performance.now();
    }, domain);
    await page.evaluate((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)), LIGHT_WINDOW_MS);
    const times = await page.evaluate((from) => (window as CallWindow).__dialCalls!.times.filter((t) => t >= from), start);
    const layer = (await page.locator('[data-testid="map-light"]').count()) > 0;
    const gaps = times.slice(1).map((t, i) => t - times[i]!);
    const vsync = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 4)] ?? 1000 / 60;
    const lost = gaps.reduce((sum, g) => sum + (g < 100 ? Math.max(0, Math.round(g / vsync) - 1) : 0), 0);
    return { lost, frames: times.length, layer };
  } finally {
    await context.close();
  }
}

test("synth 10,000: the light costs at most 12 frames per 2.4 s after a domain focus", async ({ browser }) => {
  test.skip(!bars, "a local frame-rate falsifier: MAP_PERF_BARS=1, headed");
  test.setTimeout(600_000);
  const lost: number[] = [];
  const pairs: { light: Awaited<ReturnType<typeof lightRun>>; blocked: Awaited<ReturnType<typeof lightRun>> }[] = [];
  for (let pair = 0; pair < 3; pair += 1) {
    const light = await lightRun(browser, false);
    const blocked = await lightRun(browser, true);
    expect(light.layer, "the light layer mounted").toBe(true);
    expect(blocked.layer, "the blocked build has no light layer").toBe(false);
    pairs.push({ light, blocked });
    lost.push(light.lost - blocked.lost);
  }
  lost.sort((a, b) => a - b);
  console.log(`[flat-dial-frame-work] light falsifier ${JSON.stringify({ pairs, medianLost: lost[1] })}`);
  expect(lost[1], "median frames lost to the light per 2.4 s").toBeLessThanOrEqual(LIGHT_FRAMES_LOST);
});
