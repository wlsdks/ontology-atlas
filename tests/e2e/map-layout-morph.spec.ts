import { expect, test, type Page } from "@playwright/test";

import { MOTION } from "../../src/shared/motion/tokens";
import { CAMERA_TWEEN_MAX_MS, CAMERA_TWEEN_MIN_MS } from "../../src/widgets/ontology-map/model/motion-physics";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForAnimationsDone, waitForDomeEntered, waitForMapSettled, waitForTerritoriesStill } from "./settle";

type View = "flat" | "territories" | "hex" | "galaxy" | "strata" | "coupling";

interface Frame {
  t: number;
  wall: number;
  at: number | null;
  phase: string | null;
  opacity: number | null;
  views: string[];
  ink: number | null;
  remaining: number | null;
  ghosts: number;
  camera: string | null;
  arrived: boolean | null;
  positions: Record<string, [number, number]> | null;
}

interface MorphRecord {
  mode: "ghost" | "fade";
  count: number;
  plannedMs: number;
  travelStartMs: number;
  travelEndMs: number | null;
  fadeStartMs: number | null;
  doneMs: number | null;
  settledBy: string | null;
}

interface MorphProbe {
  records: () => MorphRecord[];
  live: () => { mode: string; phase: string; progress: number; at: number } | null;
  marks: (progress?: number) => Array<{ id: string; x: number; y: number }>;
  publishes: () => number;
}

interface Sampler {
  frames: Frame[];
  recording: boolean;
  ink: boolean;
  finals: Map<string, [number, number]> | null;
  span: number;
}

type SamplerWindow = Window & { __morph: Sampler; __atlasMapMorph?: MorphProbe };

const SYNTH = 300;
const INK_FLOOR = 0.9;
const FIRST_SHARE_CEILING = 0.2;
const MAX_SHARE_CEILING = 0.25;
const INCOMING_STALL_MS = 150;
const FADE_STEP_CEILING = 0.5;
const PICK_STALL_MS = 150;
const ARRIVAL_DRIFT_CEILING_PX = 2;

async function installSampler(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as SamplerWindow;
    w.__morph = { frames: [], recording: false, ink: false, finals: null, span: 0 };
    const s = w.__morph;
    const scratch = document.createElement("canvas");
    const sctx = scratch.getContext("2d", { willReadFrequently: true })!;
    const ink = (): number => {
      const surface = document.querySelector<HTMLElement>('[data-testid="topology-map-surface"]');
      if (!surface) return 0;
      const host = surface.getBoundingClientRect();
      scratch.width = Math.max(1, Math.round(host.width / 8));
      scratch.height = Math.max(1, Math.round(host.height / 8));
      sctx.globalAlpha = 1;
      sctx.fillStyle = "#000";
      sctx.fillRect(0, 0, scratch.width, scratch.height);
      for (const canvas of surface.querySelectorAll("canvas")) {
        const box = canvas.getBoundingClientRect();
        if (box.width < 50 || canvas.width === 0) continue;
        let opacity = 1;
        for (let el: Element | null = canvas; el && el !== document.body; el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity || 1);
        if (opacity <= 0) continue;
        sctx.globalAlpha = opacity;
        sctx.drawImage(canvas, (box.x - host.x) / 8, (box.y - host.y) / 8, box.width / 8, box.height / 8);
      }
      const data = sctx.getImageData(0, 0, scratch.width, scratch.height).data;
      const histogram = new Uint32Array(256);
      const lum = new Uint8Array(data.length / 4);
      for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
        lum[j] = Math.round(0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!);
        histogram[lum[j]!] += 1;
      }
      let mode = 0;
      for (let v = 1; v < 256; v += 1) if (histogram[v]! > histogram[mode]!) mode = v;
      let sum = 0;
      for (const v of lum) if (v > mode) sum += v - mode;
      return sum;
    };
    const remaining = (probe: MorphProbe): number | null => {
      if (!s.finals) {
        const start = new Map(probe.marks(0).map((m) => [m.id, [m.x, m.y] as [number, number]]));
        s.finals = new Map();
        s.span = 0;
        for (const m of probe.marks(1)) {
          const from = start.get(m.id);
          if (!from) continue;
          s.finals.set(m.id, [m.x, m.y]);
          s.span += Math.hypot(m.x - from[0], m.y - from[1]);
        }
      }
      if (s.span <= 0) return null;
      let left = 0;
      for (const m of probe.marks()) {
        const end = s.finals.get(m.id);
        if (end) left += Math.hypot(m.x - end[0], m.y - end[1]);
      }
      return left / s.span;
    };
    let frameTime = 0;
    let queued = false;
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      queued = false;
      if (!s.recording) return;
      const probe = w.__atlasMapMorph;
      const live = probe?.live() ?? null;
      const overlay = document.querySelector('[data-testid="map-layout-morph"]');
      const traveling = live?.mode === "ghost" && probe;
      const map = (
        window as unknown as {
          __atlasMap?: {
            camera: () => { x: number; y: number; scale: number } | null;
            nodes: () => Array<{ id: string; x: number; y: number; hidden: boolean }>;
          };
        }
      ).__atlasMap;
      const camera = document.querySelector('[data-testid="ontology-map"]') ? (map?.camera() ?? null) : null;
      const stats = document.querySelector<HTMLCanvasElement>('[data-testid="topology-map-view"] canvas')?.dataset.frame;
      const drawn = stats ? (JSON.parse(stats) as { arrived?: boolean; arrivalT?: number }) : null;
      s.frames.push({
        t: frameTime,
        wall: performance.now(),
        at: live?.at ?? null,
        phase: live?.phase ?? null,
        opacity: overlay ? Number(getComputedStyle(overlay).opacity) : null,
        views: [...document.querySelectorAll('[data-testid="topology-map-view"]')].map((el) => el.getAttribute("data-map-view") ?? ""),
        ink: s.ink ? ink() : null,
        remaining: traveling ? remaining(probe) : null,
        ghosts: traveling ? probe.marks().length : 0,
        camera: camera
          ? `${camera.x.toFixed(2)},${camera.y.toFixed(2)},${camera.scale.toFixed(4)}`
          : stats
            ? JSON.stringify((JSON.parse(stats) as { offset?: unknown; R?: unknown }).offset ?? null)
            : null,
        arrived: drawn?.arrived ?? (drawn?.arrivalT === undefined ? null : drawn.arrivalT >= 1),
        positions: camera
          ? Object.fromEntries(
              (map?.nodes() ?? [])
                .filter((n) => !n.hidden)
                .slice(0, 60)
                .map((n) => [n.id, [n.x, n.y] as [number, number]]),
            )
          : null,
      });
    };
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback: FrameRequestCallback) =>
      raf((time) => {
        frameTime = time;
        callback(time);
        if (queued) return;
        queued = true;
        channel.port2.postMessage(0);
      });
  });
}

async function openAt(page: Page, view: View, reduced = false): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 860 });
  if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
  await seedFirstRunSeen(page);
  await page.addInitScript((initial: View) => {
    const flag = (key: string, on: boolean) => window.localStorage.setItem(`atlas.appearance.${key}`, on ? "on" : "off");
    flag("territories", initial === "territories");
    flag("hex-board", initial === "hex");
    flag("galaxy", initial === "galaxy");
    flag("view3d", initial === "strata" || initial === "coupling");
    window.localStorage.setItem("atlas.appearance.map-arrangement", initial === "coupling" ? "coupling" : "strata");
  }, view);
  await installSampler(page);
  await page.goto(`/ko/topology/?synth=${SYNTH}&guides=off&e2e=1`, { waitUntil: "domcontentloaded" });
  await settled(page, view);
}

async function settled(page: Page, view: View): Promise<void> {
  if (view === "territories") await waitForTerritoriesStill(page);
  else if (view === "hex") await expect(page.getByTestId("hex-board-map")).toHaveAttribute("data-hex-ready", "true");
  else if (view === "strata" || view === "coupling") await waitForDomeEntered(page);
  else await waitForMapSettled(page);
}

async function pick(page: Page, view: View): Promise<void> {
  await page.getByTestId("topology-view-3d").click();
  await waitForAnimationsDone(page.getByTestId("topology-view-3d-menu"));
  await page.getByTestId(`topology-view-3d-choice-${view}`).click();
}

async function startRecording(page: Page, ink: boolean): Promise<number> {
  return page.evaluate((withInk) => {
    const w = window as unknown as SamplerWindow;
    Object.assign(w.__morph, { frames: [], finals: null, span: 0, ink: withInk, recording: true });
    return w.__atlasMapMorph?.records().length ?? 0;
  }, ink);
}

async function stopRecording(page: Page): Promise<Frame[]> {
  return page.evaluate(() => {
    const s = (window as unknown as SamplerWindow).__morph;
    s.recording = false;
    return s.frames;
  });
}

async function morphDone(page: Page, before: number): Promise<MorphRecord> {
  await page.waitForFunction(
    (count) => {
      const records = (window as unknown as SamplerWindow).__atlasMapMorph?.records() ?? [];
      return records.length > count && records.at(-1)!.doneMs !== null && !document.querySelector('[data-testid="map-layout-morph"]');
    },
    before,
    { polling: "raf" },
  );
  return page.evaluate(() => (window as unknown as SamplerWindow).__atlasMapMorph!.records().at(-1)!);
}

async function inTravel(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const live = (window as unknown as SamplerWindow).__atlasMapMorph?.live();
      return live?.phase === "travel" && live.progress > 0.1;
    },
    undefined,
    { polling: "raf" },
  );
}

function medianFrameMs(frames: readonly Frame[]): number {
  const gaps = frames
    .slice(1)
    .map((f, i) => f.t - frames[i]!.t)
    .filter((gap) => gap > 0)
    .sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] ?? 16.7;
}

test.describe("map layout morph", () => {
  const DIRECTIONS: Array<[View, View]> = [
    ["flat", "hex"],
    ["hex", "territories"],
    ["territories", "galaxy"],
    ["strata", "territories"],
    ["hex", "flat"],
  ];

  for (const [from, to] of DIRECTIONS) {
    test(`${from} to ${to} carries each concept on the camera clock without a blank frame`, async ({ page }) => {
      test.setTimeout(120_000);
      await openAt(page, from);
      const before = await startRecording(page, true);
      await pick(page, to);
      const run = await morphDone(page, before);
      await settled(page, to);
      const frames = await stopRecording(page);

      expect(run.mode).toBe("ghost");
      expect(run.count).toBeGreaterThan(0);

      expect(run.plannedMs).toBeGreaterThanOrEqual(CAMERA_TWEEN_MIN_MS);
      expect(run.plannedMs).toBeLessThanOrEqual(CAMERA_TWEEN_MAX_MS);
      const travel = frames.filter((f) => f.phase === "travel" && f.remaining !== null && f.at !== null);
      const travelMs = run.travelEndMs! - run.travelStartMs;
      expect(travelMs, `travel ${travelMs} ms against a plan of ${run.plannedMs} ms`).toBeGreaterThanOrEqual(run.plannedMs);
      expect(Math.max(0, ...travel.map((f) => f.at! - run.travelStartMs)), `travel still running past its plan of ${run.plannedMs} ms`).toBeLessThan(run.plannedMs);

      const shares: number[] = [];
      let previous = { at: run.travelStartMs, remaining: 1 };
      for (const f of travel) {
        const interval = f.at! - previous.at;
        if (interval > 0) shares.push(((previous.remaining - f.remaining!) * 16.7) / interval);
        previous = { at: f.at!, remaining: f.remaining! };
      }
      expect(shares.length).toBeGreaterThan(2);
      expect(shares[0]!).toBeGreaterThan(0);
      expect(shares[0]!).toBeLessThanOrEqual(FIRST_SHARE_CEILING);
      expect(Math.max(...shares)).toBeLessThanOrEqual(MAX_SHARE_CEILING);

      const start = frames.findIndex((f) => f.phase !== null);
      const startInk = frames[Math.max(0, start - 1)]!.ink!;
      const endInk = frames.at(-1)!.ink!;
      const floor = INK_FLOOR * Math.min(startInk, endInk);
      const dips = frames.slice(start).filter((f) => f.ink! < floor).map((f) => `${Math.round(f.t - run.travelStartMs)} ms: ${f.ink} (${f.phase})`);
      expect(dips, `ink fell under ${Math.round(floor)} (start ${startInk}, end ${endInk})`).toEqual([]);

      const arrival = to === "territories" || to === "hex" ? to : "map";
      const handoff = frames.findIndex((f, i) => i > start && f.views.includes(arrival) && f.camera !== null);
      expect(handoff, "the incoming view never drew").toBeGreaterThan(start);
      expect([...new Set(frames.slice(handoff).map((f) => f.camera))], "the incoming camera moved after the handoff").toHaveLength(1);
      const landed = frames.at(-1)!.positions ?? {};
      const drift = frames
        .slice(handoff)
        .flatMap((f) => Object.entries(f.positions ?? {}).map(([id, [x, y]]) => (landed[id] ? Math.hypot(x - landed[id][0], y - landed[id][1]) : 0)));
      expect(Math.max(0, ...drift), "the incoming map moved its concepts after the handoff").toBeLessThanOrEqual(ARRIVAL_DRIFT_CEILING_PX);
      const replayed = frames.slice(handoff).filter((f) => f.arrived === false).map((f) => Math.round(f.t - run.travelStartMs));
      expect(replayed, "the incoming view replayed its own arrival after the handoff").toEqual([]);
    });
  }

  test("a pick whose commit stalls still travels the planned time once frames resume", async ({ page }) => {
    await openAt(page, "flat");
    await page.evaluate((stallMs) => {
      const observer = new MutationObserver(() => {
        if (!document.querySelector('[data-testid="map-layout-morph"]')) return;
        observer.disconnect();
        const until = performance.now() + stallMs;
        while (performance.now() < until);
        (window as unknown as { __pickStallEnd?: number }).__pickStallEnd = performance.now();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }, PICK_STALL_MS);
    const before = await startRecording(page, false);
    await pick(page, "hex");
    const run = await morphDone(page, before);
    const frames = await stopRecording(page);
    const stallEnd = await page.evaluate(() => (window as unknown as { __pickStallEnd?: number }).__pickStallEnd);
    expect(stallEnd, "the pick's commit never stalled").toBeDefined();
    expect(run.mode).toBe("ghost");
    expect(run.travelEndMs! - stallEnd!, `travel after the stall against a plan of ${run.plannedMs} ms`).toBeGreaterThanOrEqual(
      run.plannedMs - 2 * medianFrameMs(frames),
    );
  });

  test("an incoming view that stalls on mount still gets the whole fade once it has drawn", async ({ page }) => {
    await openAt(page, "flat");
    await page.evaluate((stallMs) => {
      const observer = new MutationObserver(() => {
        if (!document.querySelector('[data-testid="territories-map"]')) return;
        observer.disconnect();
        const until = performance.now() + stallMs;
        while (performance.now() < until);
        (window as unknown as { __incomingStalled?: boolean }).__incomingStalled = true;
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }, INCOMING_STALL_MS);
    const before = await startRecording(page, false);
    await pick(page, "territories");
    const run = await morphDone(page, before);
    const frames = await stopRecording(page);
    expect(await page.evaluate(() => (window as unknown as { __incomingStalled?: boolean }).__incomingStalled)).toBe(true);
    expect(run.mode).toBe("ghost");

    const steps: string[] = [];
    for (let i = 1; i < frames.length; i += 1) {
      const [a, b] = [frames[i - 1]!, frames[i]!];
      if (a.opacity === null) continue;
      const interval = a.at !== null && b.at !== null ? b.at - a.at : b.wall - a.wall;
      if (interval <= 0) continue;
      const drop = ((a.opacity - (b.opacity ?? 0)) * 16.7) / interval;
      if (drop > FADE_STEP_CEILING) steps.push(`${Math.round(interval)} ms: ${a.opacity.toFixed(2)} → ${(b.opacity ?? 0).toFixed(2)}`);
    }
    expect(steps, "the fade jumped after the stall").toEqual([]);
  });

  test("reduced motion crossfades every pick on the fast clock and moves nothing", async ({ page }) => {
    test.setTimeout(180_000);
    await openAt(page, "flat", true);
    for (const view of ["territories", "hex", "galaxy", "strata", "coupling", "flat"] as const) {
      const before = await startRecording(page, false);
      await pick(page, view);
      const run = await morphDone(page, before);
      await settled(page, view);
      const frames = await stopRecording(page);
      expect(run.mode, `the pick of ${view}`).toBe("fade");
      expect(frames.filter((f) => f.ghosts > 0), `ghosts moved on the way to ${view}`).toEqual([]);
      const fadeMs = MOTION.fast.duration * 1000;
      const fadeSteps = frames.filter((f) => f.phase === "fade" && f.at !== null).map((f) => f.at! - run.fadeStartMs!);
      expect(run.doneMs! - run.fadeStartMs!, `the fade into ${view} ended before --motion-fast`).toBeGreaterThanOrEqual(fadeMs);
      expect(Math.max(0, ...fadeSteps), `the fade into ${view} was still running after --motion-fast`).toBeLessThan(fadeMs);
    }
  });

  test("a view change no pick asked for cuts without publishing a snapshot", async ({ page }) => {
    await openAt(page, "flat");
    const counts = await page.evaluate(() => {
      const probe = (window as unknown as SamplerWindow).__atlasMapMorph!;
      return { publishes: probe.publishes(), records: probe.records().length };
    });
    await page.evaluate(() => {
      window.localStorage.setItem("atlas.appearance.territories", "on");
      window.dispatchEvent(new StorageEvent("storage", { key: "atlas.appearance.territories", newValue: "on" }));
    });
    await expect(page.getByTestId("territories-map")).toBeVisible();
    await waitForTerritoriesStill(page);
    const after = await page.evaluate(() => {
      const probe = (window as unknown as SamplerWindow).__atlasMapMorph!;
      return { publishes: probe.publishes(), records: probe.records().length };
    });
    expect(after).toEqual(counts);
    await expect(page.getByTestId("map-layout-morph")).toHaveCount(0);
  });

  for (const cause of ["pointerdown", "resize", "hidden", "dpr"] as const) {
    test(`${cause} mid-travel settles the concepts at once`, async ({ page }) => {
      await openAt(page, "flat");
      const cdp = cause === "dpr" ? await page.context().newCDPSession(page) : null;
      const before = await startRecording(page, false);
      await pick(page, "hex");
      await inTravel(page);
      if (cause === "pointerdown") {
        const box = (await page.getByTestId("topology-map-surface").boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height - 40);
        await page.mouse.down();
        await page.mouse.up();
      } else if (cause === "resize") {
        await page.setViewportSize({ width: 1320, height: 860 });
      } else if (cause === "hidden") {
        await page.evaluate(() => {
          Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
          document.dispatchEvent(new Event("visibilitychange"));
        });
      } else {
        await cdp!.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 860, deviceScaleFactor: 3, mobile: false });
      }
      const run = await morphDone(page, before);
      await stopRecording(page);
      expect(run.settledBy).toBe(cause);
      expect(run.travelEndMs! - run.travelStartMs).toBeLessThan(run.plannedMs);
    });
  }

  test("a pick in flight turns the concepts around from where they are", async ({ page }) => {
    await openAt(page, "flat");
    const before = await startRecording(page, false);
    await page.getByTestId("topology-view-3d").click();
    await waitForAnimationsDone(page.getByTestId("topology-view-3d-menu"));
    await page.keyboard.press("ArrowDown");
    await inTravel(page);
    const outbound = await page.evaluate(() => {
      const probe = (window as unknown as SamplerWindow).__atlasMapMorph!;
      const at = (p: number) => Object.fromEntries(probe.marks(p).map((m) => [m.id, [m.x, m.y] as [number, number]]));
      return { from: at(0), to: at(1) };
    });
    await page.keyboard.press("ArrowDown");
    await page.waitForFunction(
      (count) => ((window as unknown as SamplerWindow).__atlasMapMorph?.records().length ?? 0) >= count + 2,
      before,
      { polling: "raf" },
    );
    const restart = await page.evaluate(() =>
      Object.fromEntries((window as unknown as SamplerWindow).__atlasMapMorph!.marks(0).map((m) => [m.id, [m.x, m.y] as [number, number]])),
    );
    await morphDone(page, before + 1);
    await stopRecording(page);
    const far = Object.keys(restart).filter((id) => {
      const [from, to] = [outbound.from[id], outbound.to[id]];
      return from && to && Math.hypot(to[0] - from[0], to[1] - from[1]) > 50;
    });
    expect(far.length).toBeGreaterThan(0);
    const atAnEnd = far.filter((id) => {
      const gap = (point: [number, number]) => Math.hypot(restart[id]![0] - point[0], restart[id]![1] - point[1]);
      return gap(outbound.from[id]!) < 5 || gap(outbound.to[id]!) < 5;
    });
    expect(atAnEnd, "concepts restarted from an end of the first travel").toEqual([]);
  });

  test("leaving the map mid-travel frees the overlay and returns to a drawn map", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openAt(page, "flat");
    await pick(page, "hex");
    await inTravel(page);
    await page.getByTestId("app-nav-rail").getByTestId("app-nav-rail-item-library").click();
    await expect(page).toHaveURL(/\/library/);
    await expect(page.getByTestId("map-layout-morph")).toHaveCount(0);
    await page.goBack();
    await expect(page.getByTestId("hex-board-map")).toHaveAttribute("data-hex-ready", "true");
    expect(errors).toEqual([]);
  });
});
