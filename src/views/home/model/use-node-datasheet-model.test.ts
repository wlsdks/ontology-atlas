import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgentActivityStatus } from "@/features/docs-vault-local";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { useNodeDatasheetModel } from "./use-node-datasheet-model";

/**
 * Regression guard: for a concept with no `.md` of its own — one merely named
 * in another document's relation key — the popover's document button opened
 * **somebody else's document citing it**. The user believed they were reading
 * about the concept they just opened, another concept's write-up appeared, and
 * the button was neither disabled nor explained.
 */

const stamp = new Date(0);

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

describe("useNodeDatasheetModel — 문서 링크 정직성", () => {
  it("자기 문서가 있는 노드는 자기 문서 링크를 낸다", () => {
    const selected = node("capability:frontmatter-to-ontology", [
      "ontology/capabilities/frontmatter-to-ontology",
    ]);
    const model = renderModel(selected, [selected]);

    expect(model.v2DatasheetModel?.documentHref).toBe(
      "/docs/?slug=ontology%2Fcapabilities%2Ffrontmatter-to-ontology",
    );
    expect(model.v2DatasheetModel?.mentionDocumentHref).toBeNull();
  });

  it("자기 문서가 없는 노드는 남의 문서 href 를 '문서' 링크로 내지 않는다", () => {
    // Reproduces the QA finding: this element node is only cited as evidence by
    // the `frontmatter-to-ontology` capability document and has no `.md` of its own.
    const citedBy = "ontology/capabilities/frontmatter-to-ontology";
    const selected = node("element:derive-ontology-from-vault", [citedBy], {
      hasOwnDocument: false,
    });
    const model = renderModel(selected, [selected]);

    expect(model.v2DatasheetModel?.documentHref).toBeNull();
    // The information is not discarded: it stays in a separate field for the
    // surfaces that label the destination (context menu, full detail).
    expect(model.v2DatasheetModel?.mentionDocumentHref).toBe(
      `/docs/?slug=${encodeURIComponent(citedBy)}`,
    );
    // The evidence row remains — the popover already shows that document by name.
    expect(model.v2DatasheetModel?.evidence.total).toBe(1);
  });

  // Scope correction (2026-07-26): without counting the parent bucket, a node
  // that has only a parent showed "0 connections" in both the popover and the
  // handoff. This locks that the model carries that bucket all the way through.
  it("부모만 있는 노드도 속한 곳을 세고 핸드오프에 싣는다", () => {
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

  it("`hasOwnDocument` 미지정 노드는 종전대로 자기 문서로 읽는다 (하위 호환)", () => {
    const selected = node("capability:legacy", ["capabilities/legacy"]);
    const model = renderModel(selected, [selected]);

    expect(model.v2DatasheetModel?.documentHref).toBe(
      "/docs/?slug=capabilities%2Flegacy",
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
