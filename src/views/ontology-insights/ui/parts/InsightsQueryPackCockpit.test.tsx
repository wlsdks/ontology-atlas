import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import koMessages from "../../../../../messages/ko.json";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import {
  buildAgentGraphDbQueryPack,
  buildAgentReadinessSummary,
} from "@/shared/lib/ontology-tree";
import { TooltipProvider } from "@/shared/ui";
import { InsightsQueryPackCockpit } from "./InsightsQueryPackCockpit";

function node(id: string, kind: string): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
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
    lastApprovedBy: "test",
  };
}

function renderCockpit() {
  const nodes = [
    node("project:atlas", "project"),
    node("domain:agent", "domain"),
    node("capability:mcp", "capability"),
  ];
  const edges = [
    edge("project:atlas", "domain:agent"),
    edge("domain:agent", "capability:mcp"),
  ];
  const readiness = buildAgentReadinessSummary(nodes, edges, {
    orphans: [],
  });
  const graphDbQueryPack = buildAgentGraphDbQueryPack([
    { slug: "capability:mcp", title: "MCP", kind: "capability", degree: 2 },
    { slug: "domain:agent", title: "Agent", kind: "domain", degree: 2 },
  ]);

  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <TooltipProvider>
        <InsightsQueryPackCockpit
          graphDbQueryPack={graphDbQueryPack}
          readiness={readiness}
        />
      </TooltipProvider>
    </NextIntlClientProvider>,
  );
}

describe("InsightsQueryPackCockpit", () => {
  it("상태/실행 순서/결과 기준 정보를 탭으로 나눠 첫 화면 밀도를 낮춘다", () => {
    renderCockpit();

    const tablist = screen.getByRole("tablist", { name: "그래프 검증 섹션" });
    expect(within(tablist).getByRole("tab", { name: "상태" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const summary = screen.getByLabelText("그래프 검증 요약");
    expect(summary).toHaveTextContent("준비도");
    expect(summary).toHaveTextContent("검사 묶음");
    expect(summary).toHaveTextContent("MCP");
    expect(summary).toHaveTextContent("CLI 대체");
    expect(within(summary).queryByRole("term")).not.toBeInTheDocument();
    const statusPanel = screen.getByRole("tabpanel", { name: "상태" });
    expect(within(statusPanel).getByText("현재 그래프")).toBeInTheDocument();
    expect(within(statusPanel).queryByText("탐색 결과 계약")).not.toBeInTheDocument();

    fireEvent.click(within(tablist).getByRole("tab", { name: "실행 순서" }));
    const runPanel = screen.getByRole("tabpanel", { name: "실행 순서" });
    expect(within(runPanel).getByText("실행 순서")).toBeInTheDocument();
    expect(within(runPanel).queryByText("탐색 결과 계약")).not.toBeInTheDocument();

    fireEvent.click(within(tablist).getByRole("tab", { name: "결과 기준" }));
    const criteriaPanel = screen.getByRole("tabpanel", { name: "결과 기준" });
    expect(within(criteriaPanel).getByText("탐색 결과 계약")).toBeInTheDocument();
    expect(within(criteriaPanel).getByText("경로 결과 계약")).toBeInTheDocument();
    expect(
      within(criteriaPanel).getByText("결과 계약과 실행 게이트 보기"),
    ).toBeInTheDocument();
    expect(within(criteriaPanel).getByText("자체 점검 + 상태 게이트")).not.toBeVisible();

    fireEvent.click(within(criteriaPanel).getByText("결과 계약과 실행 게이트 보기"));
    expect(within(criteriaPanel).getByText("자체 점검 + 상태 게이트")).toBeVisible();
  });
});
