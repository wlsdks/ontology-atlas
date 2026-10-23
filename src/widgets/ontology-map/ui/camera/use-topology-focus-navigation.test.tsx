import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CameraTarget } from "../../engine/camera";
import type { SelectionCamera, SelectionSource } from "../../model/camera/flat-selection-camera";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { computeOverviewCameraTarget, type FocusLeashPx } from "./topology-camera-math";
import type { TopologyWorld } from "../world/topology-world";

const tokens = vi.hoisted(
  () =>
    ({
      overviewEntryRatio: 0.95,
      cameraScaleMin: 0.24,
      cameraScaleMax: 2.6,
      cameraMinZoomRatio: 0.5,
      cameraMaxZoomRatio: 3.2,
      focusMaxZoomRatio: 1.8,
      focusBboxMargin: 1.15,
      cameraFocusPanMargin: 180,
      cameraPanLeash: 0,
      cameraDampingDefault: 1,
      cameraSpringAngFreqTransition: 4.7,
      safeInsetLeft: 0,
      safeInsetRight: 0,
      safeInsetTop: 0,
      safeInsetBottom: 0,
      radiusProject: 25,
      radiusDomain: 17,
      radiusCapability: 11,
      radiusElement: 7,
      edgePulseSpeed: 0,
      edgePulseSpeedEgo: 0,
      emphasisRiseTau: 0.1,
      emphasisDecayTau: 0.2,
      focusDimTau: 0.2,
      egoRevealRiseTau: 0.1,
      egoRevealDecayTau: 0.2,
    }) as unknown as OntologyMapTokens);

vi.mock("../../tokens/topology-read-tokens", () => ({ readOntologyMapTokensOrNull: () => tokens }));
vi.mock("../../render/edge-fireflies", async () => {
  const actual = await vi.importActual<typeof import("../../render/edge-fireflies")>("../../render/edge-fireflies");
  return { ...actual, updateParticles: vi.fn() };
});

import { stepTopologyPhysics } from "../frame-loop/topology-physics-step";
import { useTopologyFocusNavigation } from "./use-topology-focus-navigation";
import * as branchFrame from "./branch-frame/target";

type Kind = "project" | "domain" | "capability";

function world(): TopologyWorld {
  const at: Record<string, { x: number; y: number; kind: Kind; parentId: string | null;
    }> = {
    p: { x: 0, y: 0, kind: "project", parentId: null },
    west: { x: -1500, y: 0, kind: "domain", parentId: "p" },
    east: { x: 1500, y: 0, kind: "domain", parentId: "p" },
    f: { x: 800, y: 0, kind: "capability", parentId: "east" },
    far: { x: -1400, y: 0, kind: "capability", parentId: "west" },
  };
  const nodeById = new Map(
    Object.entries(at).map(([id, v]) => [
      id,
      { id, kind: v.kind, label: id, x: v.x, y: v.y, homeX: v.x, homeY: v.y, parentId: v.parentId, isHub: false, fresh: false, stale: false, count: 0, magnitudeScale: 1 }
    ]));
  const spine = { minX: -1525, minY: -25, maxX: 1525, maxY: 25 };
  return {
    nodes: [...nodeById.values()],
    nodeById,
    edges: [],
    edgeIndexByNode: new Map(),
    neighborMap: new Map([
      ["f", new Set(["east", "far"])],
      ["east", new Set(["f"])],
      ["far", new Set(["f"])]
        ]),
    childrenByParent: new Map([
      ["p", ["west", "east"]],
      ["west", ["far"]],
      ["east", ["f"]]
        ]),
    clusterMetaByParent: new Map(),
    brightStarIds: new Set(),
    bounds: spine,
    spineBounds: spine,
  } as unknown as TopologyWorld;
}

describe("useTopologyFocusNavigation", () => {
  let frames: FrameRequestCallback[] = [];

  beforeEach(() => {
    frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const ref = <T,>(current: T) => ({ current });
  const axes = (x: number, y: number, scale: number) => ({
    x: { value: x, velocity: 0 }, y: { value: y, velocity: 0 }, scale: { value: scale, velocity: 0 },
  });

  function setup(overrides: Partial<Parameters<typeof useTopologyFocusNavigation>[0]> = {}, initial: string | null = null) {
    const deps = {
      lastFocusedSlugRef: ref<string | null>(null),
      egoRevealBatchesRef: ref(1),
      selectionPulseRef: ref(null),
      cameraTargetRef: ref<CameraTarget>({ tx: 0, ty: 0, tscale: 1 }),
      cameraRef: ref(axes(0, 0, 1)),
      constellationFocusId: null,
      cameraGestureRevisionRef: ref(0),
      userDrivenCameraRef: ref(false),
      dampingRef: ref(1),
      cameraAngularFreqRef: ref<number | null>(null),
      lastActiveMsRef: ref(0),
      beginCameraTween: vi.fn(),
      focusedSlugRef: ref<string | null>(null),
      canvasRef: ref(null),
      worldRef: ref<TopologyWorld | null>(world()),
      viewportRef: ref({ width: 1200, height: 800, dpr: 1 }),
      overviewScaleRef: ref(1),
      view3dRef: ref(false),
      realmTransitionRef: ref({ phase: "idle" }),
      domeRuntimeRef: ref(null),
      realmDataRef: ref(null),
      expandedParentsRef: ref<ReadonlySet<string>>(new Set()),
      cameraTokens: <T,>(t: T) => t,
      focusLeashPxRef: ref<FocusLeashPx | null>(null),
      overviewFitRef: ref<"full" | "spine">("spine"),
      clusteredIdsRef: ref<ReadonlySet<string>>(new Set()),
      mapLensKindRef: ref("recent"),
      spotlightIdsRef: ref(null),
      selectionCameraRef: ref<SelectionCamera | null>(null),
      selectionSourceRef: ref<{ slug: string; source: SelectionSource } | null>(null),
      ...overrides,
    } as unknown as Parameters<typeof useTopologyFocusNavigation>[0];
    const hook = renderHook((focusedSlug: string | null) => useTopologyFocusNavigation({ ...deps, focusedSlug }), {
      initialProps: initial,
    });
    const select = (slug: string | null, { click = false } = {}) => {
      if (click && slug !== null) deps.selectionSourceRef.current = { slug, source: "canvas-click" };
      deps.focusedSlugRef.current = slug;
      hook.rerender(slug);
      frames.shift()!(performance.now());
    };
    return { deps, hook, select };
  }

  it("frames an initial deep link but recomputes the current overview when it is deselected", () => {
    let left = 0;
    const unfinishedEntry = { tx: 900, ty: 200, tscale: 0.8 };
    const { deps, select } = setup({ lastFocusedSlugRef: ref("f"), cameraTargetRef: ref(unfinishedEntry),
      overviewFitRef: ref("full"), cameraTokens: <T,>(t: T) => ({ ...t, safeInsetLeft: left }),
    }, "f");
    frames.shift()?.(performance.now());
    expect(deps.beginCameraTween).toHaveBeenCalled();
    expect(deps.selectionCameraRef.current).toBeNull();
    left = 300;
    select(null);
    const world = deps.worldRef.current!;
    expect(deps.cameraTargetRef.current).toEqual(computeOverviewCameraTarget(world.bounds, 1200, 800, { ...tokens, safeInsetLeft: left }, world.nodes.length));
  });

  it("returns the first user search to the exact view it left", () => {
    const before = { tx: 123, ty: -47, tscale: 0.8 };
    const { deps, select } = setup({ cameraTargetRef: ref({ ...before }) });
    select("f");
    expect(deps.selectionCameraRef.current?.restore).toEqual(before);
    select(null);
    expect(deps.cameraTargetRef.current).toEqual(before);
  });

  it("allows a searched branch camera to rest beyond the default focus leash", () => {
    const target = { tx: 0, ty: 0, tscale: 1 };
    vi.spyOn(branchFrame, "branchFocusTarget").mockReturnValue(target);
    const { deps, select } = setup();
    select("east");
    expect(deps.cameraTargetRef.current).toEqual(target);
    expect(deps.focusLeashPxRef.current!.x).toBeGreaterThan(Math.abs(1500 - target.tx) * target.tscale);
  });

  it("waits for scoped entry to finish before framing an initial selected capability", () => {
    const phase = ref({ phase: "entering" });
    const { deps } = setup({ realmTransitionRef: phase as never }, "f");
    frames.shift()?.(performance.now());
    expect(deps.beginCameraTween).not.toHaveBeenCalled();
    expect(deps.lastFocusedSlugRef.current).toBeNull();
    phase.current.phase = "active";
    frames.shift()?.(performance.now());
    expect(deps.beginCameraTween).toHaveBeenCalled();
  });

  it("preserves selection and deselection framing inside an active 3D realm", () => {
    const { deps, select } = setup({ view3dRef: ref(true), realmTransitionRef: ref({ phase: "active" }) as never });
    select("f");
    expect(deps.beginCameraTween).toHaveBeenCalledTimes(1);
    expect(deps.lastFocusedSlugRef.current).toBe("f");
    select(null);
    expect(deps.beginCameraTween).toHaveBeenCalledTimes(2);
    expect(deps.lastFocusedSlugRef.current).toBeNull();
  });

  it("does not apply a pending Flat focus after switching to 3D", () => {
    const worldRef = ref<TopologyWorld | null>(null);
    const view3dRef = ref(false);
    const { deps, hook } = setup({ worldRef, view3dRef });
    deps.focusedSlugRef.current = "f";
    hook.rerender("f");
    frames.shift()?.(performance.now());
    worldRef.current = world();
    view3dRef.current = true;
    frames.shift()?.(performance.now());
    expect(deps.beginCameraTween).not.toHaveBeenCalled();
  });

  it("waits for search modal isolation to release before measuring the selected map", () => {
    const shell = document.createElement("div");
    const canvas = document.createElement("canvas");
    shell.append(canvas);
    shell.setAttribute("aria-hidden", "true");
    const measured = vi.fn();
    const cameraTokens = <T,>(t: T) => { measured(); return { ...t, safeInsetLeft: 324 }; };
    const { deps, select } = setup({ canvasRef: ref(canvas), cameraTokens });
    select("f");
    expect(measured).not.toHaveBeenCalled();
    expect(deps.beginCameraTween).not.toHaveBeenCalled();
    expect(deps.lastFocusedSlugRef.current).toBeNull();
    shell.removeAttribute("aria-hidden");
    frames.shift()?.(performance.now());
    expect(measured).toHaveBeenCalledTimes(1);
    expect(deps.beginCameraTween).toHaveBeenCalledTimes(1);
    expect(deps.lastFocusedSlugRef.current).toBe("f");
  });

  it("waits for the selected node's world instead of consuming a deep link before it exists", () => {
    const worldRef = ref<TopologyWorld | null>(null);
    const { deps, hook } = setup({ worldRef });
    deps.focusedSlugRef.current = "f";
    hook.rerender("f");
    frames.shift()?.(performance.now());
    expect(deps.lastFocusedSlugRef.current).toBeNull();
    expect(deps.beginCameraTween).not.toHaveBeenCalled();
    worldRef.current = world();
    frames.shift()!(performance.now());
    expect(deps.lastFocusedSlugRef.current).toBe("f");
    expect(deps.beginCameraTween).toHaveBeenCalled();
  });

  it("releases the closing inspector's label exclusion on deselect", () => {
    const panelInsetsRef = ref<{ left: number; right: number } | null>({ left: 300, right: 400 });
    const { select } = setup({ panelInsetsRef });
    select("p", { click: true });
    select(null);
    expect(panelInsetsRef.current?.right).toBe(tokens.safeInsetRight);
  });

  it("does not re-reserve a closing inspector after a manual pan", () => {
    const panelInsetsRef = ref<{ left: number; right: number } | null>({ left: 0, right: 400 });
    const { deps, select } = setup({ panelInsetsRef, cameraTokens: <T,>(t: T) => {
      panelInsetsRef.current = { left: 0, right: 400 };
      return { ...t, safeInsetRight: 400 };
    } });
    select("f", { click: true });
    deps.cameraTargetRef.current = { tx: 900, ty: 50, tscale: 1.4 };
    deps.cameraGestureRevisionRef.current++;
    deps.userDrivenCameraRef.current = true;
    select(null);
    expect(panelInsetsRef.current?.right).toBe(tokens.safeInsetRight);
  });

  it("remeasures the inspector after a fly action selects its domain", () => {
    let right = 0;
    const { deps, hook, select } = setup({ cameraTokens: <T,>(t: T) => ({ ...t, safeInsetRight: right }) });
    hook.result.current.flyToNode("east");
    const before = { ...deps.cameraTargetRef.current };
    right = 400;
    select("east");
    expect(deps.beginCameraTween).toHaveBeenCalledTimes(2);
    expect(deps.cameraTargetRef.current).not.toEqual(before);
    expect(deps.selectionCameraRef.current?.framed).toBe(true);
  });

  it("does not replace the saved return camera when realm exit restores the selected root", () => {
    const { deps, select } = setup();
    deps.cameraTargetRef.current = { tx: 130, ty: -75, tscale: 0.7 };
    deps.realmTransitionRef.current = { phase: "exiting", rootId: "f", startMs: 0, durationMs: 800 };
    select("f");
    expect(deps.beginCameraTween).not.toHaveBeenCalled();
    expect(deps.cameraTargetRef.current).toEqual({ tx: 130, ty: -75, tscale: 0.7 });
  });

  it("a click selects without moving the camera when the node already sits in the free map", () => {
    const { deps, select } = setup();
    select("p", { click: true });
    expect(deps.beginCameraTween).not.toHaveBeenCalled();
    expect(deps.cameraTargetRef.current).toEqual({ tx: 0, ty: 0, tscale: 1 });
  });

  it("a click under the panel slides sideways at the same scale on the canvas spring, and one deselect slides it back exactly", () => {
    const { deps, select } = setup({ cameraTokens: <T,>(t: T) => ({ ...t, safeInsetRight: 400 }) });
    select("f", { click: true });
    expect(deps.cameraTargetRef.current).toEqual({ tx: 664, ty: 0, tscale: 1 });
    expect(deps.beginCameraTween).toHaveBeenLastCalledWith({ tx: 664, ty: 0, tscale: 1 }, undefined, "spring");
    select(null);
    expect(deps.cameraTargetRef.current).toEqual({ tx: 0, ty: 0, tscale: 1 });
    expect(deps.beginCameraTween).toHaveBeenLastCalledWith({ tx: 0, ty: 0, tscale: 1 }, undefined, "spring");
  });

  it("a deselect never takes back a view the reader moved after the click", () => {
    const { deps, select } = setup({ cameraTokens: <T,>(t: T) => ({ ...t, safeInsetRight: 400 }) });
    select("f", { click: true });
    deps.cameraTargetRef.current = { tx: 700, ty: 40, tscale: 1.4 };
    vi.mocked(deps.beginCameraTween).mockClear();
    select(null);
    expect(deps.beginCameraTween).not.toHaveBeenCalled();
    expect(deps.cameraTargetRef.current).toEqual({ tx: 700, ty: 40, tscale: 1.4 });
  });

  it("a pan the focus leash held short stays where the reader sees it after the deselect", () => {
    for (const seenX of [350, 700]) {
      const { deps, select } = setup();
      select("f");
      deps.cameraTargetRef.current = { tx: 300, ty: 0, tscale: 1.4 };
      deps.cameraRef.current = axes(seenX, 0, 1.4);
      deps.cameraGestureRevisionRef.current += 1;
      vi.mocked(deps.beginCameraTween).mockClear();
      select(null);
      expect(deps.beginCameraTween).not.toHaveBeenCalled();
      const tx = deps.cameraTargetRef.current.tx;
      if (seenX === 350) expect(tx).toBe(350);
      else expect(tx > 300 && tx < 700).toBe(true);
      expect(deps.cameraTargetRef.current.tscale).toBe(1.4);
    }
  });

  it("framing a node is its own gesture, and the deselect after it returns past the click's slide", () => {
    const { deps, hook, select } = setup({ cameraTokens: <T,>(t: T) => ({ ...t, safeInsetRight: 400 }) });
    select("f", { click: true });
    hook.result.current.flyToNode("f");
    expect(deps.cameraTargetRef.current.tscale).not.toBe(1);
    expect(deps.beginCameraTween).toHaveBeenLastCalledWith(deps.cameraTargetRef.current, undefined, undefined);
    select(null);
    expect(deps.cameraTargetRef.current).toEqual({ tx: 0, ty: 0, tscale: 1 });
  });

  it("a selection from a panel link frames the node, and one deselect returns within a pixel of the view before the link", () => {
    const { deps, select } = setup();
    const before = { tx: 120, ty: -60, tscale: 1 };
    deps.cameraTargetRef.current = { ...before };
    select("p", { click: true });
    select("f");
    expect(deps.cameraTargetRef.current).not.toEqual(before);
    select(null);
    const back = deps.cameraTargetRef.current;
    expect(Math.abs(back.tx - before.tx)).toBeLessThan(1);
    expect(Math.abs(back.ty - before.ty)).toBeLessThan(1);
    expect(back.tscale).toBeCloseTo(before.tscale, 6);
  });

  it("a pan after a framed selection is the reader's view, and the deselect leaves it", () => {
    const { deps, hook, select } = setup();
    select("p", { click: true });
    hook.result.current.flyToNode("p");
    const panned = { ...deps.cameraTargetRef.current, tx: deps.cameraTargetRef.current.tx + 200 };
    deps.cameraTargetRef.current = panned;
    deps.cameraGestureRevisionRef.current += 1;
    vi.mocked(deps.beginCameraTween).mockClear();
    select(null);
    expect(deps.beginCameraTween).not.toHaveBeenCalled();
    expect(deps.cameraTargetRef.current).toEqual(panned);
  });

  it("a deep link framed on arrival leaves a moved view alone on deselect", () => {
    const { deps, select } = setup({ lastFocusedSlugRef: ref("f") }, "f");
    frames.shift()?.(performance.now());
    deps.cameraTargetRef.current = { tx: 760, ty: 0, tscale: 1.3 };
    deps.userDrivenCameraRef.current = true;
    vi.mocked(deps.beginCameraTween).mockClear();
    select(null);
    expect(deps.beginCameraTween).not.toHaveBeenCalled();
    expect(deps.cameraTargetRef.current).toEqual({ tx: 760, ty: 0, tscale: 1.3 });
  });

  it("aims a selection at a camera the physics lets rest, when the overview refits in the frame before", () => {
    const cameraTargetRef = ref<CameraTarget>({ tx: 0, ty: 0, tscale: 1.157 });
    const overviewScaleRef = ref(1.218);
    const focusLeashPxRef = ref<FocusLeashPx | null>(null);
    const focusedSlugRef = ref<string | null>(null);
    const deps = {
      lastFocusedSlugRef: ref<string | null>(null),
      egoRevealBatchesRef: ref(1),
      selectionPulseRef: ref(null),
            cameraTargetRef,
      constellationFocusId: null,
      cameraGestureRevisionRef: ref(0),
      userDrivenCameraRef: ref(false),
      dampingRef: ref(1),
      cameraAngularFreqRef: ref<number | null>(null),
      lastActiveMsRef: ref(0),
      beginCameraTween: vi.fn(),
      focusedSlugRef,
      canvasRef: ref(null),
      worldRef: ref<TopologyWorld | null>(world()),
      viewportRef: ref({ width: 1200, height: 800, dpr: 1 }),
      overviewScaleRef,
      view3dRef: ref(false),
      realmTransitionRef: ref({ phase: "idle" }),
      domeRuntimeRef: ref(null),
      realmDataRef: ref(null),
      expandedParentsRef: ref<ReadonlySet<string>>(new Set()),
      cameraTokens: <T,>(t: T) => t,
      focusLeashPxRef,
      overviewFitRef: ref<"full" | "spine">("spine"),
      clusteredIdsRef: ref<ReadonlySet<string>>(new Set()),
      mapLensKindRef: ref("recent"),
      spotlightIdsRef: ref(null),
      selectionCameraRef: ref<SelectionCamera | null>(null),
      selectionSourceRef: ref(null),
    } as unknown as Parameters<typeof useTopologyFocusNavigation>[0];

    const { rerender } = renderHook((focusedSlug: string | null) => useTopologyFocusNavigation({ ...deps, focusedSlug }), {
      initialProps: null as string | null,
    });
    focusedSlugRef.current = "f";
    rerender("f");
    expect(frames).toHaveLength(1);

    overviewScaleRef.current = 0.741;
    frames.shift()!(performance.now());

    const target = cameraTargetRef.current;
    let camera = {
      x: { value: target.tx, velocity: 0 },
      y: { value: target.ty, velocity: 0 },
      scale: { value: target.tscale, velocity: 0 },
    };
    const w = deps.worldRef.current!;
    for (let frame = 0; frame < 120; frame += 1) {
      camera = stepTopologyPhysics({
        world: w,
        camera,
        target,
        damping: 1,
        overviewScale: overviewScaleRef.current,
        tokens,
        cameraAngularFrequency: 4.7,
        dt: 1 / 60,
        now: 1000 + frame * 16,
        focusedNodeId: "f",
        pairFocusActive: false,
        hoveredNodeId: null,
        panelEmphasisNodeId: null,
        isDragging: false,
        focusLeashPx: focusLeashPxRef.current,
        reducedMotion: false,
        emphasisById: new Map(),
        rippleStartById: new Map(),
        egoRevealById: new Map(),
        focusRampById: new Map(),
        appearById: new Map(),
      }).camera;
    }
    expect(Math.abs(camera.x.value - target.tx)).toBeLessThan(1e-6);
    expect(Math.abs(camera.y.value - target.ty)).toBeLessThan(1e-6);
    expect(Math.abs(camera.scale.value - target.tscale)).toBeLessThan(1e-9);
  });
});
