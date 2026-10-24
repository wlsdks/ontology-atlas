import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgentActivityStatus } from "@/entities/vault-session";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesDomainPairs,
} from "@/widgets/ontology-map/model/containment-tree";
import { buildOntologyMapGraph } from "../../lib/map-canvas/map-adapter";
import { useNodeDatasheetModel } from "./use-node-datasheet-model";

/** A concept without its own `.md` must not open another concept's document from its button. */

const stamp = new Date(0);
const NO_MAP = { nodes: [], edges: [] };

function node(
  id: string,
  evidenceIds: string[],
  extra: Partial<KnowledgeGraphNode> = {},
): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind: "element",
    projectIds: [],
    evidenceIds,
    lastApprovedAt: stamp,
    lastApprovedBy: "test",
    ...extra,
  };
}

const AGENT_ACTIVITY = {
  exists: false,
  valid: false,
  stale: false,
  ageMs: null,
  heartbeat: null,
} as unknown as AgentActivityStatus;

function renderModel(
  selected: KnowledgeGraphNode,
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[] = [],
) {
  return renderHook(() =>
    useNodeDatasheetModel({
      selectedOntologyNode: selected,
      insight: { nodes, edges },
      mapGraph: buildOntologyMapGraph(nodes, edges),
      handoffSource: "read-only-sample",
      authoredSignificance: null,
      docFreshnessIndex: new Map(),
      editBaselineScopeKey: "sample:test",
      updatedAgoNowMs: Date.parse("2026-07-26T00:00:00.000Z"),
      formatUpdatedLabel: (key) => key,
      agentActivityStatus: AGENT_ACTIVITY,
      agentFocusNodeId: null,
      selfEditTimestamps: new Map(),
      formatEditAgeLabel: (key) => key,
    }),
  ).result.current;
}

describe("useNodeDatasheetModel document link honesty", () => {
  it("a node with its own document links directly to its canonical Library document", () => {
    const selected = node("capability:frontmatter-to-ontology", [
      "ontology/capabilities/frontmatter-to-ontology",
    ]);
    const model = renderModel(selected, [selected]);

    // Pins which document the link targets; `ontology-node-href.test.ts` covers the `via` marker.
    expect(model.v2DatasheetModel?.documentHref).toBe(
      "/library/?tab=ontology&slug=ontology%2Fcapabilities%2Ffrontmatter-to-ontology" +
        "&via=topology%3Acapability%3Afrontmatter-to-ontology",
    );
    expect(model.v2DatasheetModel?.mentionDocumentHref).toBeNull();
  });

  it("a node without its own document does not present another document's href as its document link", () => {
    // An element cited only by the `frontmatter-to-ontology` capability document, with no `.md` of
    // its own.
    const citedBy = "ontology/capabilities/frontmatter-to-ontology";
    const selected = node("element:derive-ontology-from-vault", [citedBy], {
      hasOwnDocument: false,
    });
    const model = renderModel(selected, [selected]);

    expect(model.v2DatasheetModel?.documentHref).toBeNull();
    // Kept for the surfaces that label the destination (context menu, full detail).
    expect(model.v2DatasheetModel?.mentionDocumentHref).toBe(
      `/docs/?slug=${encodeURIComponent(citedBy)}` +
        "&via=topology%3Aelement%3Aderive-ontology-from-vault",
    );
    // The popover already names that document in its evidence row.
    expect(model.v2DatasheetModel?.evidence.total).toBe(1);
  });

  // Without the parent bucket a parent-only node showed "0 connections".
  it("a node with only a parent counts where it belongs and carries it in the handoff", () => {
    const parent = node("capability:frontmatter-to-ontology", [], { kind: "capability" });
    const selected = node("element:derive-ontology-from-vault", []);
    const model = renderModel(
      selected,
      [selected, parent],
      [
        {
          id: "e1",
          from: parent.id,
          to: selected.id,
          type: "contains",
          projectIds: [],
          evidenceIds: [],
          lastApprovedAt: stamp,
          lastApprovedBy: "test",
        },
      ],
    );

    expect(model.v2DatasheetModel?.metric.belongsTo).toBe(1);
    expect(model.v2DatasheetModel?.groups.belongsTo.total).toBe(1);
    expect(model.v2DatasheetModel?.handoffText).toContain("belongs_to: 1");
    expect(model.v2DatasheetModel?.handoffText).toContain(
      "belongs_to_names: capability:frontmatter-to-ontology",
    );
  });

  it("a node without `hasOwnDocument` reads as having its own document for backward compatibility", () => {
    const selected = node("capability:legacy", ["capabilities/legacy"]);
    const model = renderModel(selected, [selected]);

    expect(model.v2DatasheetModel?.documentHref).toBe(
      "/library/?tab=ontology&slug=capabilities%2Flegacy&via=topology%3Acapability%3Alegacy",
    );
  });

  it("same-node baseline survives a null reselect, while a new node starts a new baseline", () => {
    const alpha = node("capability:alpha", ["capabilities/alpha"]);
    const beta = node("capability:beta", ["capabilities/beta"]);
    const now = Date.parse("2026-07-26T00:00:00.000Z");
    function useModel(
      selected: KnowledgeGraphNode | null,
      freshness: ReadonlyMap<string, string>,
      editBaselineScopeKey: string | null,
    ) {
      return useNodeDatasheetModel({
        selectedOntologyNode: selected,
        insight: { nodes: [alpha, beta], edges: [] },
        mapGraph: NO_MAP,
        handoffSource: "read-only-sample",
        authoredSignificance: null,
        docFreshnessIndex: freshness,
        editBaselineScopeKey,
        updatedAgoNowMs: now,
        formatUpdatedLabel: (key) => key,
        agentActivityStatus: AGENT_ACTIVITY,
        agentFocusNodeId: null,
        selfEditTimestamps: new Map(),
        formatEditAgeLabel: (key) => key,
      });
    }
    const initial = new Map([["capabilities/alpha", "2026-07-01T00:00:00.000Z"]]);
    const changed = new Map([["capabilities/alpha", "2026-07-02T00:00:00.000Z"]]);
    const { result, rerender } = renderHook(
      ({
        selected,
        freshness,
        editBaselineScopeKey,
      }: {
        selected: KnowledgeGraphNode | null;
        freshness: ReadonlyMap<string, string>;
        editBaselineScopeKey: string | null;
      }) => useModel(selected, freshness, editBaselineScopeKey),
      {
        initialProps: {
          selected: alpha as KnowledgeGraphNode | null,
          freshness: initial,
          editBaselineScopeKey: "local:test" as string | null,
        },
      },
    );

    expect(result.current.v2DatasheetModel?.mtimeConflict).toBe(false);
    rerender({ selected: alpha, freshness: changed, editBaselineScopeKey: "local:test" });
    expect(result.current.v2DatasheetModel?.mtimeConflict).toBe(true);

    rerender({ selected: null, freshness: changed, editBaselineScopeKey: null });
    expect(result.current.v2DatasheetModel).toBeNull();
    rerender({ selected: alpha, freshness: changed, editBaselineScopeKey: "local:test" });
    expect(result.current.v2DatasheetModel?.mtimeConflict).toBe(true);

    rerender({
      selected: beta,
      freshness: new Map([["capabilities/beta", "2026-07-03T00:00:00.000Z"]]),
      editBaselineScopeKey: "local:test",
    });
    expect(result.current.v2DatasheetModel?.mtimeConflict).toBe(false);
  });

  it("does not let a self write already present at open hide a later external change", () => {
    const coupon = node("capability:coupon-issue", ["capabilities/coupon-issue"]);
    const sessionStartedAt = Date.parse("2026-08-24T00:00:00.000Z");
    const selfWriteBeforeOpen = Date.parse("2026-08-24T01:00:00.000Z");
    const selfEdits = new Map([["capabilities/coupon-issue", selfWriteBeforeOpen]]);
    function useModel(freshness: ReadonlyMap<string, string>) {
      return useNodeDatasheetModel({
        selectedOntologyNode: coupon,
        insight: { nodes: [coupon], edges: [] },
        mapGraph: NO_MAP,
        handoffSource: "loaded-vault",
        authoredSignificance: null,
        docFreshnessIndex: freshness,
        editBaselineScopeKey: "local:storefront",
        updatedAgoNowMs: sessionStartedAt,
        formatUpdatedLabel: (key) => key,
        agentActivityStatus: AGENT_ACTIVITY,
        agentFocusNodeId: null,
        selfEditTimestamps: selfEdits,
        formatEditAgeLabel: (key) => key,
      });
    }
    const initial = new Map([
      ["capabilities/coupon-issue", "2026-08-24T00:59:59.000Z"],
    ]);
    const externallyChanged = new Map([
      ["capabilities/coupon-issue", "2026-08-24T03:00:00.000Z"],
    ]);
    const { result, rerender } = renderHook(
      ({ freshness }: { freshness: ReadonlyMap<string, string> }) => useModel(freshness),
      { initialProps: { freshness: initial } },
    );

    expect(result.current.v2DatasheetModel?.mtimeConflict).toBe(false);
    rerender({ freshness: externallyChanged });

    expect(result.current.v2DatasheetModel?.mtimeConflict).toBe(true);
  });

  it("keeps the selected document clean when only a different document changes", () => {
    const coupon = node("capability:coupon-issue", ["capabilities/coupon-issue"]);
    const cart = node("element:cart-session", ["elements/cart-session"]);
    function useModel(freshness: ReadonlyMap<string, string>) {
      return useNodeDatasheetModel({
        selectedOntologyNode: coupon,
        insight: { nodes: [coupon, cart], edges: [] },
        mapGraph: NO_MAP,
        handoffSource: "loaded-vault",
        authoredSignificance: null,
        docFreshnessIndex: freshness,
        editBaselineScopeKey: "local:storefront",
        updatedAgoNowMs: Date.parse("2026-08-24T00:00:00.000Z"),
        formatUpdatedLabel: (key) => key,
        agentActivityStatus: AGENT_ACTIVITY,
        agentFocusNodeId: null,
        selfEditTimestamps: new Map(),
        formatEditAgeLabel: (key) => key,
      });
    }
    const initial = new Map([
      ["capabilities/coupon-issue", "2026-08-23T15:49:14.000Z"],
      ["elements/cart-session", "2026-08-23T15:49:14.000Z"],
    ]);
    const cartChanged = new Map([
      ["capabilities/coupon-issue", "2026-08-23T15:49:14.000Z"],
      ["elements/cart-session", "2026-08-23T16:12:11.417Z"],
    ]);
    const { result, rerender } = renderHook(
      ({ freshness }: { freshness: ReadonlyMap<string, string> }) => useModel(freshness),
      { initialProps: { freshness: initial } },
    );

    rerender({ freshness: cartChanged });

    expect(result.current.v2DatasheetModel?.mtimeConflict).toBe(false);
  });

  it("suppresses freshness drift explained by a self write after the panel opened", () => {
    const coupon = node("capability:coupon-issue", ["capabilities/coupon-issue"]);
    function useModel(
      freshness: ReadonlyMap<string, string>,
      selfEditTimestamps: ReadonlyMap<string, number>,
    ) {
      return useNodeDatasheetModel({
        selectedOntologyNode: coupon,
        insight: { nodes: [coupon], edges: [] },
        mapGraph: NO_MAP,
        handoffSource: "loaded-vault",
        authoredSignificance: null,
        docFreshnessIndex: freshness,
        editBaselineScopeKey: "local:storefront",
        updatedAgoNowMs: Date.parse("2026-08-24T00:00:00.000Z"),
        formatUpdatedLabel: (key) => key,
        agentActivityStatus: AGENT_ACTIVITY,
        agentFocusNodeId: null,
        selfEditTimestamps,
        formatEditAgeLabel: (key) => key,
      });
    }
    const initial = new Map([
      ["capabilities/coupon-issue", "2026-08-23T15:49:14.000Z"],
    ]);
    const selfWritten = new Map([
      ["capabilities/coupon-issue", "2026-08-24T02:00:00.000Z"],
    ]);
    const { result, rerender } = renderHook(
      ({
        freshness,
        selfEdits,
      }: {
        freshness: ReadonlyMap<string, string>;
        selfEdits: ReadonlyMap<string, number>;
      }) => useModel(freshness, selfEdits),
      { initialProps: { freshness: initial, selfEdits: new Map<string, number>() } },
    );

    rerender({
      freshness: selfWritten,
      selfEdits: new Map([
        ["capabilities/coupon-issue", Date.parse("2026-08-24T02:00:00.100Z")],
      ]),
    });

    expect(result.current.v2DatasheetModel?.mtimeConflict).toBe(false);
  });

  it("starts a fresh baseline when the same node id moves from the sample to a settled local vault", () => {
    const coupon = node("capability:coupon-issue", ["capabilities/coupon-issue"]);
    const now = Date.parse("2026-08-24T00:00:00.000Z");
    function useModel(
      selected: KnowledgeGraphNode | null,
      handoffSource: "loaded-vault" | "read-only-sample",
      freshness: ReadonlyMap<string, string>,
      editBaselineScopeKey: string | null,
    ) {
      return useNodeDatasheetModel({
        selectedOntologyNode: selected,
        insight: { nodes: [coupon], edges: [] },
        mapGraph: NO_MAP,
        handoffSource,
        authoredSignificance: null,
        docFreshnessIndex: freshness,
        editBaselineScopeKey,
        updatedAgoNowMs: now,
        formatUpdatedLabel: (key) => key,
        agentActivityStatus: AGENT_ACTIVITY,
        agentFocusNodeId: null,
        selfEditTimestamps: new Map(),
        formatEditAgeLabel: (key) => key,
      });
    }
    const sampleFreshness = new Map([["capabilities/coupon-issue", "2026-08-23"]]);
    const localFreshness = new Map([
      ["capabilities/coupon-issue", "2026-08-23T15:49:14.000Z"],
    ]);
    const { result, rerender } = renderHook(
      ({
        selected,
        source,
        freshness,
        editBaselineScopeKey,
      }: {
        selected: KnowledgeGraphNode | null;
        source: "loaded-vault" | "read-only-sample";
        freshness: ReadonlyMap<string, string>;
        editBaselineScopeKey: string | null;
      }) => useModel(selected, source, freshness, editBaselineScopeKey),
      {
        initialProps: {
          selected: coupon as KnowledgeGraphNode | null,
          source: "read-only-sample" as "loaded-vault" | "read-only-sample",
          freshness: sampleFreshness,
          editBaselineScopeKey: "sample:storefront" as string | null,
        },
      },
    );

    expect(result.current.v2DatasheetModel?.mtimeConflict).toBe(false);
    rerender({
      selected: null,
      source: "loaded-vault",
      freshness: localFreshness,
      editBaselineScopeKey: null,
    });
    rerender({
      selected: coupon,
      source: "loaded-vault",
      freshness: localFreshness,
      editBaselineScopeKey: "local:storefront",
    });

    expect(result.current.v2DatasheetModel?.mtimeConflict).toBe(false);
  });

  it("starts a fresh baseline when the same scoped node id resolves to a different source slug", () => {
    const firstSource = node("capability:coupon-issue", ["capabilities/coupon-issue"]);
    const secondSource = node("capability:coupon-issue", ["ontology/capabilities/coupon-issue"]);
    function useModel(
      selected: KnowledgeGraphNode,
      freshness: ReadonlyMap<string, string>,
    ) {
      return useNodeDatasheetModel({
        selectedOntologyNode: selected,
        insight: { nodes: [selected], edges: [] },
        mapGraph: NO_MAP,
        handoffSource: "loaded-vault",
        authoredSignificance: null,
        docFreshnessIndex: freshness,
        editBaselineScopeKey: "local:storefront",
        updatedAgoNowMs: Date.parse("2026-08-24T00:00:00.000Z"),
        formatUpdatedLabel: (key) => key,
        agentActivityStatus: AGENT_ACTIVITY,
        agentFocusNodeId: null,
        selfEditTimestamps: new Map(),
        formatEditAgeLabel: (key) => key,
      });
    }
    const { result, rerender } = renderHook(
      ({
        selected,
        freshness,
      }: {
        selected: KnowledgeGraphNode;
        freshness: ReadonlyMap<string, string>;
      }) => useModel(selected, freshness),
      {
        initialProps: {
          selected: firstSource,
          freshness: new Map([
            ["capabilities/coupon-issue", "2026-08-23T15:49:14.000Z"],
          ]),
        },
      },
    );

    rerender({
      selected: secondSource,
      freshness: new Map([
        ["ontology/capabilities/coupon-issue", "2026-08-24T01:00:00.000Z"],
      ]),
    });

    expect(result.current.v2DatasheetModel?.mtimeConflict).toBe(false);
  });
});

describe("useNodeDatasheetModel relations read as the map draws them", () => {
  const link = (from: string, to: string, type: string): KnowledgeGraphEdge => ({
    id: `${from}>${to}`, from, to, type, projectIds: [], evidenceIds: [], lastApprovedAt: stamp, lastApprovedBy: "test",
  });
  const graphNodes = [
    node("project:p", [], { kind: "project" }),
    ...["domain:meaning", "domain:agent", "domain:code"].map((id) => node(id, [], { kind: "domain" })),
    ...["capability:graph", "capability:mcp", "capability:scan"].map((id) => node(id, [], { kind: "capability" })),
    node("element:tool", []),
  ];
  const graphEdges = [
    link("project:p", "domain:meaning", "contains"), link("project:p", "domain:agent", "contains"),
    link("project:p", "domain:code", "contains"), link("domain:meaning", "capability:graph", "contains"),
    link("domain:agent", "capability:mcp", "contains"), link("domain:code", "capability:scan", "contains"),
    link("capability:mcp", "element:tool", "contains"),
    link("capability:mcp", "capability:graph", "depends_on"), link("element:tool", "capability:graph", "depends_on"),
    link("capability:scan", "capability:graph", "depends_on"), link("capability:graph", "capability:scan", "depends_on"),
    link("domain:meaning", "domain:code", "related_to"), link("domain:agent", "domain:meaning", "related_to"),
  ];
  const domain = graphNodes[1]!;

  it("gives a domain its partners from the flows the dial draws", () => {
    const usage = renderModel(domain, graphNodes, graphEdges).v2DatasheetModel?.domainUsage;
    const map = buildOntologyMapGraph(graphNodes, graphEdges);
    const tree = readContainmentTree(map.nodes, map.edges);
    const flows = rollDirectedDomainFlows(rollDomainDependencies(tree, map.edges), rollRelatesDomainPairs(tree, map.edges))
      .filter((flow) => flow.a === domain.id || flow.b === domain.id);
    expect(flows.length).toBeGreaterThan(0);
    for (const flow of flows) {
      const partner = flow.a === domain.id ? flow.b : flow.a;
      const [incoming, outgoing] = flow.a === domain.id ? [flow.ba, flow.ab] : [flow.ab, flow.ba];
      expect(usage?.usedBy.find((row) => row.domainId === partner)?.links ?? 0).toBe(incoming);
      expect(usage?.needs.find((row) => row.domainId === partner)?.links ?? 0).toBe(outgoing);
    }
    expect(usage?.usedBy.map((row) => row.links)).toEqual([2, 1]);
  });

  it("keeps a domain-level reading off every other kind", () => {
    expect(renderModel(graphNodes[4]!, graphNodes, graphEdges).v2DatasheetModel?.domainUsage).toBeNull();
  });

  it("lists `relates` either way as related, never as used by or leaned on", () => {
    const model = renderModel(domain, graphNodes, graphEdges).v2DatasheetModel;
    expect(model?.groups.related.rows.map((row) => row.id)).toEqual(["domain:code", "domain:agent"]);
    expect(model?.groups.usedBy.total).toBe(0);
    expect(model?.groups.dependsOn.total).toBe(0);
    expect(model?.handoffText).toContain("related: 2");
    expect(model?.handoffText).toContain("depends_on: 0");
  });

  it("hands an agent the same partners the panel lists", () => {
    const text = renderModel(domain, graphNodes, graphEdges).v2DatasheetModel?.handoffText ?? "";
    expect(text).toContain("used_by_domains: domain:agent (2), domain:code (1)");
    expect(text).toContain("needs_domains: domain:code (1)");
    expect(renderModel(graphNodes[4]!, graphNodes, graphEdges).v2DatasheetModel?.handoffText).not.toContain("used_by_domains");
  });
});
