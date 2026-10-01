import { expect, test, type Page } from "@playwright/test";

import "./atlas-map-probe";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapSettled, waitForMapStill } from "./settle";

interface LightHead {
  source: string;
  key: string;
  t: number;
  x: number;
  y: number;
  arrived: boolean;
  revealBound: boolean;
}

interface LightFrame {
  now: number;
  lightMs: number;
  focus: string | null;
  reveal: number;
  standDowns: number;
  drew: boolean;
  heads: LightHead[];
  blooms: { id: string; strength: number }[];
  glue: { key: string; ambiguous: boolean; offsetPx: number; lineContrast: number; lightPeak: number; headInk: number; aheadInk: number }[];
}

interface LightSignal {
  key: string;
  fromId: string;
  toId: string;
  startMs: number;
  durationMs: number;
  arriveAt: number;
  revealBound: boolean;
  blooms: boolean;
}

interface LightProbe {
  state: () => string;
  active: () => boolean;
  plan: () => { kind: string; anchorId: string; signals: LightSignal[] }[];
  record: (on: boolean, options?: { glue?: boolean }) => void;
  records: () => LightFrame[];
}

declare global {
  interface Window {
    __atlasMapLight?: LightProbe;
  }
}

const FOCUS = "domain:order";
const PATH_TARGET = "domain:fulfillment";
const BLOOM_PEAK_MS = 80;
const PATH_BUDGET_MS = 1200;

async function openMap(page: Page, query = "") {
  await page.setViewportSize({ width: 1400, height: 860 });
  await seedFirstRunSeen(page);
  await page.goto(`/ko/topology/?e2e=1&guides=off&light=force${query}`, { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page);
}

async function waitForLight(page: Page) {
  await page.waitForFunction(() => window.__atlasMapLight?.state() === "ready", undefined, { polling: "raf" });
}

async function selectBySearch(page: Page, id: string) {
  const label = await page.evaluate((nodeId) => window.__atlasMap!.nodes().find((node) => node.id === nodeId)!.label, id);
  const palette = page.getByRole("dialog", { name: "이 지도에서 검색" });
  await page.locator('[data-testid="topology-concept-search"]').click();
  await expect(palette).toBeVisible();
  await page.keyboard.type(label);
  await expect(palette.locator('[role="option"][aria-selected="true"]')).toContainText(label);
  await page.keyboard.press("Enter");
}

async function lightEvent(page: Page, kind: string): Promise<{ plan: LightSignal[]; frames: LightFrame[] }> {
  await page.waitForFunction((k) => (window.__atlasMapLight?.plan() ?? []).some((plan) => plan.kind === k), kind, { polling: "raf" });
  const plan = await page.evaluate((k) => window.__atlasMapLight!.plan().find((p) => p.kind === k)!.signals, kind);
  await page.waitForFunction(() => window.__atlasMapLight?.active() === false, undefined, { polling: "raf" });
  const frames = await page.evaluate(() => window.__atlasMapLight!.records());
  return { plan, frames };
}

function headTrack(frames: LightFrame[], key: string) {
  return frames.flatMap((frame) => frame.heads.filter((head) => head.key === key).map((head) => ({ frame, head })));
}

test("a keyboard focus runs one light along each relation, in its direction, riding the reveal", async ({ page }) => {
  test.setTimeout(120_000);
  await openMap(page);
  await waitForLight(page);
  await page.evaluate(() => window.__atlasMapLight!.record(true, { glue: true }));
  await selectBySearch(page, FOCUS);
  const { plan, frames } = await lightEvent(page, "focus");

  expect(plan.length, "the focus lit its relations").toBeGreaterThanOrEqual(3);
  const focusIndex = frames.findIndex((frame) => frame.focus === FOCUS);
  expect(focusIndex, "the recorder saw the focus frame").toBeGreaterThanOrEqual(0);
  const interval = Math.max(...frames.slice(focusIndex, focusIndex + 30).map((frame, i, all) => (i === 0 ? 0 : frame.now - all[i - 1]!.now)));

  for (const signal of plan) {
    const track = headTrack(frames, signal.key);
    const firstIndex = frames.indexOf(track[0]!.frame);
    expect(firstIndex - focusIndex, `${signal.key} starts within a frame of the focus`).toBeLessThanOrEqual(1);
    for (let i = 1; i < track.length; i += 1) {
      expect(track[i]!.head.t, `${signal.key} never runs backwards`).toBeGreaterThanOrEqual(track[i - 1]!.head.t - 1e-9);
    }
    if (signal.revealBound) {
      const departure = track[0]!.head.t;
      for (const { frame, head } of track) {
        expect(head.t, `${signal.key} stays inside the drawn span`).toBeLessThanOrEqual(Math.max(frame.reveal, departure) + 1e-6);
      }
    }
    const arrivedIndex = frames.findIndex((frame) => frame.heads.some((head) => head.key === signal.key && head.arrived));
    const allowedIndex = frames.findIndex(
      (frame, i) => i >= focusIndex && frame.now >= signal.startMs + signal.durationMs - 1e-6 && (!signal.revealBound || frame.reveal >= signal.arriveAt - 1e-9),
    );
    expect(arrivedIndex, `${signal.key} arrives`).toBeGreaterThan(focusIndex);
    expect(arrivedIndex - allowedIndex, `${signal.key} arrives on the frame its clock and the reveal allow`).toBeLessThanOrEqual(1);
    test.info().annotations.push({
      type: "arrival",
      description: JSON.stringify({ key: signal.key, clampMs: Math.round(signal.durationMs), arrivedMs: Math.round(frames[arrivedIndex]!.now - frames[focusIndex]!.now) }),
    });
    if (signal.blooms) {
      const bloom = frames.filter((frame) => frame.blooms.some((b) => b.id === `node:${signal.toId}`));
      expect(bloom.length, `${signal.toId} blooms`).toBeGreaterThan(0);
      const strength = (frame: LightFrame) => frame.blooms.find((b) => b.id === `node:${signal.toId}`)!.strength;
      const peak = bloom.reduce((best, frame) => (strength(frame) > strength(best) ? frame : best));
      expect(peak.now - bloom[0]!.now, `${signal.toId} peaks soon after the light reaches it`).toBeLessThanOrEqual(BLOOM_PEAK_MS + interval);
    }
  }

  const glue = frames.flatMap((frame) => frame.glue).filter((sample) => !sample.ambiguous && sample.lineContrast >= 8);
  expect(glue.length, "the glue was measured mid-flight").toBeGreaterThan(5);
  test.info().annotations.push({ type: "glue", description: JSON.stringify({ samples: glue.length, maxOffsetPx: Math.max(...glue.map((g) => g.offsetPx)) }) });
  for (const sample of glue) {
    expect(sample.offsetPx, `the light sits on its line (${sample.key})`).toBeLessThanOrEqual(1.5);
    expect(sample.aheadInk, `no light runs ahead of ${sample.key}`).toBeLessThanOrEqual(sample.headInk * 0.05);
  }

  const running = frames.filter((frame) => frame.heads.some((head) => !head.arrived));
  expect(running.some((frame) => frame.standDowns > 0), "a comet stood down on a lit line").toBe(true);
  const spent = await page.evaluate(() => window.__atlasMapLight!.records().at(-1)!);
  expect(spent.standDowns).toBe(0);
});

test("a path lights hop by hop, in order, inside its budget", async ({ page }) => {
  test.setTimeout(120_000);
  await openMap(page, `&mode=path&pathFrom=${FOCUS}`);
  await waitForLight(page);
  await page.evaluate(() => window.__atlasMapLight!.record(true));
  await selectBySearch(page, PATH_TARGET);
  await expect(page.getByTestId("ontology-map")).toHaveAttribute("data-map-lens", "path");
  const { plan, frames } = await lightEvent(page, "path");

  expect(plan.length, "the path has hops").toBeGreaterThanOrEqual(1);
  expect(plan[0]!.fromId).toBe(FOCUS);
  expect(plan.at(-1)!.toId).toBe(PATH_TARGET);
  const starts = plan.map((signal) => frames.findIndex((frame) => frame.heads.some((head) => head.key === signal.key)));
  for (let i = 1; i < starts.length; i += 1) expect(starts[i], "hops light in order").toBeGreaterThanOrEqual(starts[i - 1]!);
  const first = frames[starts[0]!]!;
  const lastArrival = frames.findIndex((frame) => frame.heads.some((head) => head.key === plan.at(-1)!.key && head.arrived));
  const interval = frames[starts[0]! + 1]!.now - first.now;
  expect(frames[lastArrival]!.now - first.now, "the path finishes inside its budget").toBeLessThanOrEqual(PATH_BUDGET_MS + 2 * interval);
  for (const signal of plan) {
    expect(frames.some((frame) => frame.blooms.some((b) => b.id === `node:${signal.toId}`)), `${signal.toId} blooms`).toBe(true);
  }
});

test("a spent light lets the map sleep and draws nothing more", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const w = window as unknown as { __rafTimes: number[]; __lightDraws: number };
    w.__rafTimes = [];
    w.__lightDraws = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback: FrameRequestCallback) =>
      raf((time) => {
        w.__rafTimes.push(performance.now());
        callback(time);
      });
    const draw = WebGL2RenderingContext.prototype.drawArraysInstanced;
    WebGL2RenderingContext.prototype.drawArraysInstanced = function drawArraysInstanced(...args) {
      w.__lightDraws += 1;
      return draw.apply(this, args);
    };
  });
  await openMap(page, "&synth=300");
  await waitForLight(page);
  const hub = await page.evaluate(() => {
    const degree = new Map<string, number>();
    for (const edge of window.__atlasMap!.edges()) {
      degree.set(edge.sourceId, (degree.get(edge.sourceId) ?? 0) + 1);
      degree.set(edge.targetId, (degree.get(edge.targetId) ?? 0) + 1);
    }
    return [...degree.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  });
  const select = (id: string | null) =>
    page.evaluate((nodeId) => (window.__atlasMap as unknown as { select: (value: string | null) => void }).select(nodeId), id);
  await select(hub);
  await page.waitForFunction(() => window.__atlasMapLight?.active() === true, undefined, { polling: "raf" });
  await page.waitForFunction(() => window.__atlasMapLight?.active() === false, undefined, { polling: "raf" });
  const drawsWhenSpent = await page.evaluate(() => (window as unknown as { __lightDraws: number }).__lightDraws);
  expect(drawsWhenSpent, "the light drew while it lived").toBeGreaterThan(0);
  await select(null);
  await waitForMapStill(page);
  await page.waitForFunction(
    () => {
      const times = (window as unknown as { __rafTimes: number[] }).__rafTimes;
      return performance.now() - (times.at(-1) ?? 0) > 1_000;
    },
    undefined,
    { polling: 250, timeout: 60_000 },
  );
  const after = await page.evaluate(() => ({
    draws: (window as unknown as { __lightDraws: number }).__lightDraws,
    causes: window.__atlasMap && "idleDebug" in window.__atlasMap ? (window.__atlasMap as unknown as { idleDebug: () => { lastActive: { causes: string[] } | null } }).idleDebug().lastActive?.causes ?? [] : [],
  }));
  expect(after.draws, "no light was drawn after it was spent").toBe(drawsWhenSpent);
  expect(after.causes).not.toContain("lightActive");
});

test("under reduced motion there is no light layer and no WebGL context", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const w = window as unknown as { __webglContexts: number };
    w.__webglContexts = 0;
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patched(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/.test(type)) w.__webglContexts += 1;
      return (getContext as (this: HTMLCanvasElement, ...args: unknown[]) => RenderingContext | null).call(this, type, ...rest);
    } as typeof getContext;
  });
  await openMap(page);
  await selectBySearch(page, FOCUS);
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBe(FOCUS);
  await waitForMapStill(page);
  expect(await page.locator('[data-testid="map-light"]').count()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { __webglContexts: number }).__webglContexts)).toBe(0);
  expect(await page.evaluate(() => window.__atlasMapLight?.state())).toBe("idle");
});
