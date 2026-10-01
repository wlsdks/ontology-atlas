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
  pathOpen: boolean;
  heads: LightHead[];
  blooms: { id: string; strength: number }[];
  glue: {
    key: string;
    ambiguous: boolean;
    cameraShiftPx: number;
    offsetPx: number;
    lineContrast: number;
    lightPeak: number;
    headInk: number;
    aheadInk: number;
  }[];
}

interface LightSignal {
  key: string;
  directional: boolean;
  from: "a" | "b";
  fromId: string;
  toId: string;
  bloomId: string | null;
  startMs: number;
  durationMs: number;
  arriveAt: number;
  revealBound: boolean;
}

interface LightProbe {
  state: () => string;
  active: () => boolean;
  plan: () => { kind: string; anchorId: string; createdMs: number; signals: LightSignal[] }[];
  record: (on: boolean, options?: { glue?: boolean }) => void;
  records: () => LightFrame[];
}

declare global {
  interface Window {
    __atlasMapLight?: LightProbe;
  }
}

const FOCUS = "domain:order";
const PATH_FROM = "element:address-record";
const PATH_TARGET = "capability:refund-review";
const CLICK_FROM = "domain:customer";
const CLICK_TARGET = "domain:support";
const BLOOM_RISE_MS = 60;
const PATH_BUDGET_MS = 1200;
const GLUE_PX = 1.5;
const MOVED_PX = 2;

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

async function lightEvent(page: Page, kind: string): Promise<{ plan: LightSignal[]; createdMs: number; frames: LightFrame[] }> {
  await page.waitForFunction((k) => (window.__atlasMapLight?.plan() ?? []).some((plan) => plan.kind === k), kind, { polling: "raf" });
  const { plan, createdMs } = await page.evaluate((k) => {
    const found = window.__atlasMapLight!.plan().find((p) => p.kind === k)!;
    return { plan: found.signals, createdMs: found.createdMs };
  }, kind);
  await page.waitForFunction(() => window.__atlasMapLight?.active() === false, undefined, { polling: "raf" });
  const frames = await page.evaluate(() => window.__atlasMapLight!.records());
  return { plan, createdMs, frames };
}

function headTrack(frames: LightFrame[], key: string, source: string) {
  return frames.flatMap((frame) => frame.heads.filter((head) => head.key === key && head.source === source).map((head) => ({ frame, head })));
}

function startIndex(frames: LightFrame[], key: string, source: string) {
  return frames.findIndex((frame) => frame.heads.some((head) => head.key === key && head.source === source));
}

function arrivalIndex(frames: LightFrame[], key: string, source: string) {
  return frames.findIndex((frame) => frame.heads.some((head) => head.key === key && head.source === source && head.arrived));
}

function allowedArrivalIndex(frames: LightFrame[], from: number, signal: LightSignal) {
  return frames.findIndex(
    (frame, i) => i >= from && frame.now >= signal.startMs + signal.durationMs - 1e-6 && (!signal.revealBound || frame.reveal >= signal.arriveAt - 1e-9),
  );
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
  const reached = new Map<string, number>();
  for (const signal of plan) {
    const index = arrivalIndex(frames, signal.key, "focus");
    if (signal.bloomId !== null && index >= 0) reached.set(signal.bloomId, Math.min(reached.get(signal.bloomId) ?? Infinity, frames[index]!.now));
  }

  for (const signal of plan) {
    const track = headTrack(frames, signal.key, "focus");
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
    const arrivedIndex = arrivalIndex(frames, signal.key, "focus");
    const allowedIndex = allowedArrivalIndex(frames, focusIndex, signal);
    expect(arrivedIndex, `${signal.key} arrives`).toBeGreaterThan(focusIndex);
    expect(arrivedIndex - allowedIndex, `${signal.key} arrives on the frame its clock and the reveal allow`).toBeLessThanOrEqual(1);
    test.info().annotations.push({
      type: "arrival",
      description: JSON.stringify({ key: signal.key, clampMs: Math.round(signal.durationMs), arrivedMs: Math.round(frames[arrivedIndex]!.now - frames[focusIndex]!.now) }),
    });
    if (signal.bloomId !== null) {
      const bloomId = signal.bloomId;
      const id = `node:${bloomId}`;
      const strength = (frame: LightFrame) => frame.blooms.find((b) => b.id === id)?.strength ?? 0;
      const peakIndex = frames.reduce((best, frame, i) => (strength(frame) > strength(frames[best]!) ? i : best), 0);
      expect(strength(frames[peakIndex]!), `${bloomId} blooms`).toBeGreaterThan(0);
      const riseEnd = frames.findIndex((frame) => frame.now >= reached.get(bloomId)! + BLOOM_RISE_MS - 1e-6);
      expect([riseEnd - 1, riseEnd], `${bloomId} peaks on the frame ${BLOOM_RISE_MS} ms after the light reaches it`).toContain(peakIndex);
    }
  }

  const glue = frames.flatMap((frame) => frame.glue).filter((sample) => !sample.ambiguous && sample.lineContrast >= 8);
  const moved = glue.filter((sample) => sample.cameraShiftPx >= MOVED_PX);
  test.info().annotations.push({
    type: "glue",
    description: JSON.stringify({
      samples: glue.length,
      moved: moved.length,
      maxShiftPx: Math.max(0, ...moved.map((g) => g.cameraShiftPx)),
      maxOffsetPx: Math.max(...glue.map((g) => g.offsetPx)),
    }),
  });
  expect(moved.length, "the glue was measured on frames where the camera moved the line").toBeGreaterThanOrEqual(5);
  for (const sample of glue) {
    expect(sample.offsetPx, `the light sits on its line (${sample.key}, camera moved ${sample.cameraShiftPx.toFixed(1)} px)`).toBeLessThanOrEqual(GLUE_PX);
    expect(sample.aheadInk, `no light runs ahead of ${sample.key}`).toBeLessThanOrEqual(sample.headInk * 0.05);
  }

  const running = frames.filter((frame) => frame.heads.some((head) => !head.arrived));
  expect(running.some((frame) => frame.standDowns > 0), "a comet stood down on a lit line").toBe(true);
  const spent = await page.evaluate(() => window.__atlasMapLight!.records().at(-1)!);
  expect(spent.standDowns).toBe(0);
});

function expectWalk(plan: LightSignal[], createdMs: number, frames: LightFrame[], from: string, target: string) {
  const last = plan.at(-1)!;
  expect(last.bloomId, "the walk ends at its target").toBe(target);
  const scheduledMs = last.startMs + last.durationMs - createdMs;
  expect(scheduledMs, "the path is scheduled inside its budget").toBeLessThanOrEqual(PATH_BUDGET_MS + 1e-6);
  const planIndex = frames.findIndex((frame) => frame.now >= createdMs - 1e-6);
  let stop = from;
  let previous = -1;
  for (const [i, signal] of plan.entries()) {
    expect([signal.fromId, signal.toId].sort(), `${signal.key} joins ${stop} to the next stop`).toEqual([stop, signal.bloomId].sort());
    if (signal.directional) expect(signal.from, `${signal.key} lights its relation source to target`).toBe("a");
    else expect(signal.fromId, `${signal.key} lights from the stop the walk is at`).toBe(stop);
    if (i > 0) {
      expect(signal.startMs, `${signal.key} starts when the last hop is due`).toBeGreaterThanOrEqual(plan[i - 1]!.startMs + plan[i - 1]!.durationMs - 1e-6);
    }
    const startedIndex = startIndex(frames, signal.key, "path");
    const dueIndex = frames.findIndex((frame, index) => index >= planIndex && frame.now >= signal.startMs - 1e-6);
    expect([dueIndex, dueIndex + 1], `${signal.key} lights on the frame it is due`).toContain(startedIndex);
    expect(startedIndex, "hops light in order").toBeGreaterThan(previous);
    previous = startedIndex;
    const arrivedIndex = arrivalIndex(frames, signal.key, "path");
    expect(arrivedIndex, `${signal.key} arrives`).toBeGreaterThan(planIndex);
    expect(arrivedIndex - allowedArrivalIndex(frames, planIndex, signal), `${signal.key} arrives on the frame its clock allows`).toBeLessThanOrEqual(1);
    expect(frames.some((frame) => frame.blooms.some((b) => b.id === `node:${signal.bloomId}`)), `${signal.bloomId} blooms`).toBe(true);
    stop = signal.bloomId!;
  }
  test.info().annotations.push({
    type: "path",
    description: JSON.stringify({
      hops: plan.length,
      reversed: plan.filter((signal) => signal.directional && signal.toId !== signal.bloomId).map((signal) => signal.key),
      scheduledMs: Math.round(scheduledMs),
      arrivedMs: Math.round(frames[arrivalIndex(frames, last.key, "path")]!.now - createdMs),
    }),
  });
  return { planIndex };
}

async function clickConcept(page: Page, id: string) {
  const point = await page.evaluate((nodeId) => {
    const probe = window.__atlasMap!;
    const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    const stretch = canvas.width / probe.camera()!.width;
    const node = probe.nodes().find((candidate) => candidate.id === nodeId && !candidate.hidden);
    return node ? { x: canvas.left + node.x * stretch, y: canvas.top + node.y * stretch } : null;
  }, id);
  expect(point, `${id} is drawn where it can be clicked`).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
}

test("a path lights hop by hop, in order, inside its budget", async ({ page }) => {
  test.setTimeout(120_000);
  await openMap(page, `&mode=path&pathFrom=${PATH_FROM}`);
  await waitForLight(page);
  await page.evaluate(() => window.__atlasMapLight!.record(true));
  await selectBySearch(page, PATH_TARGET);
  await expect(page.getByTestId("ontology-map")).toHaveAttribute("data-map-lens", "path");
  const { plan, createdMs, frames } = await lightEvent(page, "path");

  expect(plan.length, "the path walks several hops").toBeGreaterThanOrEqual(3);
  expect(
    plan.some((signal) => signal.directional && signal.toId !== signal.bloomId),
    "the walk crosses a relation against its direction",
  ).toBe(true);
  expectWalk(plan, createdMs, frames, PATH_FROM, PATH_TARGET);
});

test("clicking a source, then a target, lights the path on the frame it appears", async ({ page }) => {
  test.setTimeout(120_000);
  await openMap(page, "&mode=path");
  await waitForLight(page);
  await page.evaluate(() => window.__atlasMapLight!.record(true));
  await clickConcept(page, CLICK_FROM);
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBe(CLICK_FROM);
  await waitForMapStill(page, { what: "camera" });
  await clickConcept(page, CLICK_TARGET);
  const { plan, createdMs, frames } = await lightEvent(page, "path");

  const openIndex = frames.findIndex((frame) => frame.pathOpen);
  expect(openIndex, "the recorder saw the path appear").toBeGreaterThan(0);
  expect(frames[openIndex - 1]!.focus, "the source was focused until the target was picked").toBe(CLICK_FROM);
  const { planIndex } = expectWalk(plan, createdMs, frames, CLICK_FROM, CLICK_TARGET);
  expect(planIndex, "the path lights on the frame it appears, not after the source's focus fades").toBe(openIndex);
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
