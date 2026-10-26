import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_REALM_TRANSITION_STATE } from "../../../model/realm/realm-transition";
import type { OntologyMapTokens } from "../../../tokens/read-map-tokens";
import { createWorldMotionFrameStage, type WorldMotionFrameStageSources } from "../../frame-loop/topology-world-motion-frame-stage";
import { createRealmFrameStage, type RealmFrameStageSources } from "../../frame-loop/topology-realm-frame-stage";
import type { RealmRuntimeData } from "../topology-realm-runtime";
import type { TopologyWorld, WorldNode } from "../topology-world";
import { useTopologyRealmTransition } from "../use-topology-realm-transition";

const mocks = vi.hoisted(() => ({ build: vi.fn(), now: 0 }));
vi.mock("../topology-realm-runtime", async original => ({
  ...await original<typeof import("../topology-realm-runtime")>(),
  buildRealmRuntimeData: mocks.build,
  realmCameraTarget: () => ({ tx: 0, ty: 0, tscale: 1 }),
}));
vi.mock("../../../tokens/topology-read-tokens", () => ({ readOntologyMapTokensOrNull: () => ({}) }));
vi.mock("../../../dial/tokens", () => ({ readDialTokens: () => ({}) }));
vi.mock("../../../dial/fit", async original => ({
  ...await original<typeof import("../../../dial/fit")>(), createMeasureText: () => (() => 1),
}));
vi.mock("../topology-world", async original => ({
  ...await original<typeof import("../topology-world")>(), recomputeWorldGeometry: vi.fn(),
}));
vi.mock("../../camera/topology-camera-math", async original => ({
  ...await original<typeof import("../../camera/topology-camera-math")>(),
  computeOverviewFitScale: () => 1, computeOverviewCameraTarget: () => ({ tx: 0, ty: 0, tscale: 1 }),
}));

const ref = <T,>(current: T) => ({ current });
const tokens = { radiusProject: 20, radiusDomain: 14, radiusCapability: 8, radiusElement: 5 } as OntologyMapTokens;
function fixture(reducedMotion = false) {
  const nodes = [
    { id: "root", kind: "domain", x: 120, y: 40, homeX: 120, homeY: 40 },
    { id: "outside", kind: "domain", x: 600, y: 180, homeX: 600, homeY: 180 },
  ].map(n => ({ ...n, label: n.id, parentId: null, magnitudeScale: 1 })) as WorldNode[];
  const world = {
    nodes, nodeById: new Map(nodes.map(n => [n.id, n])), edges: [], childrenByParent: new Map(),
    clusterMetaByParent: new Map(), neighborMap: new Map(), spineBounds: { minX: 0, maxX: 600, minY: 0, maxY: 180 },
  } as unknown as TopologyWorld;
  mocks.build.mockImplementation((_world, rootId, _tokens, _expanded, dial) => ({
    rootId, flat: !!dial, memberIds: new Set(["root"]), outsideIds: new Set(["outside"]),
    insideTargets: new Map([["root", { x: 0, y: 0 }]]),
    insideFrom: new Map([["root", { x: nodes[0].x, y: nodes[0].y }]]),
    outsideFrom: new Map([["outside", { x: nodes[1].x, y: nodes[1].y }]]),
    flingCenter: { x: 120, y: 40 }, wardingCenter: { x: 0, y: 0 }, wardingRadius: 100,
    bounds: { minX: -100, maxX: 100, minY: -100, maxY: 100 }, entryCamera: null,
    depthById: new Map([["root", 0]]), tierKindById: new Map([["root", "domain"]]),
  } satisfies RealmRuntimeData));
  const sources = {
    realmRootId: "root" as string | null, prevRealmRootIdRef: ref<string | null>(null), lastActiveMsRef: ref(0),
    worldRef: ref(world), viewportRef: ref({ width: 1200, height: 800, dpr: 1 }), reducedMotionRef: ref(reducedMotion),
    nodeDragRef: ref(null), heatRef: ref(0), dragAffectedSetRef: ref(null), dragStartPosRef: ref(null), dragTugOffsetsRef: ref(new Map()),
    realmActiveHandedOffRef: ref(false), expandedParentsRef: ref(new Set<string>()), realmDataRef: ref<RealmRuntimeData | null>(null), wardingFitRef: ref(null),
    realmTransitionRef: ref({ ...INITIAL_REALM_TRANSITION_STATE }), homingActiveRef: ref(false), homeSpringsRef: ref(new Map()), homeTargetOverrideRef: ref(null),
    hasInitializedRef: ref(true), cameraRef: ref({ x: { value: 91 }, y: { value: 82 }, scale: { value: 0.9 } }),
    dampingRef: ref(0), cameraTargetRef: ref({ tx: 91, ty: 82, tscale: 0.9 }), userDrivenCameraRef: ref(false),
    cameraAngularFreqRef: ref(null), beginCameraTween: vi.fn(), simRef: ref(null), overviewFitRef: ref("full"), clusteredIdsRef: ref(new Set()), overviewScaleRef: ref(1),
    dragVelRef: ref({ x: 0, y: 0 }), dragPrevPosRef: ref(null), dropSeededRef: ref(false),
    geomPrevXRef: ref(null), geomPrevYRef: ref(null), sepDisplacedIdsRef: ref(new Set()), prevPinnedNodeIdRef: ref(null),
    view3dRef: ref(false), domeRuntimeRef: ref(null), realmParallaxRef: ref(null), realmEnterButtonElRef: ref(null),
    focusedSlugRef: ref(null), onEnterRealmRef: ref(undefined), realmEnterTargetRef: ref(null), getRealmCaption: () => null,
  };
  const step = createWorldMotionFrameStage(sources as unknown as WorldMotionFrameStageSources);
  const paint = createRealmFrameStage(sources as unknown as RealmFrameStageSources);
  const hook = renderHook(({ root, mode }) => {
    sources.view3dRef.current = mode;
    useTopologyRealmTransition({ ...sources, realmRootId: root, view3d: mode } as unknown as Parameters<typeof useTopologyRealmTransition>[0]);
  }, { initialProps: { root: "root" as string | null, mode: false } });
  return {
    hook, sources, nodes,
    step: (now: number) => { mocks.now = now; step(now, 1 / 60, tokens, sources.worldRef.current, 1200, 800); },
    paint: (now: number) => paint(now, 1 / 60, tokens, sources.worldRef.current, sources.cameraRef.current as never, 1200, 800, new Set(), new Set(), []),
  };
}

beforeEach(() => {
  mocks.now = 0;
  mocks.build.mockReset();
  vi.spyOn(performance, "now").mockImplementation(() => mocks.now);
});
afterEach(() => vi.restoreAllMocks());

describe("interruptible realm entry", () => {
  it.each([100, 600])("returns from the live coordinates when entry is cancelled at %i ms", elapsed => {
    const f = fixture();
    f.step(elapsed);
    const live = f.nodes.map(n => ({ x: n.x, y: n.y }));
    f.hook.rerender({ root: null, mode: false });
    f.step(elapsed);
    expect(f.nodes.map(n => ({ x: n.x, y: n.y }))).toEqual(live);
    expect(f.paint(elapsed).realmOutsideReturnAlphaById?.get("outside")).toBe(elapsed < 420 ? 1 : 0);
    f.step(elapsed + 660);
    expect(f.nodes.map(n => ({ x: n.x, y: n.y }))).toEqual([{ x: 120, y: 40 }, { x: 600, y: 180 }]);
  });

  it("returns to the saved positions even when the next frame skips the entire exit", () => {
    const f = fixture();
    f.step(600);
    f.hook.rerender({ root: null, mode: false });
    f.step(1500);
    expect(f.nodes.map(n => ({ x: n.x, y: n.y }))).toEqual([{ x: 120, y: 40 }, { x: 600, y: 180 }]);
    expect(f.sources.realmDataRef.current).toBeNull();
  });

  it("rebuilds the same root for both modes and returns to the original camera and coordinates", () => {
    const f = fixture();
    f.step(1200);
    f.sources.cameraRef.current.x.value = 12;
    f.sources.cameraRef.current.y.value = 34;
    f.hook.rerender({ root: "root", mode: true });
    expect(f.sources.realmDataRef.current?.flat).toBe(false);
    expect(f.sources.realmDataRef.current?.entryCamera).toEqual({ tx: 91, ty: 82, tscale: 0.9 });
    f.hook.rerender({ root: "root", mode: false });
    expect(f.sources.realmDataRef.current?.flat).toBe(true);
    f.hook.rerender({ root: null, mode: false });
    expect(f.sources.cameraTargetRef.current).toEqual({ tx: 91, ty: 82, tscale: 0.9 });
    f.step(2200);
    expect(f.nodes.map(n => ({ x: n.x, y: n.y }))).toEqual([{ x: 120, y: 40 }, { x: 600, y: 180 }]);
  });

  it("does not flash an undrawn ward when a 3D entry is cancelled", () => {
    const f = fixture();
    f.hook.rerender({ root: "root", mode: true });
    f.step(100);
    expect(f.paint(100).realmWarding?.drawProgress).toBe(0);
    f.hook.rerender({ root: null, mode: true });
    expect(f.paint(100).realmWarding?.drawProgress).toBe(0);
  });

  it("keeps a reduced-motion realm aligned when its world is rebuilt", () => {
    const f = fixture(true);
    f.step(0);
    const previous = f.sources.worldRef.current;
    const nodes = previous.nodes.map(node => ({ ...node, x: node.homeX, y: node.homeY }));
    f.sources.worldRef.current = { ...previous, nodes, nodeById: new Map(nodes.map(node => [node.id, node])) };
    f.hook.rerender({ root: "root", mode: false });
    f.step(1);
    expect(nodes.find(node => node.id === "root")).toMatchObject({ x: 0, y: 0 });
    expect(f.sources.cameraTargetRef.current).toEqual({ tx: 0, ty: 0, tscale: 1 });
    f.hook.rerender({ root: null, mode: false });
    f.step(2);
    expect(nodes.map(node => ({ x: node.x, y: node.y }))).toEqual([{ x: 120, y: 40 }, { x: 600, y: 180 }]);
  });

  it("preserves a dragged realm member through a render without a world rebuild", () => {
    const f = fixture(true);
    f.step(0);
    f.nodes[0].x = 24;
    f.hook.rerender({ root: "root", mode: false });
    f.step(1);
    expect(f.nodes[0].x).toBe(24);
  });

  it("snaps both entry and exit under reduced motion", () => {
    const f = fixture(true);
    f.step(0);
    expect(f.nodes[0].x).toBe(0);
    f.hook.rerender({ root: null, mode: false });
    f.step(0);
    expect(f.sources.realmTransitionRef.current.phase).toBe("idle");
    expect(f.nodes.map(n => ({ x: n.x, y: n.y }))).toEqual([{ x: 120, y: 40 }, { x: 600, y: 180 }]);
  });
});
