import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MapArrangement } from "@/shared/lib/appearance-preferences";
import type { CameraAxes, CameraTarget } from "../engine/camera";
import type { PointerMachineState } from "../interaction/pointer-state-machine";
import { buildDomeModel, DOME_ASSEMBLE_TOTAL_MS, type DomeRuntime } from "../model/dome-view";
import type { RealmTransitionState } from "../model/realm-transition";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import type { OntologyMapEdge, OntologyMapNode } from "./OntologyMap";
import { createDomeFrameStage, type DomeFrameStageSources } from "./topology-dome-frame-stage";
import { buildTopologyWorld, type TopologyWorld } from "./topology-world";
import { computeOverviewCameraTarget, computeOverviewFitScale } from "./topology-camera-math";
import { overviewBoundsFor } from "./topology-overview-fit";

const tokens = {
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
} as unknown as OntologyMapTokens;

function mapNode(id: string, kind: OntologyMapNode["kind"]): OntologyMapNode {
  return { id, kind, label: id, size: 1, x: 0, y: 0, isHub: false, ownerKey: null, recentlyUpdated: false, fullDegree: 0, descendantCount: 0 };
}

function mapEdge(source: string, target: string, kind: "contains" | "depends"): OntologyMapEdge {
  return { source, target, relationType: kind === "contains" ? "contains" : "depends_on", relationQuality: null, evidenceCount: 0, kind, declaredBySlug: null };
}

function neuralWorld(): TopologyWorld {
  const nodes = [mapNode("p", "project")];
  const edges: OntologyMapEdge[] = [];
  for (let d = 0; d < 4; d += 1) {
    nodes.push(mapNode(`d${d}`, "domain"));
    edges.push(mapEdge("p", `d${d}`, "contains"));
  }
  for (let c = 0; c < 24; c += 1) {
    nodes.push(mapNode(`c${c}`, "capability"));
    edges.push(mapEdge(`d${c % 4}`, `c${c}`, "contains"));
  }
  for (let e = 0; e < 120; e += 1) {
    nodes.push(mapNode(`e${e}`, "element"));
    edges.push(mapEdge(`c${(e * 7) % 24}`, `e${e}`, "contains"));
    if (e % 6 === 0) edges.push(mapEdge(`e${e}`, `c${(e * 5 + 3) % 24}`, "depends"));
  }
  return buildTopologyWorld(nodes, edges, tokens);
}

function stageSources(arrangement: MapArrangement, reducedMotion = false) {
  const camera: CameraAxes = {
    x: { value: 0, velocity: 0 },
    y: { value: 0, velocity: 0 },
    scale: { value: 1, velocity: 0 },
  };
  return {
    view3dRef: { current: true as boolean },
    realmTransitionRef: { current: { phase: "idle", rootId: null, startMs: 0 } as unknown as RealmTransitionState },
    domeRuntimeRef: { current: null as DomeRuntime | null },
    domeWorldSourceRef: { current: null as unknown },
    domeModelBuildRef: { current: null } as DomeFrameStageSources["domeModelBuildRef"],
    mapArrangementRef: { current: arrangement },
    domeFitPendingRef: { current: false },
    domeFitDurationRef: { current: undefined as number | undefined },
    flatFitPendingRef: { current: false as boolean },
    domeFocusPendingRef: { current: null as { slug: string | null } | null },
    cameraRef: { current: camera },
    cameraTargetRef: { current: { tx: 0, ty: 0, tscale: 1 } as CameraTarget },
    dampingRef: { current: 0 },
    cameraAngularFreqRef: { current: null as number | null },
    userDrivenCameraRef: { current: false },
    overviewScaleRef: { current: 1 },
    overviewFitRef: { current: "spine" as "spine" | "full" },
    expandedParentsRef: { current: new Set<string>() as ReadonlySet<string> },
    clusteredIdsRef: { current: new Set<string>() as ReadonlySet<string> },
    pointerMachineRef: { current: { phase: "idle", downPoint: null, pressedNodeId: null } as PointerMachineState },
    bgPointerRef: { current: null as { x: number; y: number } | null },
    reducedMotionRef: { current: reducedMotion },
    lastInputMsRef: { current: 0 },
    lastActiveMsRef: { current: 0 },
    ambientSleepDelayRef: { current: undefined as number | undefined },
    viewportRef: { current: { width: 1400, height: 860, dpr: 1 } },
    beginCameraTween: vi.fn(),
    cameraTokens: (value: OntologyMapTokens) => value,
    domeFitTarget: () => ({ tx: 0, ty: 0, tscale: 1 }),
  } satisfies DomeFrameStageSources;
}

function pureCloud(world: TopologyWorld) {
  return buildDomeModel(
    world.nodes.map((n) => ({ id: n.id, kind: n.kind, x: n.x, y: n.y, parentId: n.parentId })),
    { arrangement: "coupling", edges: world.edges },
  );
}

let frame = 0;
const nextFrameMs = () => (frame += 1) * 16;

describe("dome frame stage: a Neural layout that is still relaxing", () => {
  beforeEach(() => {
    frame = 0;
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => (clock += 0.25));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns to the flat overview using the live panel insets, once, during teardown", () => {
    const world = neuralWorld();
    const sources = stageSources("strata", true);
    const fitTokens = { ...tokens, cameraScaleMax: 2.6, cameraScaleMin: 0.01,
      cameraSmallGraphScaleMax: 1.3, overviewEntryRatio: 0.95,
      safeInsetLeft: 78, safeInsetRight: 120, safeInsetTop: 148, safeInsetBottom: 96 };
    const measured = { ...fitTokens, safeInsetLeft: 324, safeInsetRight: 24 };
    sources.cameraTokens = vi.fn(() => measured);
    const run = createDomeFrameStage(sources);
    run(nextFrameMs(), 1 / 60, fitTokens, world, 1400, 860);
    sources.view3dRef.current = false;
    sources.flatFitPendingRef.current = true;
    sources.beginCameraTween.mockClear();
    run(nextFrameMs(), 1 / 60, fitTokens, world, 1400, 860);
    const bounds = overviewBoundsFor("spine", world, fitTokens, sources.expandedParentsRef.current, sources.clusteredIdsRef.current);
    expect(sources.cameraTargetRef.current).toEqual(computeOverviewCameraTarget(bounds, 1400, 860, measured, world.nodes.length));
    expect(sources.overviewScaleRef.current).toBe(computeOverviewFitScale(bounds, 1400, 860, measured, world.nodes.length));
    expect(sources.cameraTokens).toHaveBeenCalledTimes(1);
    expect(sources.beginCameraTween).toHaveBeenCalledTimes(1);
    run(nextFrameMs(), 1 / 60, fitTokens, world, 1400, 860);
    expect(sources.beginCameraTween).toHaveBeenCalledTimes(1);
  });

  it("draws its concepts on the first frame and settles on the layout the pure build computes", () => {
    const world = neuralWorld();
    const sources = stageSources("coupling");
    const run = createDomeFrameStage(sources);
    expect(run(nextFrameMs(), 1 / 60, tokens, world, 1400, 860)).toBe(true);
    const dome = sources.domeRuntimeRef.current;
    expect(dome?.model.coords.size).toBe(world.nodes.length);
    expect(sources.domeModelBuildRef.current).not.toBeNull();
    let settlingFrames = 0;
    while (sources.domeModelBuildRef.current !== null && settlingFrames < 1000) {
      expect(run(nextFrameMs(), 1 / 60, tokens, world, 1400, 860)).toBe(true);
      settlingFrames += 1;
    }
    expect(settlingFrames).toBeGreaterThan(1);
    expect(sources.domeRuntimeRef.current).toBe(dome);
    for (const [id, coord] of pureCloud(world).coords) expect(dome!.model.coords.get(id)).toEqual(coord);
  });

  it("waits for the cloud to settle before starting the automatic attention spin", () => {
    const world = neuralWorld();
    const sources = stageSources("coupling");
    const run = createDomeFrameStage(sources);
    run(nextFrameMs(), 1 / 60, tokens, world, 1400, 860);
    const dome = sources.domeRuntimeRef.current!;
    dome.rampClock = DOME_ASSEMBLE_TOTAL_MS;
    dome.entryArmed = false;
    const yaw = dome.yaw;
    run(nextFrameMs(), 1 / 60, tokens, world, 1400, 860);
    expect(dome.settling).toBe(true);
    expect(dome.yaw).toBe(yaw);
    while (sources.domeModelBuildRef.current !== null) run(nextFrameMs(), 1 / 60, tokens, world, 1400, 860);
    expect(dome.spinArmed).toBe(true);
    expect(dome.yaw).toBeGreaterThan(yaw);
  });

  it("keeps the flat map under reduced motion until the layout is final, then shows it assembled", () => {
    const world = neuralWorld();
    const sources = stageSources("coupling", true);
    const run = createDomeFrameStage(sources);
    let heldFrames = 0;
    while (sources.domeRuntimeRef.current === null && heldFrames < 1000) {
      expect(run(nextFrameMs(), 1 / 60, tokens, world, 1400, 860)).toBe(true);
      heldFrames += 1;
    }
    expect(heldFrames).toBeGreaterThan(1);
    expect(sources.domeModelBuildRef.current).toBeNull();
    expect(sources.domeRuntimeRef.current!.rampClock).toBe(DOME_ASSEMBLE_TOTAL_MS);
    for (const [id, coord] of pureCloud(world).coords) expect(sources.domeRuntimeRef.current!.model.coords.get(id)).toEqual(coord);
  });

  it("morphs from the arrangement on screen toward the relaxing cloud on the switching frame", () => {
    const world = neuralWorld();
    const sources = stageSources("strata");
    const run = createDomeFrameStage(sources);
    run(nextFrameMs(), 1 / 60, tokens, world, 1400, 860);
    const strata = sources.domeRuntimeRef.current!.model;
    expect(strata.arrangement).toBe("strata");
    sources.mapArrangementRef.current = "coupling";
    sources.domeWorldSourceRef.current = null;
    expect(run(nextFrameMs(), 1 / 60, tokens, world, 1400, 860)).toBe(true);
    const dome = sources.domeRuntimeRef.current!;
    expect(dome.model.arrangement).toBe("coupling");
    expect(dome.morph?.fromCoords).toBe(strata.coords);
    expect(sources.domeModelBuildRef.current?.build.model).toBe(dome.model);
  });

  it("holds a fly-to while the layout settles and flies once it is final", () => {
    const world = neuralWorld();
    const sources = stageSources("coupling");
    const run = createDomeFrameStage(sources);
    run(nextFrameMs(), 1 / 60, tokens, world, 1400, 860);
    const dome = sources.domeRuntimeRef.current!;
    expect(dome.settling).toBe(true);
    dome.flyRequest = { slug: "c3" };
    run(nextFrameMs(), 1 / 60, tokens, world, 1400, 860);
    expect(dome.flyRequest).toEqual({ slug: "c3" });
    expect(dome.flight).toBeNull();
    while (sources.domeModelBuildRef.current !== null) run(nextFrameMs(), 1 / 60, tokens, world, 1400, 860);
    expect(dome.settling).toBe(false);
    expect(dome.flyRequest).toBeNull();
    expect(dome.flight?.slug).toBe("c3");
  });

  it("pauses the layout while 3D is off and resumes the same settle on return", () => {
    const world = neuralWorld();
    const sources = stageSources("coupling");
    const run = createDomeFrameStage(sources);
    run(nextFrameMs(), 1 / 60, tokens, world, 1400, 860);
    run(nextFrameMs(), 1 / 60, tokens, world, 1400, 860);
    const dome = sources.domeRuntimeRef.current!;
    const build = sources.domeModelBuildRef.current!.build;
    const held = new Map([...dome.model.coords].map(([id, coord]) => [id, { ...coord }]));
    sources.view3dRef.current = false;
    for (let frames = 0; frames < 200 && (frames < 5 || dome.rampClock > 0); frames += 1) {
      run(nextFrameMs(), 1 / 60, tokens, world, 1400, 860);
    }
    expect(dome.rampClock).toBe(0);
    expect(dome.model.coords).toEqual(held);
    expect(sources.domeModelBuildRef.current?.build).toBe(build);
    sources.view3dRef.current = true;
    while (sources.domeModelBuildRef.current !== null) {
      expect(sources.domeModelBuildRef.current.build).toBe(build);
      run(nextFrameMs(), 1 / 60, tokens, world, 1400, 860);
    }
    for (const [id, coord] of pureCloud(world).coords) expect(dome.model.coords.get(id)).toEqual(coord);
  });

  it("keeps its layout through a world rebuilt from the same concepts and relations", () => {
    const sources = stageSources("coupling");
    const run = createDomeFrameStage(sources);
    run(nextFrameMs(), 1 / 60, tokens, neuralWorld(), 1400, 860);
    const build = sources.domeModelBuildRef.current!.build;
    const rebuilt = neuralWorld();
    run(nextFrameMs(), 1 / 60, tokens, rebuilt, 1400, 860);
    expect(sources.domeModelBuildRef.current?.build).toBe(build);
    while (sources.domeModelBuildRef.current !== null) run(nextFrameMs(), 1 / 60, tokens, rebuilt, 1400, 860);
    const settled = sources.domeRuntimeRef.current!.model;
    const again = neuralWorld();
    run(nextFrameMs(), 1 / 60, tokens, again, 1400, 860);
    expect(sources.domeModelBuildRef.current).toBeNull();
    expect(sources.domeWorldSourceRef.current).toBe(again);
    expect(sources.domeRuntimeRef.current!.model).toBe(settled);
  });
});
