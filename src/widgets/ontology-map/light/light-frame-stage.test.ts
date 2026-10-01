import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CameraAxes } from "../engine/camera";
import type { DomeRuntime } from "../model/dome-view";
import type { TopologyMapLensKind } from "../model/path-lens";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import type { OntologyMapEdge, OntologyMapNode } from "../ui/OntologyMap";
import { buildTopologyWorld, type TopologyWorld } from "../ui/topology-world";
import { createLightFrameStage, type LightFrameStage, type LightStageOptions } from "./light-frame-stage";
import * as layerModule from "./light-layer";
import { isEdgeSignalled } from "./signal-plan";

const TOKENS = {
  radiusProject: 20,
  radiusDomain: 14,
  radiusCapability: 8,
  radiusElement: 5,
  layoutRingDomain: 250,
  layoutRingCapability: 145,
  layoutRingElement: 90,
  edgeBowContains: 70,
  edgeBowDepends: 92,
  edgeBlendContains: 0.46,
  edgeBlendDepends: 0.62,
  starCount: 2,
  radiusMagnitudeK: 0,
  indigoBright: "#8890e0",
  lightSpeed: 1100,
  lightHopMinMs: 180,
  lightHopMaxMs: 420,
  lightPathMaxMs: 1200,
  lightTail: 0.35,
  lightCorePx: 1.6,
  lightHaloPx: 6,
  lightIntensity: 0.9,
  lightBloomTau: 0.28,
} as unknown as OntologyMapTokens;

const CAMERA: CameraAxes = {
  x: { value: 0, velocity: 0 },
  y: { value: 0, velocity: 0 },
  scale: { value: 1, velocity: 0 },
};

const FRAME_MS = 1000 / 60;
const SPENT_MS = 4000;

function mapNode(id: string, kind: OntologyMapNode["kind"]): OntologyMapNode {
  return { id, kind, label: id, size: 1, x: 0, y: 0, isHub: false, ownerKey: null, recentlyUpdated: false, fullDegree: 0, descendantCount: 0 };
}

function mapEdge(source: string, target: string, kind: "contains" | "depends", id: string): OntologyMapEdge {
  return { id, source, target, relationType: kind === "contains" ? "contains" : "depends_on", relationQuality: null, evidenceCount: 0, kind, declaredBySlug: null };
}

function world(): TopologyWorld {
  const nodes = [mapNode("p", "project"), mapNode("d0", "domain"), mapNode("d1", "domain"), mapNode("d2", "domain")];
  const edges = [mapEdge("p", "d0", "contains", "e0"), mapEdge("p", "d1", "contains", "e1"), mapEdge("p", "d2", "contains", "e2"), mapEdge("d0", "d1", "depends", "e3")];
  return buildTopologyWorld(nodes, edges, TOKENS);
}

function recordingGl(renderer = "ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max)") {
  const calls: string[] = [];
  const loseContext = vi.fn();
  const record =
    (name: string, result?: unknown) =>
    (..._args: unknown[]) => {
      calls.push(name);
      return result;
    };
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    DYNAMIC_DRAW: 6,
    FLOAT: 7,
    DEPTH_TEST: 8,
    BLEND: 9,
    ONE: 1,
    COLOR_BUFFER_BIT: 10,
    TRIANGLE_STRIP: 11,
    RGBA: 12,
    UNSIGNED_BYTE: 13,
    RENDERER: 14,
    createShader: record("createShader", {}),
    shaderSource: record("shaderSource"),
    compileShader: record("compileShader"),
    getShaderParameter: record("getShaderParameter", true),
    getShaderInfoLog: record("getShaderInfoLog", ""),
    deleteShader: record("deleteShader"),
    createProgram: record("createProgram", {}),
    attachShader: record("attachShader"),
    linkProgram: record("linkProgram"),
    getProgramParameter: record("getProgramParameter", true),
    getProgramInfoLog: record("getProgramInfoLog", ""),
    createVertexArray: record("createVertexArray", {}),
    createBuffer: record("createBuffer", {}),
    bindVertexArray: record("bindVertexArray"),
    bindBuffer: record("bindBuffer"),
    bufferData: record("bufferData"),
    bufferSubData: record("bufferSubData"),
    enableVertexAttribArray: record("enableVertexAttribArray"),
    vertexAttribPointer: record("vertexAttribPointer"),
    vertexAttribDivisor: record("vertexAttribDivisor"),
    getUniformLocation: record("getUniformLocation", {}),
    disable: record("disable"),
    enable: record("enable"),
    blendFunc: record("blendFunc"),
    clearColor: record("clearColor"),
    viewport: record("viewport"),
    clear: record("clear"),
    useProgram: record("useProgram"),
    uniform2f: record("uniform2f"),
    uniform3fv: record("uniform3fv"),
    uniform1f: record("uniform1f"),
    drawArraysInstanced: record("drawArraysInstanced"),
    readPixels: record("readPixels"),
    getExtension: (name: string) =>
      name === "WEBGL_lose_context" ? { loseContext } : name === "WEBGL_debug_renderer_info" ? { UNMASKED_RENDERER_WEBGL: 15 } : null,
    getParameter: (parameter: number) => (parameter === 15 || parameter === 14 ? renderer : null),
  };
  return {
    gl,
    loseContext,
    count: (name: string) => calls.filter((call) => call === name).length,
    reset: () => {
      calls.length = 0;
    },
  };
}

interface Harness {
  stage: LightFrameStage;
  map: HTMLCanvasElement;
  refs: {
    reducedMotionRef: { current: boolean };
    egoRevealRef: { current: Map<string, number> };
    galaxyRef: { current: boolean };
    domeRuntimeRef: { current: DomeRuntime | null };
    mapLensKindRef: { current: TopologyMapLensKind };
    pathEdgeIdsRef: { current: ReadonlySet<string> | null };
    spotlightIdsRef: { current: ReadonlySet<string> | null };
    colorFocusRef: { current: unknown };
  };
  lightActiveRef: { current: boolean };
  world: TopologyWorld;
  runIdle: () => void;
  frame: (now: number, focus: string | null) => void;
  light: () => HTMLCanvasElement | null;
}

function harness(options: Partial<LightStageOptions> = {}): Harness {
  const container = document.createElement("div");
  const map = document.createElement("canvas");
  container.append(map);
  document.body.append(container);
  const refs: Harness["refs"] = {
    reducedMotionRef: { current: false },
    egoRevealRef: { current: new Map() },
    galaxyRef: { current: false },
    domeRuntimeRef: { current: null },
    mapLensKindRef: { current: "recent" },
    pathEdgeIdsRef: { current: null },
    spotlightIdsRef: { current: null },
    colorFocusRef: { current: null },
  };
  const lightActiveRef = { current: false };
  const idle: (() => void)[] = [];
  const stage = createLightFrameStage(
    { canvasRef: { current: map }, refs, lightActiveRef, requestFrame: () => {} },
    {
      search: "",
      loadLayer: () => Promise.resolve(layerModule),
      scheduleIdle: (callback) => {
        idle.push(callback);
        return () => {
          const at = idle.indexOf(callback);
          if (at >= 0) idle.splice(at, 1);
        };
      },
      ...options,
    },
  );
  const built = world();
  return {
    stage,
    map,
    refs,
    lightActiveRef,
    world: built,
    runIdle: () => {
      for (const callback of idle.splice(0)) callback();
    },
    frame: (now, focus) => {
      refs.colorFocusRef.current = focus === null ? null : { focusedNodeId: focus, selectedEdge: null };
      stage.prepare(now, TOKENS, built, CAMERA, 800, 600, focus, false, new Set());
      stage.render();
    },
    light: () => container.querySelector<HTMLCanvasElement>('[data-testid="map-light"]'),
  };
}

let fake: ReturnType<typeof recordingGl>;

function stubContext(gl: unknown) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function getContext(this: HTMLCanvasElement, type: string) {
    return (type === "webgl2" ? gl : null) as never;
  } as typeof HTMLCanvasElement.prototype.getContext);
}

async function ready(h: Harness) {
  h.frame(0, null);
  h.runIdle();
  await vi.waitFor(() => expect(h.light()).not.toBeNull());
  h.frame(FRAME_MS, null);
}

beforeEach(() => {
  fake = recordingGl();
  stubContext(fake.gl);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("light frame stage", () => {
  it("creates its canvas in an idle callback after the first frame, beside the map canvas", async () => {
    const h = harness();
    h.frame(0, null);
    expect(h.light()).toBeNull();
    h.runIdle();
    await vi.waitFor(() => expect(h.light()).not.toBeNull());
    const light = h.light()!;
    expect(h.map.nextElementSibling).toBe(light);
    expect(light.getAttribute("aria-hidden")).toBe("true");
    expect(light.style.pointerEvents).toBe("none");
    expect(light.style.visibility).toBe("hidden");
    expect(["plus-lighter", "screen"]).toContain(light.style.mixBlendMode);
    h.stage.dispose();
  });

  it("draws one call per program per frame and allocates its buffers once", async () => {
    const h = harness();
    await ready(h);
    const allocations = fake.count("bufferData");
    expect(allocations).toBe(2);
    fake.reset();
    h.frame(2 * FRAME_MS, "d0");
    expect(h.lightActiveRef.current).toBe(true);
    expect(fake.count("drawArraysInstanced")).toBe(2);
    expect(h.light()!.style.visibility).toBe("visible");
    fake.reset();
    h.frame(3 * FRAME_MS, "d0");
    expect(fake.count("drawArraysInstanced")).toBe(2);
    expect(fake.count("bufferSubData")).toBe(2);
    expect(fake.count("bufferData")).toBe(0);
    h.stage.dispose();
  });

  it("clears once when the light is spent and then makes no call at all", async () => {
    const h = harness();
    await ready(h);
    h.frame(2 * FRAME_MS, "d0");
    for (let now = 3 * FRAME_MS; now < SPENT_MS; now += FRAME_MS) h.frame(now, "d0");
    expect(h.lightActiveRef.current).toBe(false);
    expect(h.light()!.style.visibility).toBe("hidden");
    fake.reset();
    h.frame(SPENT_MS, "d0");
    h.frame(SPENT_MS + FRAME_MS, "d0");
    expect(fake.count("drawArraysInstanced")).toBe(0);
    expect(fake.count("clear")).toBe(0);
    h.stage.dispose();
  });

  it("lights nothing for a focus that was already there when the light started", async () => {
    const h = harness();
    h.frame(0, "d0");
    h.runIdle();
    await vi.waitFor(() => expect(h.light()).not.toBeNull());
    fake.reset();
    h.frame(FRAME_MS, "d0");
    h.frame(2 * FRAME_MS, "d0");
    expect(h.lightActiveRef.current).toBe(false);
    expect(fake.count("drawArraysInstanced")).toBe(0);
    h.stage.dispose();
  });

  it("replaces the plan on a refocus rather than stacking it", async () => {
    const h = harness({ search: "?e2e=1" });
    await ready(h);
    h.frame(2 * FRAME_MS, "d0");
    const probe = (window as unknown as { __atlasMapLight: { plan: () => { anchorId: string; signals: unknown[] }[] } }).__atlasMapLight;
    expect(probe.plan().map((plan) => plan.anchorId)).toEqual(["d0"]);
    h.frame(3 * FRAME_MS, "d1");
    expect(probe.plan().map((plan) => plan.anchorId)).toEqual(["d1"]);
    h.stage.dispose();
    expect((window as unknown as { __atlasMapLight?: unknown }).__atlasMapLight).toBeUndefined();
  });

  it("lights a found path once, and not again when a focus comes and goes", async () => {
    const h = harness({ search: "?e2e=1" });
    await ready(h);
    const probe = (window as unknown as { __atlasMapLight: { plan: () => { kind: string; signals: { fromId: string; toId: string }[] }[] } }).__atlasMapLight;
    h.refs.mapLensKindRef.current = "path";
    h.refs.spotlightIdsRef.current = new Set(["p", "d0", "d1"]);
    h.refs.pathEdgeIdsRef.current = new Set(["e0", "e3"]);
    h.frame(2 * FRAME_MS, null);
    expect(probe.plan().find((plan) => plan.kind === "path")?.signals.map((s) => [s.fromId, s.toId])).toEqual([
      ["p", "d0"],
      ["d0", "d1"],
    ]);
    let now = 3 * FRAME_MS;
    for (; now < SPENT_MS; now += FRAME_MS) h.frame(now, null);
    expect(h.lightActiveRef.current).toBe(false);
    h.frame((now += FRAME_MS), "d2");
    h.frame((now += FRAME_MS), null);
    h.frame((now += FRAME_MS), null);
    expect(h.lightActiveRef.current).toBe(false);
    expect(probe.plan().some((plan) => plan.kind === "path")).toBe(false);
    h.refs.pathEdgeIdsRef.current = new Set(["e1"]);
    h.refs.spotlightIdsRef.current = new Set(["p", "d1"]);
    h.frame((now += FRAME_MS), null);
    expect(h.lightActiveRef.current).toBe(true);
    h.stage.dispose();
  });

  it("stands a comet down only while a light runs on its line", async () => {
    const h = harness();
    await ready(h);
    h.frame(2 * FRAME_MS, "d1");
    const edge = h.world.edges.find((candidate) => candidate.id === "e3")!;
    const project = (x: number, y: number) => ({ x: (x - CAMERA.x.value) * CAMERA.scale.value + 400, y: (y - CAMERA.y.value) * CAMERA.scale.value + 300 });
    const a = project(edge.ax, edge.ay);
    const c = project(edge.controlX, edge.controlY);
    const b = project(edge.bx, edge.by);
    expect(isEdgeSignalled(a, c, b)).toBe(true);
    for (let now = 3 * FRAME_MS; now < SPENT_MS; now += FRAME_MS) h.frame(now, "d1");
    expect(isEdgeSignalled(a, c, b)).toBe(false);
    h.stage.dispose();
  });

  it("draws no light in a 3D arrangement", async () => {
    const h = harness();
    await ready(h);
    h.refs.domeRuntimeRef.current = { rampClock: 10 } as unknown as DomeRuntime;
    fake.reset();
    h.frame(2 * FRAME_MS, "d0");
    expect(h.lightActiveRef.current).toBe(false);
    expect(fake.count("drawArraysInstanced")).toBe(0);
    h.stage.dispose();
  });

  it("never asks for a context under reduced motion, and lets one go when the preference turns on", async () => {
    const getContext = vi.mocked(HTMLCanvasElement.prototype.getContext);
    const still = harness();
    still.refs.reducedMotionRef.current = true;
    still.frame(0, null);
    still.runIdle();
    still.frame(FRAME_MS, "d0");
    expect(getContext).not.toHaveBeenCalled();
    expect(still.light()).toBeNull();
    still.stage.dispose();

    const h = harness();
    await ready(h);
    h.refs.reducedMotionRef.current = true;
    h.frame(2 * FRAME_MS, "d0");
    expect(fake.loseContext).toHaveBeenCalledOnce();
    expect(h.light()).toBeNull();
    h.stage.dispose();
  });

  it("goes dark while its context is lost and resumes when it is restored", async () => {
    const h = harness();
    await ready(h);
    const lost = new Event("webglcontextlost", { cancelable: true });
    h.light()!.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    fake.reset();
    h.frame(2 * FRAME_MS, "d0");
    expect(h.lightActiveRef.current).toBe(false);
    expect(fake.count("drawArraysInstanced")).toBe(0);
    h.light()!.dispatchEvent(new Event("webglcontextrestored"));
    h.frame(3 * FRAME_MS, "d0");
    expect(h.lightActiveRef.current).toBe(false);
    h.frame(4 * FRAME_MS, "d1");
    expect(h.lightActiveRef.current).toBe(true);
    expect(fake.count("drawArraysInstanced")).toBeGreaterThan(0);
    h.stage.dispose();
  });

  it("loses its context and leaves the page when disposed", async () => {
    const h = harness();
    await ready(h);
    h.stage.dispose();
    expect(fake.loseContext).toHaveBeenCalledOnce();
    expect(h.light()).toBeNull();
  });

  it("stays off on a software renderer unless the page forces it", async () => {
    vi.restoreAllMocks();
    fake = recordingGl("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)");
    stubContext(fake.gl);
    const software = harness();
    software.frame(0, null);
    software.runIdle();
    await vi.waitFor(() => expect(fake.loseContext).toHaveBeenCalledOnce());
    expect(software.light()).toBeNull();
    software.stage.dispose();

    const forced = harness({ search: "?light=force" });
    forced.frame(0, null);
    forced.runIdle();
    await vi.waitFor(() => expect(forced.light()).not.toBeNull());
    forced.stage.dispose();
  });
});
