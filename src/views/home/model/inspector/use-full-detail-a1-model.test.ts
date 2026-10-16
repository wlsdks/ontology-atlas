import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesDomainPairs,
} from "@/widgets/ontology-map/model/containment-tree";
import { buildOntologyMapGraph } from "../../lib/map-canvas/map-adapter";
import type { UseFullDetailA1ModelArgs } from "./use-full-detail-a1-model";

/**
 * Locks the traversal count, not milliseconds: "closed means zero" holds on every machine, and
 * removing the `open` gate fails it.
 */

const groupsSpy = vi.fn(() => ({
  contains: { rows: [], total: 0 },
  usedBy: { rows: [], total: 0 },
  dependsOn: { rows: [], total: 0 },
  belongsTo: { rows: [], total: 0 },
}));
const reachSpy = vi.fn(() => ({ byDepth: {}, maxDepth: 3 }));
const codeLocationsSpy = vi.fn(() => [] as string[]);

vi.mock("@/widgets/full-detail-a1", () => ({
  buildFullDetailGroups: (...args: unknown[]) => groupsSpy(...(args as [])),
  buildFullDetailReachModel: (...args: unknown[]) => reachSpy(...(args as [])),
}));

vi.mock("@/entities/knowledge-graph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/entities/knowledge-graph")>();
  return {
    ...actual,
    deriveCodeLocations: (...args: unknown[]) => codeLocationsSpy(...(args as [])),
  };
});

const { useFullDetailA1Model } = await import("./use-full-detail-a1-model");

const stamp = new Date(0);

function node(id: string, extra: Partial<KnowledgeGraphNode> = {}): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind: "capability",
    projectIds: [],
    evidenceIds: [`${id}-doc`],
    lastApprovedAt: stamp,
    lastApprovedBy: "test",
    ...extra,
  };
}

const selected = node("capability:alpha");
const nodes: KnowledgeGraphNode[] = [selected, node("project:p", { kind: "project", title: "P" })];
const edges: KnowledgeGraphEdge[] = [];

const nodeFocus = {
  title: "alpha",
  displayTitle: "alpha",
  kind: "capability",
  sourceSlug: "capability-alpha",
  ownDocumentSlug: "capability-alpha",
  mentionedInSlug: null,
} as never;

// Stable references, as HomePage's real inputs are memoised.
const insight = { nodes, edges };
const changedSlugs: ReadonlySet<string> = new Set<string>();
const onSaveExplanation = () => undefined;

function render(open: boolean) {
  return renderHook(() =>
    useFullDetailA1Model({
      open,
      nodeFocus,
      selectedOntologyNode: selected,
      insight,
      changedSlugs,
      nodeBody: null,
      nodeEditTarget: null,
      vaultLoaded: false,
      onSaveExplanation,
      datasheet: null,
    }),
  );
}

describe("useFullDetailA1Model: a closed surface does not traverse the graph", () => {
  beforeEach(() => {
    groupsSpy.mockClear();
    reachSpy.mockClear();
    codeLocationsSpy.mockClear();
  });

  it("open=false gives a null model and zero graph traversals", () => {
    const { result } = render(false);
    expect(result.current).toBeNull();
    expect(groupsSpy).toHaveBeenCalledTimes(0);
    expect(reachSpy).toHaveBeenCalledTimes(0);
    expect(codeLocationsSpy).toHaveBeenCalledTimes(0);
  });

  it("open=true assembles the model from the same input with one traversal each", () => {
    const { result } = render(true);
    expect(result.current).not.toBeNull();
    expect(result.current?.node.id).toBe("capability:alpha");
    expect(result.current?.breadcrumb.projectTitle).toBe("P");
    expect(groupsSpy).toHaveBeenCalledTimes(1);
    expect(reachSpy).toHaveBeenCalledTimes(1);
    expect(codeLocationsSpy).toHaveBeenCalledTimes(1);
  });

  it("rerendering the same selection adds no traversal (memo contract)", () => {
    const { result, rerender } = render(true);
    rerender();
    rerender();
    expect(result.current).not.toBeNull();
    expect(groupsSpy).toHaveBeenCalledTimes(1);
    expect(reachSpy).toHaveBeenCalledTimes(1);
    expect(codeLocationsSpy).toHaveBeenCalledTimes(1);
  });

  it("updates reader state without rebuilding unchanged graph facts", () => {
    const initial: UseFullDetailA1ModelArgs = {
      open: true, nodeFocus, selectedOntologyNode: selected, insight, changedSlugs,
      nodeBody: null, nodeEditTarget: null, vaultLoaded: false, onSaveExplanation,
      datasheet: null,
    };
    const { result, rerender } = renderHook(useFullDetailA1Model, { initialProps: initial });
    const save = vi.fn();
    rerender({
      ...initial,
      nodeBody: { slug: "capability-alpha", raw: "Updated body", body: "Updated body" },
      nodeEditTarget: { vaultSlug: "capability-alpha" },
      vaultLoaded: true,
      onSaveExplanation: save,
    });
    expect(result.current?.bodyMarkdown).toBe("Updated body");
    expect(result.current?.explanationEdit?.onSave).toBe(save);
    expect(groupsSpy).toHaveBeenCalledTimes(1);
    expect(reachSpy).toHaveBeenCalledTimes(1);
    expect(codeLocationsSpy).toHaveBeenCalledTimes(1);

    rerender({ ...initial, changedSlugs: new Set([selected.id]) });
    expect(result.current?.node.fresh).toBe(true);
    expect(groupsSpy).toHaveBeenCalledTimes(2);
    expect(reachSpy).toHaveBeenCalledTimes(1);
    expect(codeLocationsSpy).toHaveBeenCalledTimes(1);

    const nextNodes = [...nodes, node("element:new")];
    rerender({ ...initial, insight: { nodes: nextNodes, edges } });
    expect(result.current?.breadcrumb.totalConcepts).toBe(3);
    expect(reachSpy).toHaveBeenCalledTimes(2);
    expect(codeLocationsSpy).toHaveBeenCalledTimes(2);

    rerender({ ...initial, open: false });
    expect(result.current).toBeNull();
    expect(reachSpy).toHaveBeenCalledTimes(2);
    expect(codeLocationsSpy).toHaveBeenCalledTimes(2);
  });
});

describe("useFullDetailA1Model: a domain's partners are the map's directed flows", () => {
  const link = (from: string, to: string, type: string): KnowledgeGraphEdge => ({ id: `${from}>${to}`, from, to, type, projectIds: [], evidenceIds: [], lastApprovedAt: stamp, lastApprovedBy: "test" });
  const graphNodes = [
    node("project:p", { kind: "project" }),
    ...["domain:meaning", "domain:agent", "domain:code"].map((id) => node(id, { kind: "domain" })),
    node("capability:graph"), node("capability:mcp"), node("capability:scan"),
    node("element:tool", { kind: "element" }),
    node("document:notes", { kind: "document" }),
  ];
  const graphEdges = [
    link("project:p", "domain:meaning", "contains"), link("project:p", "domain:agent", "contains"),
    link("project:p", "domain:code", "contains"), link("domain:meaning", "capability:graph", "contains"),
    link("domain:agent", "capability:mcp", "contains"), link("domain:code", "capability:scan", "contains"),
    link("capability:mcp", "element:tool", "contains"),
    link("capability:mcp", "capability:graph", "depends_on"), link("element:tool", "capability:graph", "depends_on"),
    link("capability:scan", "capability:graph", "depends_on"), link("capability:graph", "capability:scan", "depends_on"),
    link("document:notes", "capability:graph", "depends_on"),
  ];

  it("reads used-by and needs from the flows the dial draws", () => {
    const domain = graphNodes[1]!;
    const { result } = renderHook(() =>
      useFullDetailA1Model({
        open: true, nodeFocus, selectedOntologyNode: domain, insight: { nodes: graphNodes, edges: graphEdges },
        changedSlugs, nodeBody: null, nodeEditTarget: null, vaultLoaded: false, onSaveExplanation, datasheet: null,
      }),
    );
    const map = buildOntologyMapGraph(graphNodes, graphEdges);
    const tree = readContainmentTree(map.nodes, map.edges);
    const flows = rollDirectedDomainFlows(rollDomainDependencies(tree, map.edges), rollRelatesDomainPairs(tree, map.edges))
      .filter((flow) => flow.a === domain.id || flow.b === domain.id);
    const level = result.current?.groups.domainLevel;
    expect(flows.length).toBeGreaterThan(0);
    for (const flow of flows) {
      const partner = flow.a === domain.id ? flow.b : flow.a;
      const [incoming, outgoing] = flow.a === domain.id ? [flow.ba, flow.ab] : [flow.ab, flow.ba];
      expect(level?.usedBy.find((row) => row.id === partner)?.links ?? 0).toBe(incoming);
      expect(level?.needs.find((row) => row.id === partner)?.links ?? 0).toBe(outgoing);
    }
    expect(level?.usedBy.map((row) => row.links)).toEqual([2, 1]);
  });
});
