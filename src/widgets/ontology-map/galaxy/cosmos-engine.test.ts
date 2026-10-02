import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MAP_NAVIGATION_SPEED } from "@/shared/lib/appearance-preferences";
import { galaxyFitScale, liveBandRadius, overviewCamera, posedPoint, worldToScreen } from "./cosmos-camera";
import { CosmosEngine } from "./cosmos-engine";
import type { CosmosFrameStats, CosmosInks } from "./cosmos-types";
import { galaxyKey } from "./draw/cosmos-bitmap-cache";
import { computeCosmosLayout, type CosmosLayout } from "./layout/cosmos-layout";

const draw = vi.hoisted(() => ({ next: [] as (() => Partial<CosmosFrameStats>)[], trail: undefined as unknown }));

vi.mock("./draw/cosmos-frame", () => ({
  drawCosmosFrame: (input: { trail: unknown }) => {
    draw.trail = input.trail;
    return { band: "spine", pendingBuilds: 0, buildsStarted: 0, firstDraws: 0, labels: [], ...(draw.next.shift()?.() ?? {}) };
  },
}));
vi.mock("./draw/cosmos-labels", () => ({ registerCosmosLabels: () => {} }));
vi.mock("./draw/cosmos-paint", async (importOriginal) => ({ ...(await importOriginal<object>()), buildDeepField: () => null }));

const layout = {
  galaxies: [],
  filaments: [],
  core: { id: null, label: "", radius: 10, starIds: [], starX: new Float32Array(), starY: new Float32Array(), starKind: new Uint8Array(), starMagnitude: new Float32Array() },
  points: new Map([["a", { x: 0, y: 0 }]]),
  galaxyOf: new Map(),
  bounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
  settle: { keyframes: [] },
  placement: { version: 1, centres: {} },
  timings: { modelMs: 0, settleMs: 0, placeMs: 0, totalMs: 0 },
} as unknown as CosmosLayout;

function realSky(): CosmosLayout {
  const nodes = [{ id: "p", label: "P", kind: "project" as const }];
  const edges: { source: string; target: string; kind: "contains"; relationType: string }[] = [];
  for (let d = 0; d < 3; d += 1) {
    nodes.push({ id: `d${d}`, label: `D${d}`, kind: "domain" as never });
    edges.push({ source: "p", target: `d${d}`, kind: "contains", relationType: "contains" });
    for (let c = 0; c < 4; c += 1) {
      nodes.push({ id: `d${d}c${c}`, label: `C${c}`, kind: "capability" as never });
      edges.push({ source: `d${d}`, target: `d${d}c${c}`, kind: "contains", relationType: "contains" });
    }
  }
  return computeCosmosLayout(nodes, edges);
}

let frames: FrameRequestCallback[] = [];

function runFrame(now: number): void {
  const queued = frames;
  frames = [];
  for (const cb of queued) cb(now);
}

function mount(onDrawn = vi.fn()) {
  const canvas = document.createElement("canvas");
  canvas.getContext = (() => ({})) as unknown as HTMLCanvasElement["getContext"];
  canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) });
  document.body.append(canvas);
  const engine = new CosmosEngine(canvas, { onDrawn, reducedMotion: true, navigationSpeed: DEFAULT_MAP_NAVIGATION_SPEED });
  engine.setInks({} as CosmosInks);
  engine.setLayout(layout, new Map(), [], "none");
  return { engine, canvas, onDrawn };
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
  draw.next = [];
  document.body.innerHTML = "";
});

describe("cosmos engine", () => {
  it("requests the next frame when a frame's draw throws", () => {
    const { engine } = mount();
    draw.next.push(() => {
      throw new Error("bad frame");
    });
    expect(() => runFrame(16)).toThrow("bad frame");
    expect(frames).toHaveLength(1);
    runFrame(32);
    runFrame(48);
    expect(frames).toHaveLength(0);
    engine.destroy();
  });

  it("signals camera rest once the camera holds still for a frame, apart from the loop sleeping", () => {
    const onCameraRest = vi.fn();
    const onRest = vi.fn();
    const { engine } = mount();
    engine.setOptions({ onCameraRest, onRest });
    runFrame(16);
    expect(onCameraRest).not.toHaveBeenCalled();
    runFrame(32);
    expect(onCameraRest).toHaveBeenCalledTimes(1);
    engine.requestFrame();
    runFrame(48);
    expect(onCameraRest).toHaveBeenCalledTimes(1);
    engine.rig.camera = { ...engine.rig.camera, x: engine.rig.camera.x + 5 };
    engine.requestFrame();
    runFrame(64);
    expect(onCameraRest).toHaveBeenCalledTimes(1);
    runFrame(80);
    expect(onCameraRest).toHaveBeenCalledTimes(2);
    engine.destroy();
  });

  it("asks for frames while an attended concept's relations reveal, and stops at 420 ms", () => {
    const { engine } = mount();
    engine.setOptions({ reducedMotion: false });
    runFrame(16);
    engine.setSelected("a");
    for (let now = 32; now <= 1_000; now += 16) {
      engine.requestFrame();
      runFrame(now);
    }
    const revealing = engine.frameLog.filter((f) => f.why & 32).map((f) => f.t);
    expect(revealing[0]).toBe(32);
    expect(revealing.at(-1)).toBeGreaterThanOrEqual(32 + 420 - 16);
    expect(revealing.at(-1)).toBeLessThan(32 + 420);
    engine.destroy();
  });

  it("does not count a pointermove without movement as input", () => {
    const { engine, canvas } = mount();
    const move = (x: number) => canvas.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: 40 }));
    move(10);
    const first = engine["lastInput"];
    vi.spyOn(performance, "now").mockReturnValue(first + 5_000);
    move(10);
    expect(engine["lastInput"]).toBe(first);
    move(11);
    expect(engine["lastInput"]).toBe(first + 5_000);
    engine.destroy();
  });

  it("keeps the reader's camera when a vault re-read hands it the same sky, and refits an untouched or arriving one", () => {
    const { engine } = mount();
    const reread = { ...layout, bounds: { ...layout.bounds, maxX: 100.004 } } as CosmosLayout;
    engine.rig.frame({ x: 40, y: -25, scale: 6 }, 0);
    engine.setLayout(reread, new Map(), [], "none");
    expect(engine.rig.camera).toEqual({ x: 40, y: -25, scale: 6 });
    expect(engine.rig.overviewScale).toBe(overviewCamera(reread.bounds, engine.rig.room).overviewScale);
    engine.setLayout(layout, new Map(), [], "replay");
    expect(engine.rig.camera).toEqual(overviewCamera(layout.bounds, engine.rig.room).camera);
    engine.setLayout(reread, new Map(), [], "none");
    expect(engine.rig.camera).toEqual(overviewCamera(reread.bounds, engine.rig.room).camera);
    engine.destroy();
  });

  it("keeps bitmaps and sleeps when a data re-read hands it the same sky", () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    const { engine } = mount();
    engine.setOptions({ reducedMotion: false });
    const sky = realSky();
    engine.setLayout(sky, new Map(), [], "none");
    const sleepFrom = (t: number) => {
      for (let i = 0; frames.length > 0 && i < 2_000; i += 1) runFrame((t += 16));
      return t;
    };
    let t = sleepFrom(20_000);
    for (const g of sky.galaxies) engine.cache.setImpostor(galaxyKey(g), 256, Object.assign(document.createElement("canvas"), { width: 256, height: 256 }));
    const bytes = engine.cache.bytes();
    expect(bytes).toBe(sky.galaxies.length * 256 * 256 * 4);
    clock.mockReturnValue(t);
    engine.setLayout(realSky(), new Map(), [], "none");
    expect(engine.cache.bytes()).toBe(bytes);
    const start = t;
    let late = 0;
    for (let i = 0; frames.length > 0 && i < 1_000; i += 1) {
      runFrame((t += 16));
      if (t - start >= 1_000) late += 1;
    }
    expect(late).toBe(0);
    engine.destroy();
  });

  it("lets a second set of the same sky during the first open finish the 1,120 ms replay", () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    const { engine } = mount();
    engine.setOptions({ reducedMotion: false });
    const sky = realSky();
    engine.setLayout(sky, new Map(), [], "replay");
    runFrame(16);
    runFrame(400);
    clock.mockReturnValue(400);
    engine.setLayout(sky, new Map(), [], "none");
    runFrame(800);
    expect(engine.arrival.active).not.toBeNull();
    runFrame(16 + 1_130);
    expect(engine.arrival.active).toBeNull();
    engine.destroy();
  });

  it("treats a click on empty space inside a live galaxy as a pane click, and flies only into a galaxy drawn as one bitmap", () => {
    const onPaneClick = vi.fn();
    const { engine, canvas } = mount();
    const sky = realSky();
    engine.setLayout(sky, new Map(), [], "none");
    engine.setOptions({ onPaneClick });
    const click = (x: number, y: number) => {
      canvas.dispatchEvent(new MouseEvent("pointerdown", { clientX: x, clientY: y }));
      canvas.dispatchEvent(new MouseEvent("pointerup", { clientX: x, clientY: y }));
    };
    const g = sky.galaxies[0]!;
    const emptyIn = () => {
      for (let i = 0; i < 4_000; i += 1) {
        const r = 0.6 * g.radius * engine.rig.camera.scale * Math.sqrt(((i * 0.618034) % 1));
        const p = { x: 400 + Math.cos(i * 2.399) * r, y: 300 + Math.sin(i * 2.399) * r };
        const hit = engine.hit(p.x, p.y);
        if (hit.id === null && hit.galaxy === 0) return p;
      }
      throw new Error("no empty point");
    };
    engine.rig.camera = { x: g.x, y: g.y, scale: (2 * liveBandRadius(1)) / g.radius };
    engine.rig.room = { x: 0, y: 0, width: 800, height: 600 };
    const live = { ...engine.rig.camera };
    const p = emptyIn();
    click(p.x, p.y);
    expect(onPaneClick).toHaveBeenCalledTimes(1);
    runFrame(16);
    runFrame(400);
    expect(engine.rig.camera).toEqual(live);
    engine.rig.camera = { x: g.x, y: g.y, scale: (0.5 * liveBandRadius(1)) / g.radius };
    const q = emptyIn();
    click(q.x, q.y);
    expect(onPaneClick).toHaveBeenCalledTimes(1);
    for (let t = 432; frames.length > 0 && t < 5_000; t += 16) runFrame(t);
    expect(engine.rig.camera.scale).toBeCloseTo(galaxyFitScale(g, engine.rig.room), 6);
    engine.destroy();
  });

  it("hits a lit lens member before the star or galaxy under it", () => {
    const { engine } = mount();
    const sky = realSky();
    engine.setLayout(sky, new Map(), [], "none");
    engine.rig.room = { x: 0, y: 0, width: 800, height: 600 };
    engine.rig.camera = overviewCamera(sky.bounds, engine.rig.room).camera;
    const member = sky.galaxies[1]!.starIds[2]!;
    const w = posedPoint(sky, engine.poses, member)!;
    const s = worldToScreen(engine.rig.camera, engine.rig.room, w.x, w.y);
    expect(engine.hit(s.x + 3, s.y).id).not.toBe(member);
    engine.setLens({ kind: "recent", memberIds: new Set([member]), edgeIds: null }, null);
    expect(engine.hit(s.x + 3, s.y).id).toBe(member);
    engine.destroy();
  });

  it("reads the trail lens switch on every frame", () => {
    const { engine } = mount();
    const trail = { visitedIds: ["a"] };
    const active = { current: false };
    engine.setLens(null, trail, active);
    runFrame(16);
    expect(draw.trail).toBeNull();
    active.current = true;
    engine.requestFrame();
    runFrame(32);
    expect(draw.trail).toBe(trail);
    active.current = false;
    engine.requestFrame();
    runFrame(48);
    expect(draw.trail).toBeNull();
    engine.destroy();
  });

  it("reports drawn only on the first frame with no bitmap still baking", () => {
    const { engine, onDrawn } = mount();
    draw.next.push(() => ({ pendingBuilds: 3 }), () => ({ pendingBuilds: 1 }), () => ({ pendingBuilds: 0 }), () => ({ pendingBuilds: 0 }));
    runFrame(16);
    runFrame(32);
    expect(onDrawn).not.toHaveBeenCalled();
    runFrame(48);
    expect(onDrawn).toHaveBeenCalledTimes(1);
    engine.requestFrame();
    runFrame(64);
    expect(onDrawn).toHaveBeenCalledTimes(1);
    engine.destroy();
  });
});
