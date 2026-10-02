import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CameraTarget } from "../engine/camera";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import type { FocusLeashPx } from "./topology-camera-math";
import type { TopologyWorld } from "./topology-world";

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
    }) as unknown as OntologyMapTokens,
);

vi.mock("./topology-read-tokens", () => ({ readOntologyMapTokensOrNull: () => tokens }));
vi.mock("../render/edge-fireflies", async () => {
  const actual = await vi.importActual<typeof import("../render/edge-fireflies")>("../render/edge-fireflies");
  return { ...actual, updateParticles: vi.fn() };
});

import { stepTopologyPhysics } from "./topology-physics-step";
import { useTopologyFocusNavigation } from "./use-topology-focus-navigation";

type Kind = "project" | "domain" | "capability";

function world(): TopologyWorld {
  const at: Record<string, { x: number; y: number; kind: Kind; parentId: string | null }> = {
    p: { x: 0, y: 0, kind: "project", parentId: null },
    west: { x: -1500, y: 0, kind: "domain", parentId: "p" },
    east: { x: 1500, y: 0, kind: "domain", parentId: "p" },
    f: { x: 800, y: 0, kind: "capability", parentId: "east" },
    far: { x: -1400, y: 0, kind: "capability", parentId: "west" },
  };
  const nodeById = new Map(
    Object.entries(at).map(([id, v]) => [
      id,
      { id, kind: v.kind, label: id, x: v.x, y: v.y, homeX: v.x, homeY: v.y, parentId: v.parentId, isHub: false, fresh: false, stale: false, count: 0, magnitudeScale: 1, starMagnitude: 0 },
    ]),
  );
  const spine = { minX: -1525, minY: -25, maxX: 1525, maxY: 25 };
  return {
    nodes: [...nodeById.values()],
    nodeById,
    edges: [],
    edgeIndexByNode: new Map(),
    neighborMap: new Map([
      ["f", new Set(["east", "far"])],
      ["east", new Set(["f"])],
      ["far", new Set(["f"])],
    ]),
    childrenByParent: new Map([
      ["p", ["west", "east"]],
      ["west", ["far"]],
      ["east", ["f"]],
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

  it("aims a selection at a camera the physics lets rest, when the overview refits in the frame before", () => {
    const ref = <T,>(current: T) => ({ current });
    const cameraTargetRef = ref<CameraTarget>({ tx: 0, ty: 0, tscale: 1.157 });
    const overviewScaleRef = ref(1.218);
    const focusLeashPxRef = ref<FocusLeashPx | null>(null);
    const focusedSlugRef = ref<string | null>(null);
    const deps = {
      lastFocusedSlugRef: ref<string | null>(null),
      egoRevealBatchesRef: ref(1),
      selectionPulseRef: ref(null),
      galaxyRef: ref(false),
      cameraTargetRef,
      galaxyInspectionCameraRef: ref(null),
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
