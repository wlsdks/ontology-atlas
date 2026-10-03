import { expect, test, type Page } from "@playwright/test";

import "./atlas-map-probe";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapSettled, waitForMapStill } from "./settle";
import type { DialProbe } from "../../src/widgets/ontology-map/dial/types";

const VIEWPORT = { width: 1512, height: 982 };
const TOLERANCE_PX = 0.5;
const ASSEMBLY_MS = 1_120;
const FRAME_MS = 17;
const FOCUS_MS = 120;
const QUIET_MS = 1_500;
const MAX_INTERVAL_MS = 50;
const CHORD_APPEAR = 0.7;
const ORDERS = "domain:order";

test.use({ viewport: VIEWPORT });

interface Sample {
  t: number;
  state: string;
  held: number;
  appear: number;
  inkMix: number;
  zoom: number;
  scale: number;
  hub: [number, number] | null;
  chips: Record<string, [number, number]>;
  discs: Record<string, [number, number]>;
  capOf: Record<string, string>;
  strips: number;
  inks: string[];
  numerals: string[];
}

interface SamplerWindow {
  __dialSampler: { on: boolean; probe: boolean; frames: Sample[]; raf: number[] };
}

async function installSampler(page: Page, options: { probe: boolean }): Promise<void> {
  await page.addInitScript((probeEveryFrame: boolean) => {
    const w = window as unknown as SamplerWindow;
    w.__dialSampler = { on: true, probe: probeEveryFrame, frames: [], raf: [] };
    let queued = false;
    let lastT = -1;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback: FrameRequestCallback) =>
      raf((time) => {
        if (time !== lastT && w.__dialSampler.on) w.__dialSampler.raf.push(performance.now());
        lastT = time;
        callback(time);
        if (queued || !w.__dialSampler.on || !w.__dialSampler.probe) return;
        queued = true;
        queueMicrotask(() => {
          queued = false;
          const probe = window.__atlasMap;
          const dial = probe?.dial?.() as DialProbe | { owns: false } | undefined;
          const camera = probe?.camera();
          if (!camera) return;
          const d = dial && dial.owns ? (dial as DialProbe) : null;
          const nodes = probe!.nodes();
          const project = nodes.find((n) => n.kind === "project");
          const chips: Record<string, [number, number]> = {};
          const capOf: Record<string, string> = {};
          for (const n of nodes) if (n.kind === "domain" && !n.hidden && (n.alpha ?? 1) > 0) chips[n.id] = [n.x, n.y];
          if (d === null) {
            w.__dialSampler.frames.push({ t: performance.now(), state: "unowned", held: 0, appear: 0, inkMix: 0, zoom: 0, scale: camera.scale, hub: project ? [project.x, project.y] : null, chips, discs: {}, capOf, strips: 0, inks: [], numerals: [] });
            return;
          }
          for (const c of d.clusters) for (const id of c.capabilityIds) capOf[id] = c.domainId;
          const discs: Record<string, [number, number]> = {};
          for (const disc of d.discs) discs[disc.id] = [disc.x, disc.y];
          w.__dialSampler.frames.push({
            t: performance.now(),
            state: d.placement.state,
            held: d.placement.held,
            appear: d.domainAppear,
            inkMix: d.inkMix,
            zoom: d.zoomRatio,
            scale: camera.scale,
            hub: project ? [project.x, project.y] : null,
            chips,
            discs,
            capOf,
            strips: d.strips.length,
            inks: d.strips.map((s) => `${s.flowKey}|${s.ink}|${s.role}`),
            numerals: d.numerals.map((n) => `${n.flowKey}|${n.text}`),
          });
        });
      });
  }, options.probe);
}

const frames = (page: Page) => page.evaluate(() => (window as unknown as SamplerWindow).__dialSampler.frames);
const rafTimes = (page: Page) => page.evaluate(() => (window as unknown as SamplerWindow).__dialSampler.raf);
const resetSampler = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as SamplerWindow).__dialSampler;
    s.frames = [];
    s.raf = [];
  });

async function waitForDial(page: Page) {
  await page.waitForFunction(
    () => {
      const dial = window.__atlasMap?.dial?.() as DialProbe | undefined;
      return !!dial && dial.owns && dial.placement.state === "settled";
    },
    undefined,
    { polling: "raf", timeout: 90_000 },
  );
  await waitForMapStill(page);
}

async function openSample(page: Page, query = "") {
  await seedFirstRunSeen(page);
  await page.goto(`/en/topology/?${query}guides=off&e2e=1`, { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page, { timeout: 90_000 });
  await waitForDial(page);
}

function hubDistance(f: Sample, id: string): number | null {
  const at = f.chips[id];
  if (!at || !f.hub) return null;
  return Math.hypot(at[0] - f.hub[0], at[1] - f.hub[1]) / f.scale;
}

function discDistance(f: Sample, id: string): number | null {
  const at = f.discs[id];
  const chip = f.chips[f.capOf[id] ?? ""];
  if (!at || !chip) return null;
  return Math.hypot(at[0] - chip[0], at[1] - chip[1]) / f.scale;
}

function decreases(series: (number | null)[], tolerance: number): number {
  let worst = 0;
  let peak = -Infinity;
  for (const v of series) {
    if (v === null) continue;
    worst = Math.max(worst, peak - v);
    peak = Math.max(peak, v);
  }
  return worst > tolerance ? worst : 0;
}

async function quietAfter(page: Page, ms = QUIET_MS): Promise<number> {
  const from = await page.evaluate(() => performance.now());
  await page.evaluate((wait) => new Promise<void>((resolve) => setTimeout(resolve, wait)), ms);
  return (await rafTimes(page)).filter((t) => t > from).length;
}

async function waitQuiet(page: Page) {
  await page.waitForFunction(
    (ms) => {
      const raf = (window as unknown as SamplerWindow).__dialSampler.raf;
      return raf.length > 0 && performance.now() - raf[raf.length - 1]! > ms;
    },
    400,
    { polling: 100, timeout: 30_000 },
  );
}

function assemblyVerdict(all: Sample[]) {
  const live = all.filter((f) => f.state !== "unowned" && Object.keys(f.chips).length > 0 && f.hub);
  const first = live[0]!;
  const last = live[live.length - 1]!;
  const ids = Object.keys(last.chips);
  const chipDrop = Math.max(0, ...ids.map((id) => decreases(live.map((f) => hubDistance(f, id)), TOLERANCE_PX / last.scale)));
  const discIds = Object.keys(last.discs);
  const discDrop = Math.max(0, ...discIds.map((id) => decreases(live.map((f) => discDistance(f, id)), TOLERANCE_PX / last.scale)));
  const after = live.find((f) => f.t >= first.t + ASSEMBLY_MS) ?? last;
  const offSlot = ids.filter((id) => {
    const a = after.chips[id];
    const b = last.chips[id];
    return !a || !b || Math.hypot(a[0] - b[0], a[1] - b[1]) > TOLERANCE_PX;
  });
  const chordsEarly = live.filter((f) => f.appear < CHORD_APPEAR && f.strips > 0).length;
  return { frames: live.length, spanMs: Math.round(last.t - first.t), chipDrop, discDrop, offSlot, chordsEarly };
}

test("the sample's first open assembles outward, chords wait for their domains, then the map sleeps", async ({ page }) => {
  test.setTimeout(120_000);
  await installSampler(page, { probe: true });
  await openSample(page);
  await waitQuiet(page);
  const verdict = assemblyVerdict(await frames(page));
  const quiet = await quietAfter(page);
  console.log(`[flat-dial-motion] assembly ${JSON.stringify({ ...verdict, quiet })}`);
  expect(verdict.frames, "assembly frames sampled").toBeGreaterThan(5);
  expect.soft(verdict.chipDrop, "a chip moved toward the hub").toBe(0);
  expect.soft(verdict.discDrop, "a disc moved toward its chip").toBe(0);
  expect.soft(verdict.offSlot, `chips off their slot ${ASSEMBLY_MS} ms after the first`).toEqual([]);
  expect.soft(verdict.chordsEarly, `frames with chords while domains appear below ${CHORD_APPEAR}`).toBe(0);
  expect.soft(quiet, "frames in 1.5 s after the assembly").toBe(0);
});

test("synth 2,000's first open keeps every frame interval under 50 ms", async ({ page }) => {
  test.setTimeout(180_000);
  await installSampler(page, { probe: false });
  await openSample(page, "synth=2000&synthDeps=1&");
  await waitQuiet(page);
  const raf = await rafTimes(page);
  const gaps = raf.slice(1).map((t, i) => t - raf[i]!);
  const tail = gaps.slice(Math.max(0, gaps.findIndex((g) => g < 40)));
  const max = Math.max(0, ...tail);
  const quiet = await quietAfter(page);
  console.log(`[flat-dial-motion] synth 2,000 assembly ${JSON.stringify({ frames: raf.length, maxIntervalMs: Math.round(max), quiet })}`);
  expect.soft(max, "largest frame interval in the assembly").toBeLessThanOrEqual(MAX_INTERVAL_MS);
  expect.soft(quiet, "frames in 1.5 s after the assembly").toBe(0);
});

const STREAMED_ELEMENTS = 400;

function streamedVault(withLateRingChange: boolean): Record<string, string> {
  const body = (title: string) => `\n${title} keeps one boundary of the product honest.\n\n## Includes\n- One responsibility.\n`;
  const pad = (n: number) => String(n).padStart(4, "0");
  const files: Record<string, string> = {};
  const domains = Array.from({ length: 6 }, (_, d) => `domains/d${d}`);
  files["atlas.md"] = `---\nkind: project\nslug: atlas\ntitle: Atlas\ndomains: [${domains.join(", ")}]\n---\n${body("Atlas")}`;
  for (const domain of domains) files[`${domain}.md`] = `---\nkind: domain\nslug: ${domain}\ntitle: ${domain}\n---\n${body(domain)}`;
  const listed: string[][] = Array.from({ length: 24 }, () => []);
  for (let e = 0; e < STREAMED_ELEMENTS; e += 1) {
    listed[e % 24]!.push(`elements/e-${pad(e)}`);
    files[`elements/e-${pad(e)}.md`] = `---\nkind: element\nslug: elements/e-${pad(e)}\ntitle: e-${pad(e)}\n---\n${body(`e-${pad(e)}`)}`;
  }
  for (let c = 0; c < 24; c += 1) {
    const d = c % 6;
    const slug = `capabilities/c-${pad(c)}`;
    const deps = d >= 1 && d <= 4 && c < 6 ? `dependencies: [capabilities/c-0000]\n` : "";
    files[`${slug}.md`] = `---\nkind: capability\nslug: ${slug}\ntitle: c-${pad(c)}\ndomain: domains/d${d}\nelements: [${listed[c]!.join(", ")}]\n${deps}---\n${body(slug)}`;
  }
  if (withLateRingChange) {
    files["elements/z-late-4.md"] = `---\nkind: element\nslug: elements/z-late-4\ntitle: late-4\ndomain: domains/d4\ndependencies: [capabilities/c-0001]\n---\n${body("late-4")}`;
    files["elements/z-late-5.md"] = `---\nkind: element\nslug: elements/z-late-5\ntitle: late-5\ndomain: domains/d5\ndependencies: [capabilities/c-0007]\n---\n${body("late-5")}`;
  }
  return files;
}

const lateElements = (files: Record<string, string>) => Object.keys(files).filter((p) => p.startsWith("elements/")).sort().slice(-Math.round(STREAMED_ELEMENTS * 0.4));

async function openStreamed(page: Page, files: Record<string, string>, held: string[]) {
  await installDesktopRailRuntime(page, files, undefined, { replaceFixture: true, holdReadsUntilReleased: held });
  await page.goto("/en/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
}

const release = (page: Page) => page.evaluate(() => (window as unknown as { __releaseHeldReads: () => void }).__releaseHeldReads());

test("a folder with no record places no domain before the capability tier, then assembles once", async ({ page }) => {
  test.setTimeout(120_000);
  const files = streamedVault(false);
  await installSampler(page, { probe: true });
  await openStreamed(page, files, lateElements(files));
  await expect.poll(() => page.evaluate(() => !!window.__atlasMap?.camera()), { message: "the map mounts while the late elements are unread", timeout: 20_000 }).toBe(true);
  await waitForMapStill(page, { what: "camera" });
  const reading = await frames(page);
  await release(page);
  await waitForDial(page);
  await waitQuiet(page);
  const all = await frames(page);
  const early = reading;
  const placedEarly = early.filter((f) => Object.keys(f.chips).length > 0).length;
  const verdict = assemblyVerdict(all.slice(reading.length));
  console.log(`[flat-dial-motion] streamed first open ${JSON.stringify({ readingFrames: early.length, states: [...new Set(all.map((f) => f.state))], placedEarly, ...verdict })}`);
  expect(early.length, "frames drawn while the elements are unread").toBeGreaterThan(0);
  expect.soft(placedEarly, "frames with a domain placed while the read is incomplete").toBe(0);
  expect.soft(verdict.chipDrop, "a chip moved toward the hub").toBe(0);
  expect.soft(verdict.offSlot, "chips off their slot after the assembly").toEqual([]);
});

test("a ring change found late is held until the read ends, then applies in one step", async ({ page }) => {
  test.setTimeout(120_000);
  const files = streamedVault(true);
  await installSampler(page, { probe: true });
  await openStreamed(page, files, lateElements(files));
  await expect.poll(() => page.evaluate(() => (window.__atlasMap?.dial?.() as DialProbe | undefined)?.placement?.state ?? null), { message: "the dial reaches the provisional state while the late elements are unread", timeout: 20_000 }).toBe("provisional");
  await waitForMapStill(page);
  const before = (await frames(page)).at(-1)!;
  await resetSampler(page);
  await release(page);
  await waitForDial(page);
  await waitQuiet(page);
  const after = await frames(page);
  const settled = after.filter((f) => f.state === "settled");
  const last = settled.at(-1)!;
  const firstSettled = settled[0]!;
  const moved = (from: Sample, to: Sample) =>
    Object.keys(to.chips).filter((id) => {
      const a = from.chips[id];
      const b = to.chips[id];
      return !a || !b || Math.hypot(a[0] - b[0], a[1] - b[1]) / to.scale > TOLERANCE_PX / to.scale;
    });
  const changed = moved(before, last);
  const afterApply = moved(firstSettled, last);
  console.log(`[flat-dial-motion] held ring change ${JSON.stringify({ heldBefore: before.held, applied: firstSettled.held, changed, movedAfterApply: afterApply })}`);
  expect.soft(firstSettled.held, "ring changes applied at read end").toBeGreaterThan(0);
  expect.soft(changed, "domains that moved: only the one whose ring changed").toEqual(["domain:d1"]);
  expect.soft(afterApply, "domains still moving after the frame group that applied the change").toEqual([]);
});

test("a remembered folder opens each domain at its remembered place and arrives by opacity only", async ({ page }) => {
  test.setTimeout(150_000);
  const files = streamedVault(false);
  await installSampler(page, { probe: true });
  await openStreamed(page, files, []);
  await waitForDial(page);
  await waitQuiet(page);
  const first = (await frames(page)).at(-1)!;
  await page.reload({ waitUntil: "domcontentloaded" });
  const open = page.getByTestId("first-run-open");
  if (await open.isVisible().catch(() => false)) await open.click();
  await waitForDial(page);
  await waitQuiet(page);
  const again = (await frames(page)).filter((f) => f.state !== "unowned" && f.hub && Object.keys(f.chips).length > 0);
  const world = (f: Sample, id: string) => (f.hub && f.chips[id] ? [(f.chips[id]![0] - f.hub[0]) / f.scale, (f.chips[id]![1] - f.hub[1]) / f.scale] : null);
  const ids = Object.keys(first.chips);
  const offAtFirst = ids.filter((id) => {
    const a = world(again[0]!, id);
    const b = world(first, id);
    return !a || !b || Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!) > TOLERANCE_PX / first.scale;
  });
  const travel = Math.max(0, ...ids.flatMap((id) => again.map((f) => {
    const a = world(f, id);
    const b = world(again.at(-1)!, id);
    return a && b ? Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!) * first.scale : 0;
  })));
  console.log(`[flat-dial-motion] remembered folder ${JSON.stringify({ frames: again.length, offAtFirst, travelPx: +travel.toFixed(2) })}`);
  expect(again.length, "frames after the reload").toBeGreaterThan(0);
  expect.soft(offAtFirst, "domains not at their remembered place on the first frame").toEqual([]);
  expect.soft(travel, "travel during the arrival").toBeLessThanOrEqual(TOLERANCE_PX);
});

test.describe("reduced motion", () => {
  test("no travel on open, and a focus swaps its inks on the first frame without a light", async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installSampler(page, { probe: true });
    await openSample(page);
    await waitQuiet(page);
    const all = (await frames(page)).filter((f) => f.state !== "unowned" && f.hub && Object.keys(f.chips).length > 0);
    const last = all.at(-1)!;
    const rel = (f: Sample, id: string) => (f.chips[id] ? [(f.chips[id]![0] - f.hub![0]) / f.scale, (f.chips[id]![1] - f.hub![1]) / f.scale] : null);
    const travel = Math.max(0, ...all.flatMap((f) => Object.keys(last.chips).map((id) => {
      const a = rel(f, id);
      const b = rel(last, id)!;
      return a ? Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!) * last.scale : Infinity;
    })));
    const clickedAt = await clickDomain(page, ORDERS);
    await page.waitForFunction((id) => window.__atlasMap!.selection().nodeId === id, ORDERS, { polling: "raf" });
    await waitForMapStill(page);
    const focusFrames = (await frames(page)).filter((f) => f.t >= clickedAt && f.state !== "unowned");
    const focused = { inkMix: Math.min(1, ...focusFrames.map((f) => f.inkMix)) };
    const webgl = await page.locator('[data-testid="map-light"]').count();
    const jumps = all.slice(1).filter((f, i) => Object.keys(f.chips).some((id) => {
      const a = rel(f, id);
      const b = rel(all[i]!, id);
      return !!a && !!b && Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!) * last.scale > TOLERANCE_PX;
    })).length;
    const media = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
    console.log(`[flat-dial-motion] reduced motion ${JSON.stringify({ media, framesThatMoved: jumps, travelPx: +travel.toFixed(2), focusFrames: focusFrames.length, lowestInkMix: focused.inkMix, lightCanvases: webgl })}`);
    expect.soft(travel, "travel on open").toBeLessThanOrEqual(TOLERANCE_PX);
    expect.soft(focused.inkMix, "lowest ink mix after the focus").toBe(1);
    expect.soft(webgl, "light layers").toBe(0);
  });
});

async function clickDomain(page: Page, id: string): Promise<number> {
  const box = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  const node = await page.evaluate((nodeId) => window.__atlasMap!.nodes().find((n) => n.id === nodeId)!, id);
  await page.mouse.move(box.x + node.x - 30, box.y + node.y - 30);
  await page.mouse.move(box.x + node.x, box.y + node.y, { steps: 5 });
  await page.waitForFunction((nodeId) => window.__atlasMap!.hover() === nodeId && (window.__atlasMap!.dial!() as DialProbe).inkMix >= 1, id, { polling: "raf" });
  await waitForMapStill(page);
  await resetSampler(page);
  const at = await page.evaluate(() => performance.now());
  await page.mouse.down();
  await page.mouse.up();
  return at;
}

async function opaqueInk(page: Page, name: string): Promise<string> {
  return page.evaluate((token) => {
    const style = getComputedStyle(document.documentElement);
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = style.getPropertyValue("--map-canvas-bg-near").trim();
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = style.getPropertyValue(token).trim();
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((v) => v!.toString(16).padStart(2, "0")).join("")}`;
  }, name);
}

const channelGap = (a: string, b: string) => Math.max(...[1, 3, 5].map((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16))));

interface LightProbe {
  active: () => boolean;
  plan: () => { kind: string; anchorId: string; createdMs: number; signals: { key: string; fromId: string; toId: string; startMs: number }[] }[];
}

test("a domain focus crossfades inks in 120 ms, then one light runs per attended direction, then the map sleeps", async ({ page }) => {
  test.setTimeout(120_000);
  await installSampler(page, { probe: true });
  await openSample(page, "light=force&");
  await waitQuiet(page);
  const needs = await opaqueInk(page, "--map-indigo-bright");
  const usedBy = await opaqueInk(page, "--map-edge-selected");
  const selectedAt = await clickDomain(page, ORDERS);
  await page.waitForFunction(() => ((window as unknown as { __atlasMapLight?: LightProbe }).__atlasMapLight?.plan().length ?? 0) > 0, undefined, { polling: "raf", timeout: 30_000 });
  const plan = await page.evaluate(() => (window as unknown as { __atlasMapLight: LightProbe }).__atlasMapLight.plan());
  await page.waitForFunction(() => (window as unknown as { __atlasMapLight: LightProbe }).__atlasMapLight.active() === false, undefined, { polling: "raf", timeout: 30_000 });
  const quiet = await quietAfter(page);
  const all = (await frames(page)).filter((f) => f.t >= selectedAt);
  const focused = all.find((f) => f.inkMix < 1) ?? all[0]!;
  const full = all.find((f) => f.t >= focused.t && f.inkMix >= 1);
  const attendedKeys = [...new Set(full ? full.inks.map((s) => s.split("|")[0]!).filter((k) => k.split("\u0000").includes(ORDERS)) : [])];
  const attendedInks = [...new Set(full ? full.inks.filter((s) => attendedKeys.includes(s.split("|")[0]!)).map((s) => s.split("|")[1]!) : [])];
  const numeralsAtFirst = focused.numerals.map((n) => n.split("|")[0]!);
  const signals = plan.flatMap((p) => p.signals);
  const mixAt = full?.t ?? Infinity;
  const earlyLights = signals.filter((s) => s.startMs < mixAt - FRAME_MS).length;
  const verdict = {
    mixMs: full ? Math.round(full.t - focused.t) : null,
    attendedKeys: attendedKeys.length,
    attendedInks,
    tokens: [needs, usedBy],
    numeralsAtFirst: numeralsAtFirst.length,
    lights: signals.length,
    earlyLights,
    quiet,
  };
  console.log(`[flat-dial-motion] focus ${JSON.stringify(verdict)}`);
  expect(full, "the ink mix reaches 1").toBeTruthy();
  expect.soft(verdict.mixMs!, "ink mix 1 after the first focused frame (ms)").toBeLessThanOrEqual(FOCUS_MS + FRAME_MS);
  expect.soft(attendedInks.filter((ink) => channelGap(ink, needs) > 1 && channelGap(ink, usedBy) > 1), "attended strip inks outside the needs and used-by tokens").toEqual([]);
  expect.soft(attendedKeys.filter((k) => !numeralsAtFirst.includes(k)), "attended flows without a numeral on the first focused frame").toEqual([]);
  expect.soft(signals.length, "lights launched = attended direction strokes").toBe(full ? full.inks.filter((s) => attendedKeys.includes(s.split("|")[0]!) && s.split("|")[2] !== "relates").length : -1);
  expect.soft(earlyLights, "lights departing before the ink mix reaches 1").toBe(0);
  expect.soft(quiet, "frames in 1.5 s after the last light").toBe(0);
});

test("zoom ramps are functions of camera scale, whatever the path to it", async ({ page }) => {
  test.setTimeout(120_000);
  await openSample(page);
  const box = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
  const at = { x: box.x + box.width * 0.55, y: box.y + box.height * 0.5 };
  const read = () => page.evaluate(() => {
    const d = window.__atlasMap!.dial!() as DialProbe;
    return { zoom: d.zoomRatio, cap: d.disclosure.capAlpha, elements: d.disclosure.elementsAlpha };
  });
  const wheel = async (dy: number, times: number) => {
    await page.mouse.move(at.x, at.y);
    for (let i = 0; i < times; i += 1) {
      await page.mouse.wheel(0, dy);
      await waitForMapStill(page, { what: "camera" });
    }
  };
  await wheel(-60, 8);
  const direct = await read();
  await wheel(-60, 3);
  await wheel(60, 3);
  const round = await read();
  console.log(`[flat-dial-motion] zoom ramps ${JSON.stringify({ direct, round })}`);
  expect(Math.abs(round.zoom - direct.zoom), "the two paths reach the same scale").toBeLessThan(1e-3);
  expect.soft(round.cap, "capability alpha").toBeCloseTo(direct.cap, 3);
  expect.soft(round.elements, "element alpha").toBeCloseTo(direct.elements, 3);
});
