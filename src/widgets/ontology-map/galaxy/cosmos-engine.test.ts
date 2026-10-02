import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MAP_NAVIGATION_SPEED } from "@/shared/lib/appearance-preferences";
import { overviewCamera } from "./cosmos-camera";
import { CosmosEngine } from "./cosmos-engine";
import type { CosmosFrameStats, CosmosInks } from "./cosmos-types";
import type { CosmosLayout } from "./layout/cosmos-layout";

const draw = vi.hoisted(() => ({ next: [] as (() => Partial<CosmosFrameStats>)[] }));

vi.mock("./draw/cosmos-frame", () => ({
  drawCosmosFrame: () => ({ band: "spine", pendingBuilds: 0, buildsStarted: 0, firstDraws: 0, labels: [], ...(draw.next.shift()?.() ?? {}) }),
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
