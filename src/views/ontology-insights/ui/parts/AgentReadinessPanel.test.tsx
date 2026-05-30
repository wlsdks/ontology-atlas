import { describe, expect, it } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../../messages/ko.json";
import { AgentReadinessPanel } from "./AgentReadinessPanel";
import { buildAgentReadinessSummary } from "@/shared/lib/ontology-tree";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/entities/knowledge-graph";

function node(id: string, kind: string): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "t",
  };
}

function edge(from: string, to: string): KnowledgeGraphEdge {
  return {
    id: `${from}-${to}`,
    from,
    to,
    type: "relates",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "t",
  };
}

function renderPanel(summary: ReturnType<typeof buildAgentReadinessSummary>) {
  return rtlRender(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <AgentReadinessPanel
        summary={summary}
        status={summary.status}
        score={summary.score}
        meaningfulNodes={summary.meaningfulNodes}
        relationCount={summary.relationCount}
        orphanCount={summary.orphanCount}
        unknownNodes={summary.unknownNodes}
        hubCount={summary.hubCount}
        averageDegree={summary.averageDegree}
        actionKeys={summary.actionKeys}
      />
    </NextIntlClientProvider>,
  );
}

describe("AgentReadinessPanel — CLI fallback 명령 silent cap 없음", () => {
  it("issue-specific 명령(baseline 8 뒤)도 표시 — orphans 있으면 find_orphans CLI 노출", () => {
    // orphans 존재 → actionKeys 에 linkOrphans → find_orphans 명령이 baseline 8개
    // 뒤(index ≥8)에 append 된다. 그런데 copy 버튼은 *전체* 를 복사하므로, 표시도
    // 전체여야 일관 (display ≠ copy 는 silent cap — iter 13 원칙 위반).
    const nodes = [
      node("a", "capability"),
      node("b", "capability"),
      node("c", "capability"),
      node("orphan", "element"),
    ];
    const edges = [edge("a", "b")];
    const summary = buildAgentReadinessSummary(nodes, edges, {
      orphans: [node("orphan", "element")],
    });
    // 테스트 전제: orphans 가 linkOrphans actionKey 를 만들어야 유효
    expect(summary.actionKeys).toContain("linkOrphans");

    renderPanel(summary);

    // baseline 8개 뒤에 오는 issue-specific 명령이 잘리지 않고 표시되어야 한다.
    expect(screen.getByText(/oh-my-ontology orphans/)).toBeInTheDocument();
  });
});
