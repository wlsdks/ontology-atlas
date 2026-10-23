import type { KnowledgeProjectInsight } from "@/entities/knowledge-graph";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useTopologyGraphProjection } from "../use-topology-graph-projection";
const empty = new Set<string>();
const base = { projects: [], localGraphRoot: null, insight: { nodes: [], edges: [] } as unknown as KnowledgeProjectInsight, spotlightOn: false, recentNodeIds: empty, changedSlugs: empty, dustySlugs: empty,
  selectedProject: null, selectedOntologyNodeId: null, selectedSlug: "synth-cap-0", deeplinkSourceReady: true, projectsLoaded: true, realmSlug: "synth-domain-0" };
afterEach(() => window.history.replaceState(null, "", "/"));
describe("synthetic map interaction projection", () => {
  it("resolves selected members and scope against the explicitly requested synthetic graph", () => {
    window.history.replaceState(null, "", "/?synth=2000");
    const { result } = renderHook(() => useTopologyGraphProjection(base));
    expect(result.current.canvasSelectedSlug).toBe("synth-cap-0");
    expect(result.current.canvasSelectedGraphNode?.kind).toBe("capability");
    expect(result.current.resolvedRealmSlug).toBe("synth-domain-0");
    expect(result.current.ontologyMapGraph.nodes.some(n => n.id === result.current.canvasSelectedSlug)).toBe(true);
  });
  it("rejects synthetic and unknown addresses outside their requested projection", () => {
    const normal = renderHook(() => useTopologyGraphProjection(base));
    expect(normal.result.current.canvasSelectedSlug).toBeNull();
    expect(normal.result.current.resolvedRealmSlug).toBeNull();
    normal.unmount();
    window.history.replaceState(null, "", "/?synth=2000");
    const missing = renderHook(() => useTopologyGraphProjection({ ...base, selectedSlug: "not-in-graph", realmSlug: "not-in-graph" }));
    expect(missing.result.current.canvasSelectedSlug).toBeNull();
    expect(missing.result.current.resolvedRealmSlug).toBeNull();
  });
});
