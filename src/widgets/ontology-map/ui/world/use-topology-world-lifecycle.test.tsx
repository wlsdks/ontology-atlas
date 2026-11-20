import { renderHook } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { DialMemory } from "../../dial/types";
import { isTierAssembling } from "../../morph/tier-assembly";
import type { FlatRingMemoryStore } from "../loop/topology-loop-contract";
import type { TopologyWorld } from "./topology-world";
import { useTopologyWorldLifecycle } from "./use-topology-world-lifecycle";

const builds = vi.hoisted(() => ({ worlds: new Map<unknown, unknown>(), pending: [] as (() => void)[] }));
vi.mock("../../tokens/topology-read-tokens", () => ({ readOntologyMapTokensOrNull: () => ({ hysteresisPx: 4, cameraSpringAngFreqTransition: 1 }) }));
vi.mock("./topology-world", async (original) => ({
  ...(await original<typeof import("./topology-world")>()),
  buildTopologyWorldSteps: function* (nodes: unknown) {
    yield;
    return builds.worlds.get(nodes);
  },
}));
// Every build spans more than one slice: it finishes only when the test hands the browser a turn.
vi.mock("./run-steps-sliced", () => ({
  runStepsSliced: (steps: Generator<void, unknown>, onDone: (world: unknown) => void) => {
    let cancelled = false;
    builds.pending.push(() => {
      if (cancelled) return;
      let step = steps.next();
      while (!step.done) step = steps.next();
      onDone(step.value);
    });
    return () => {
      cancelled = true;
    };
  },
}));

const ref = <T,>(current: T) => ({ current });
function turn() {
  const ready = builds.pending.splice(0);
  for (const run of ready) run();
}
function worldOf(memory: DialMemory) {
  const nodes = [{ id: "a", kind: "domain", x: 0, y: 0, homeX: 0, homeY: 0, parentId: null }];
  const bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return {
    nodes, nodeById: new Map(nodes.map((n) => [n.id, n])), edges: [], bounds, spineBounds: bounds,
    dial: { model: {}, scene: { memory, graph: null } },
  } as unknown as TopologyWorld;
}
function storeOf(): FlatRingMemoryStore & { written: DialMemory[] } {
  const written: DialMemory[] = [];
  return { written, current: () => null, write: (memory) => void written.push(memory) };
}

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false })) as unknown as typeof window.matchMedia;
});

describe("useTopologyWorldLifecycle with a build spanning several slices", () => {
  it("names the new folder's world, not the one still drawn, when concepts and key arrive together", () => {
    const sampleMemory = { ring: "sample" } as unknown as DialMemory;
    const folderMemory = { ring: "folder" } as unknown as DialMemory;
    const sampleNodes: never[] = [];
    const folderNodes: never[] = [];
    const sample = worldOf(sampleMemory);
    const folder = worldOf(folderMemory);
    builds.worlds.set(sampleNodes, sample);
    builds.worlds.set(folderNodes, folder);
    const worldRef = ref<TopologyWorld | null>(null);
    const fixed = {
      worldRef, viewportRef: ref({ width: 0, height: 0, dpr: 1 }), cameraRef: ref(null), overviewFitRef: ref("full"),
      expandedParentsRef: ref(new Set()), clusteredIdsRef: ref(new Set()), cameraTokens: (t: unknown) => t, cameraTargetRef: ref(null),
      userDrivenCameraRef: ref(false), hasInitializedRef: ref(false), domeRuntimeRef: ref(null), overviewScaleRef: ref(1),
      cameraAngularFreqRef: ref(null), pendingSpotlightFitRef: ref(false), runSpotlightFitRef: ref(null), containerRef: ref(null),
      expand: { structure: "disc" }, prevNodeIdsRef: ref(new Set()), appearRef: ref(new Map()), bornNodeIdsRef: ref(new Set()),
      hasDependsEdgesRef: ref(false), hasContainsEdgesRef: ref(false), lastActiveMsRef: ref(0), pulsesRef: ref([]), simRef: ref(null),
      nodeDragRef: ref(null), heatRef: ref(0), dragAffectedSetRef: ref(null), dragStartPosRef: ref(null), dragTugOffsetsRef: ref(new Map()),
      homeSpringsRef: ref(new Map()), homingActiveRef: ref(false), homeTargetOverrideRef: ref(null), prevPinnedNodeIdRef: ref(null),
      assembleOnOpen: true, arrivingDocuments: 0, fittedDataSourceKeyRef: ref(null), pendingFlatCameraRef: ref(null),
      dialLabels: null, loadProgress: null, placingTierRead: false,
    };
    const folderStore = storeOf();
    const hook = renderHook((live: { nodes: never[]; dataSourceKey: string | null; flatRingMemory: FlatRingMemoryStore }) => {
      useTopologyWorldLifecycle({ ...fixed, ...live, edges: [] } as unknown as Parameters<typeof useTopologyWorldLifecycle>[0]);
    }, { initialProps: { nodes: sampleNodes, dataSourceKey: null as string | null, flatRingMemory: storeOf() } });
    turn();
    expect(worldRef.current).toBe(sample);

    hook.rerender({ nodes: folderNodes, dataSourceKey: "lifecycle-test-folder", flatRingMemory: folderStore });
    expect(worldRef.current).toBe(sample);
    expect(folderStore.written).toEqual([]);
    turn();

    expect(worldRef.current).toBe(folder);
    expect(isTierAssembling(folder)).toBe(true);
    expect(folderStore.written).not.toContain(sampleMemory);
    hook.unmount();
  });
});
