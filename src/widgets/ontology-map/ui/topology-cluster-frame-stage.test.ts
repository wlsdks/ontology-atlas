import { describe, expect, it } from "vitest";

import { DEFAULT_EXPAND } from "@/shared/lib/appearance-preferences";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import type { OntologyMapEdge, OntologyMapNode } from "./OntologyMap";
import { clusterBatchShownCount, createClusterFrameStage } from "./topology-cluster-frame-stage";
import type { RealmRuntimeData } from "./topology-realm-runtime";
import { buildTopologyWorld } from "./topology-world";

describe("clusterBatchShownCount", () => {
  it("lets expand-all reveal every ranked child instead of leaving a remainder chip", () => {
    expect(clusterBatchShownCount(26, "full", 1, 24)).toBe(26);
    expect(clusterBatchShownCount(53, "full", 2, 24)).toBe(53);
  });

  it("keeps ordinary spine expansion bounded by the revealed batch count", () => {
    expect(clusterBatchShownCount(26, "spine", undefined, 24)).toBe(24);
    expect(clusterBatchShownCount(53, "spine", 2, 24)).toBe(48);
  });
});

const worldTokens = {
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
  rippleStaggerMs: 12,
  rippleStaggerMaxMs: 180,
} as unknown as OntologyMapTokens;

function mapNode(id: string, kind: OntologyMapNode["kind"]): OntologyMapNode {
  return { id, kind, label: id, size: 1, x: 0, y: 0, isHub: false, ownerKey: null, recentlyUpdated: false, fullDegree: 0, descendantCount: 0 };
}

function mapEdge(source: string, target: string, kind: "contains" | "depends"): OntologyMapEdge {
  const relationType = kind === "contains" ? "contains" : "depends_on";
  return { source, target, relationType, relationQuality: null, evidenceCount: 0, kind, declaredBySlug: null };
}

/** A project over three domains, each over 20 capabilities (a folded parent), one of them over 30 elements. */
function crowdedWorld() {
  const nodes = [mapNode("p", "project")];
  const edges: OntologyMapEdge[] = [];
  for (let d = 0; d < 3; d += 1) {
    nodes.push(mapNode(`d${d}`, "domain"));
    edges.push(mapEdge("p", `d${d}`, "contains"));
    for (let c = 0; c < 20; c += 1) {
      nodes.push(mapNode(`d${d}c${c}`, "capability"));
      edges.push(mapEdge(`d${d}`, `d${d}c${c}`, "contains"));
      if (c > 0) edges.push(mapEdge(`d${d}c${c}`, `d${(d + 1) % 3}c${c - 1}`, "depends"));
    }
  }
  for (let e = 0; e < 30; e += 1) {
    nodes.push(mapNode(`d0c0e${e}`, "element"));
    edges.push(mapEdge("d0c0", `d0c0e${e}`, "contains"));
  }
  return buildTopologyWorld(nodes, edges, worldTokens);
}

function stageSources() {
  return {
    expandedParentsRef: { current: new Set<string>() as ReadonlySet<string> },
    overviewFitRef: { current: "spine" as "spine" | "full" },
    realmExpandChainRef: { current: null as { rootId: string; chain: ReadonlySet<string> } | null },
    realmDataRef: { current: null as RealmRuntimeData | null },
    focusedSlugRef: { current: null as string | null },
    expandPrefRef: { current: { ...DEFAULT_EXPAND, batchSize: 8 } },
    egoRevealBatchesRef: { current: 1 },
    clusterRevealBatchesRef: { current: new Map<string, number>() },
    prevBatchVisibleRef: { current: new Set<string>() },
    batchAppearRef: { current: new Map<string, number>() },
    batchAppearStartRef: { current: new Map<string, number>() },
  };
}

type Sources = ReturnType<typeof stageSources>;

function observed(frame: ReturnType<ReturnType<typeof createClusterFrameStage>>, sources: Sources) {
  return {
    effectiveExpanded: [...frame.effectiveExpanded].sort(),
    clusteredIds: [...frame.frameClusteredIds].sort(),
    chips: frame.frameChips.map((chip) => ({ ...chip, anchor: { ...chip.anchor } })),
    batchAppearVisible: [...frame.batchAppearVisible].sort(),
    prevBatchVisible: [...sources.prevBatchVisibleRef.current].sort(),
    batchAppear: [...sources.batchAppearRef.current].sort(),
    batchAppearStart: [...sources.batchAppearStartRef.current].sort(),
    revealBatches: [...sources.clusterRevealBatchesRef.current].sort(),
    realmChain: sources.realmExpandChainRef.current ? [...sources.realmExpandChainRef.current.chain].sort() : null,
  };
}

describe("cluster frame stage", () => {
  it("matches a stage that folds from scratch every frame while the graph moves and the fold inputs change", () => {
    const world = crowdedWorld();
    const kept = stageSources();
    const fresh = stageSources();
    const runKept = createClusterFrameStage(kept);
    const realm = { rootId: "d1", memberIds: new Set(["d1", ...Array.from({ length: 20 }, (_, c) => `d1c${c}`)]) } as unknown as RealmRuntimeData;
    const script: ((sources: Sources) => void)[] = [
      () => {},
      () => {},
      (s) => { s.focusedSlugRef.current = "d0"; },
      () => {},
      (s) => { s.egoRevealBatchesRef.current = 2; },
      (s) => { s.focusedSlugRef.current = null; s.expandedParentsRef.current = new Set(["d0", "d0c0"]); },
      () => {},
      (s) => { s.clusterRevealBatchesRef.current.set("d0c0", 2); },
      () => {},
      (s) => { s.overviewFitRef.current = "full"; },
      (s) => { s.overviewFitRef.current = "spine"; },
      (s) => { s.realmDataRef.current = realm; },
      () => {},
      (s) => { s.realmDataRef.current = null; },
      (s) => { s.expandedParentsRef.current = new Set(); },
      () => {},
    ];
    script.forEach((step, frame) => {
      step(kept);
      step(fresh);
      for (const node of world.nodes) {
        node.x += Math.cos(frame + node.x) * 3;
        node.y += Math.sin(frame + node.y) * 3;
      }
      const now = 1000 + frame * 16;
      const keptFrame = runKept(now, worldTokens, world);
      const freshFrame = createClusterFrameStage(fresh)(now, worldTokens, world);
      expect(observed(keptFrame, kept), `frame ${frame}`).toEqual(observed(freshFrame, fresh));
    });
  });
});
