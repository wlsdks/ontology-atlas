import { expect, test, type Browser, type Page } from "@playwright/test";

import "../../atlas-map-probe";
import { seedFirstRunSeen } from "../../first-run-seed";
import { useDogfoodSample } from "../../sample-source";
import { installFrameWork, p95, startFrameWork, stopFrameWork } from "../frame-work";
import { waitForMapSettled, waitForMapStill } from "../../settle";
import type { DialProbe } from "../../../../src/widgets/ontology-map/dial/types";
import { synthesizeVaultGraph } from "../../../../src/views/home/lib/synth-vault/synth-vault";

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
const LARGE_DOMAIN_MIN_MEMBERS = 46;
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

async function memberAction(page: Page, domainId: string, direction: "more" | "less") {
  const dial = await readDial(page);
  const action = dial.texts.find(t => t.id === domainId && t.role === "more" && (direction === "more" ? /more/i : /collapse/i).test(t.text));
  expect(action, `${domainId} offers ${direction}`).toBeDefined();
  const box = action!.box;
  expect(box.minX).toBeGreaterThanOrEqual(dial.freeRect.minX);
  expect(box.maxX).toBeLessThanOrEqual(dial.freeRect.maxX);
  expect(box.minY).toBeGreaterThanOrEqual(dial.freeRect.minY);
  expect(box.maxY).toBeLessThanOrEqual(dial.freeRect.maxY);
  return { box, count: Number(action!.text.match(/[\d,]+/)?.[0].replaceAll(",", "")) };
}

async function clickMemberAction(page: Page, domainId: string, direction: "more" | "less") {
  const action = await memberAction(page, domainId, direction);
  const origin = await canvasOrigin(page);
  const point = { x: origin.x + (action.box.minX + action.box.maxX) / 2, y: origin.y + (action.box.minY + action.box.maxY) / 2 };
  expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.getAttribute("data-testid"), point), "the painted member control belongs to the canvas").toBe("ontology-map-canvas");
  await page.mouse.click(point.x, point.y);
  await page.mouse.move(5, 5);
  await waitForMapStill(page);
  expect(await page.evaluate(() => window.__atlasMap!.selection().nodeId), "disclosure keeps the domain selected").toBe(domainId);
  return action.count;
}

function readMembers(dial: DialProbe, domainId: string, labels: Record<string, string>, memberIds: readonly string[]) {
  const names = dial.texts.filter(t => t.id !== null && memberIds.includes(t.id) && t.role === "capability");
  expect(names.length, `${domainId} has readable member names`).toBeGreaterThan(0);
  expect(new Set(names.map(t => t.id)).size, "each named member occurs once").toBe(names.length);
  for (const name of names) {
    expect(name.text.replace(/\s+/g, " "), `${name.id} keeps its whole title`).toBe(labels[name.id!].replace(/\s+/g, " "));
    expect(name.box.minX).toBeGreaterThanOrEqual(dial.freeRect.minX);
    expect(name.box.maxX).toBeLessThanOrEqual(dial.freeRect.maxX);
    expect(name.box.minY).toBeGreaterThanOrEqual(dial.freeRect.minY);
    expect(name.box.maxY).toBeLessThanOrEqual(dial.freeRect.maxY);
  }
  const units = dial.texts.find(t => t.id === domainId && t.role === "units");
  expect(units, "the domain exposes its complete capability total").toBeDefined();
  expect(Number(units!.text.match(/[\d,]+/)?.[0].replaceAll(",", "")), "the displayed total counts every capability").toBe(memberIds.length);
  const shown = names.map(t => t.id!);
  return { shown, remaining: memberIds.filter(id => !shown.includes(id)) };
}

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

  test(`${shape.name}: the largest domain keeps whole branch names and exact disclosure counts`, async ({ page }) => {
    test.setTimeout(240_000);
    const overview = await openDial(page, shape.query);
    const source = synthesizeVaultGraph(10_000, { dependencies: true, shape: shape.query.includes("synthShape=layered") ? "layered" : "uniform" });
    const sourceCapabilities = source.nodes.filter(n => n.kind === "capability");
    const capabilityIds = new Set(sourceCapabilities.map(n => n.id));
    const expectedMembers = new Map(source.nodes.filter(n => n.kind === "domain").map(n => [n.id, [] as string[]]));
    for (const edge of source.edges) if (edge.type === "contains" && capabilityIds.has(edge.to)) expectedMembers.get(edge.from)!.push(edge.to);
    expect(overview.clusters.map(c => c.domainId).sort(), "every source domain survives projection").toEqual([...expectedMembers.keys()].sort());
    for (const cluster of overview.clusters) expect([...cluster.capabilityIds].sort(), `${cluster.domainId} keeps its complete source membership`).toEqual(expectedMembers.get(cluster.domainId)!.sort());
    expect(await page.evaluate(() => window.__atlasMap!.nodes().filter(n => n.kind === "capability").map(n => n.id).sort()), "every source capability remains in the graph").toEqual([...capabilityIds].sort());
    expect(overview.clusters.length, "the inventory contains real domains").toBeGreaterThan(0);
    const target = [...overview.clusters].sort((a, b) => b.capabilityIds.length - a.capabilityIds.length)[0]!;
    const members = target.capabilityIds;
    expect(members.length, "the largest domain exercises at least the former reading capacity").toBeGreaterThanOrEqual(LARGE_DOMAIN_MIN_MEMBERS);
    expect(new Set(members).size).toBe(members.length);
    expect(members.length, "the reading target is a largest source domain").toBe(Math.max(...[...expectedMembers.values()].map(ids => ids.length)));
    const labels = Object.fromEntries(sourceCapabilities.map(n => [n.id, n.title]));
    expect(members.filter(id => !labels[id]?.trim()), "every member has a source name").toEqual([]);
    await openDial(page, `${shape.query}p=${encodeURIComponent(target.domainId)}&`);
    const before = readMembers(await readDial(page), target.domainId, labels, members);
    expect(before.remaining.length, "the fixture exercises genuinely hidden members").toBeGreaterThan(0);
    const batch = (await memberAction(page, target.domainId, "more")).count;
    expect(batch, "More advertises a nonempty bounded batch").toBeGreaterThan(0);
    expect(batch).toBeLessThanOrEqual(before.shown.length);
    expect(batch).toBeLessThanOrEqual(before.remaining.length);
    await clickMemberAction(page, target.domainId, "more");
    await expect.poll(async () => readMembers(await readDial(page), target.domainId, labels, members).shown.length).toBe(before.shown.length + batch);
    const expanded = readMembers(await readDial(page), target.domainId, labels, members);
    expect(before.shown.filter(id => !expanded.shown.includes(id)), "More keeps the existing names").toEqual([]);
    expect(expanded.remaining.length, "remaining = total minus every named member").toBe(members.length - expanded.shown.length);
    expect(expanded.remaining.length).toBe(before.remaining.length - batch);
    expect((await memberAction(page, target.domainId, "less")).count, "Collapse counts the revealed members").toBe(batch);
    await clickMemberAction(page, target.domainId, "less");
    await expect.poll(async () => readMembers(await readDial(page), target.domainId, labels, members).shown).toEqual(before.shown);
    expect((await memberAction(page, target.domainId, "more")).count).toBe(batch);

    console.log(`[flat-dial-frame-work] ${shape.name} branch reading ${JSON.stringify({ domain: target.domainId, total: members.length, before, batch, expanded })}`);
  });

}

test("an authored hidden capability remains readable through a public deep link and Back", async ({ page }) => {
  await useDogfoodSample(page);
  const overview = await openDial(page, "");
  const target = [...overview.clusters].sort((a, b) => b.capabilityIds.length - a.capabilityIds.length)[0]!;
  expect(target.capabilityIds.length, "the authored domain contains real capabilities").toBeGreaterThan(0);
  const labels = await page.evaluate(() => Object.fromEntries(window.__atlasMap!.nodes().map(n => [n.id, n.label])));
  await openDial(page, `p=${encodeURIComponent(target.domainId)}&`);
  await expect(page.getByTestId("map-detail-panel")).toBeVisible();
  const before = readMembers(await readDial(page), target.domainId, labels, target.capabilityIds);
  expect(before.remaining.length, "the authored fixture contains a genuinely hidden capability").toBeGreaterThan(0);
  const hidden = before.remaining.at(-1)!;
  await openDial(page, `p=${encodeURIComponent(hidden)}&`);
  await expect(page.getByTestId("map-detail-panel")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBe(hidden);
  await expect.poll(async () => (await readDial(page)).texts.some(t => t.id === hidden && t.role === "capability")).toBe(true);
  const selected = await readDial(page);
  const name = selected.texts.find(t => t.id === hidden && t.role === "capability")!;
  expect(name.text.replace(/\s+/g, " ")).toBe(labels[hidden].replace(/\s+/g, " "));
  expect(name.box.minX).toBeGreaterThanOrEqual(selected.freeRect.minX);
  expect(name.box.maxX).toBeLessThanOrEqual(selected.freeRect.maxX);
  expect(name.box.minY).toBeGreaterThanOrEqual(selected.freeRect.minY);
  expect(name.box.maxY).toBeLessThanOrEqual(selected.freeRect.maxY);
  await page.goBack();
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBe(target.domainId);
  await waitForMapStill(page);
  expect(readMembers(await readDial(page), target.domainId, labels, target.capabilityIds)).toEqual(before);
  await page.getByTestId("ontology-map-canvas").focus();
  await expect(page.getByTestId("ontology-map-canvas")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect.poll(() => new URL(page.url()).searchParams.get("p")).toBeNull();
  console.log(`[flat-dial-frame-work] authored recovery ${JSON.stringify({ domain: target.domainId, total: target.capabilityIds.length, before, hidden, label: name.text })}`);
});

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
