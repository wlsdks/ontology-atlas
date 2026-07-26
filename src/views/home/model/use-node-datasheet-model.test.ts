import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgentActivityStatus } from "@/features/docs-vault-local";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { useNodeDatasheetModel } from "./use-node-datasheet-model";

/**
 * D7 회귀 가드 — 자기 `.md` 가 없는 개념(다른 문서의 관계 키에서 이름만
 * 불린 노드)의 팝오버 `문서` 버튼이 **그 개념을 인용한 남의 문서**를 열던
 * 결함. 사용자는 방금 연 개념의 글을 읽는다고 믿는데 다른 개념의 글이
 * 열리고, 비활성도 아니고 안내도 없었다.
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

function renderModel(selected: KnowledgeGraphNode, nodes: KnowledgeGraphNode[]) {
  const edges: KnowledgeGraphEdge[] = [];
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
    // QA 실측 재현: 이 요소 노드는 `frontmatter-to-ontology` 역량 문서가
    // 근거로 인용했을 뿐, 자기 `.md` 가 없다.
    const citedBy = "ontology/capabilities/frontmatter-to-ontology";
    const selected = node("element:derive-ontology-from-vault", [citedBy], {
      hasOwnDocument: false,
    });
    const model = renderModel(selected, [selected]);

    expect(model.v2DatasheetModel?.documentHref).toBeNull();
    // 정보는 없애지 않는다 — 목적지를 말하는 라벨로 쓰는 표면(컨텍스트 메뉴 ·
    // 전체 상세)이 쓸 수 있게 별도 필드로 남는다.
    expect(model.v2DatasheetModel?.mentionDocumentHref).toBe(
      `/docs/?slug=${encodeURIComponent(citedBy)}`,
    );
    // 근거 행은 그대로 남는다(팝오버가 이미 그 문서를 이름까지 붙여 보여준다).
    expect(model.v2DatasheetModel?.evidence.total).toBe(1);
  });

  it("`hasOwnDocument` 미지정 노드는 종전대로 자기 문서로 읽는다 (하위 호환)", () => {
    const selected = node("capability:legacy", ["capabilities/legacy"]);
    const model = renderModel(selected, [selected]);

    expect(model.v2DatasheetModel?.documentHref).toBe(
      "/docs/?slug=capabilities%2Flegacy",
    );
  });
});
