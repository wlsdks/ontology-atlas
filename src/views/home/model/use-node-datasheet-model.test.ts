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
});
