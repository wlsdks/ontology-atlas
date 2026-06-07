import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
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
import { copyText } from "@/shared/lib/copy-text";

vi.mock("@/shared/lib/copy-text", () => ({
  copyText: vi.fn(async () => true),
}));

const copyTextMock = vi.mocked(copyText);

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
  it("상태/실행 순서/결과 기준 정보를 탭으로 나눠 첫 화면 밀도를 낮춘다", async () => {
    copyTextMock.mockClear();
    renderCockpit();

    const tablist = screen.getByRole("tablist", { name: "그래프 검증 섹션" });
    expect(within(tablist).getByRole("tab", { name: "상태" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const summary = screen.getByLabelText("그래프 검증 요약");
    expect(
      screen.getByRole("button", { name: "그래프 질문과 근거 설명 보기" }),
    ).not.toHaveTextContent("!");
    expect(
      screen.getByRole("button", { name: "그래프 질문과 근거 설명 보기" }).className,
    ).toContain("h-8 w-8");
    expect(
      screen.queryByRole("list", {
        name: "그래프 질의 실행 순서 요약",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getByRole("button", { name: "그래프 DB 묶음 복사" })
        .compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "비즈니스 브리프 복사" })
        .compareDocumentPosition(screen.getByRole("button", { name: "CLI 묶음 복사" })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      summary.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const businessLane = screen.getByLabelText("비즈니스 온톨로지 결정 질문");
    expect(businessLane).toHaveTextContent("비즈니스 결정 레인");
    expect(businessLane).toHaveTextContent(
      "path나 API를 인용하기 전에 business boundary, capability claim, implementation evidence 질문을 먼저 답합니다.",
    );
    expect(businessLane).toHaveTextContent("business_questions · MCP 5");
    expect(businessLane).toHaveTextContent("1. 경계");
    expect(businessLane).toHaveTextContent("2. 주장");
    expect(businessLane).toHaveTextContent("3. 근거");
    expect(businessLane).toHaveTextContent("match_nodes + domain_matrix");
    expect(businessLane).toHaveTextContent("capability -> element");
    expect(businessLane).toHaveTextContent(
      "Which business/product domain boundary does this code change?",
    );
    expect(businessLane).toHaveTextContent(
      "What capability claim can a planner, marketer, or leader discuss?",
    );
    expect(businessLane).toHaveTextContent(
      "Which implementation evidence proves or disproves that capability?",
    );
    expect(
      summary.compareDocumentPosition(businessLane) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      businessLane.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(businessLane).getByRole("button", { name: "경계 복사" })).toBeInTheDocument();
    expect(within(businessLane).getByRole("button", { name: "주장 복사" })).toBeInTheDocument();
    expect(within(businessLane).getByRole("button", { name: "근거 복사" })).toBeInTheDocument();
    fireEvent.click(within(businessLane).getByRole("button", { name: "경계 복사" }));
    await waitFor(() => {
      expect(copyTextMock).toHaveBeenCalledWith(
        expect.stringContaining("# Business ontology question handoff"),
      );
    });
    const copiedBoundaryQuestion = copyTextMock.mock.calls.at(-1)?.[0] ?? "";
    expect(copiedBoundaryQuestion).toContain("Question focus: Domain boundary");
    expect(copiedBoundaryQuestion).toContain("query_ontology.match_nodes");
    expect(copiedBoundaryQuestion).toContain("query_ontology.domain_matrix");
    expect(copiedBoundaryQuestion).not.toContain("query_ontology.match_edges");

    fireEvent.click(within(businessLane).getByRole("button", { name: "근거 복사" }));
    await waitFor(() => {
      expect(copyTextMock).toHaveBeenCalledWith(
        expect.stringContaining("Question focus: Implementation evidence"),
      );
    });
    const copiedEvidenceQuestion = copyTextMock.mock.calls.at(-1)?.[0] ?? "";
    expect(copiedEvidenceQuestion).toContain("query_ontology.match_edges");
    expect(copiedEvidenceQuestion).toContain("capability -> element match_edges");
    expect(
      screen.getByRole("button", { name: "현재 그래프 설명 보기" }).className,
    ).toContain("h-8 w-8");
    expect(screen.getByRole("button", { name: "CLI 묶음 복사" }).className).toContain(
      "min-h-8",
    );
    expect(screen.getByRole("button", { name: "비즈니스 브리프 복사" }).className).toContain(
      "min-h-8",
    );
    expect(screen.getByRole("button", { name: "그래프 DB 묶음 복사" }).className).toContain(
      "min-h-8",
    );
    fireEvent.click(screen.getByRole("button", { name: "비즈니스 브리프 복사" }));
    await waitFor(() => {
      expect(copyTextMock).toHaveBeenCalledWith(
        expect.stringContaining("# Business ontology decision brief"),
      );
    });
    const copiedBusinessBrief = copyTextMock.mock.calls.at(-1)?.[0] ?? "";
    expect(copiedBusinessBrief).toContain("Read order: domain -> capability -> element");
    expect(copiedBusinessBrief).toContain(
      "Which business/product domain boundary does this code change?",
    );
    expect(copiedBusinessBrief).toContain(
      "What capability claim can a planner, marketer, or leader discuss?",
    );
    expect(copiedBusinessBrief).toContain(
      "Which implementation evidence proves or disproves that capability?",
    );
    expect(copiedBusinessBrief).toContain("Graph DB query pack item: business_questions");
    expect(copiedBusinessBrief).toContain("- Runtime gate: pnpm dogfood:graph-db");
    expect(screen.getByText("다음")).toBeInTheDocument();
    expect(
      screen.getByText(/터미널에서 이어 실행할 때는 CLI 검사 묶음을 복사하고/),
    ).toBeInTheDocument();
    const agentLens = screen.getByLabelText("에이전트 기능 판단 기준");
    expect(agentLens).toHaveTextContent("Context");
    expect(agentLens).toHaveTextContent("Tools");
    expect(agentLens).toHaveTextContent("Evidence");
    expect(agentLens).toHaveTextContent("Drift");
    expect(agentLens).toHaveTextContent("Workflow");
    expect(agentLens).toHaveTextContent("agent-practitioner-concerns-map");
    const nextLabel = screen.getByText("다음");
    expect(tablist.compareDocumentPosition(nextLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      nextLabel.compareDocumentPosition(agentLens) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(summary).toHaveTextContent("준비도");
    expect(summary).toHaveTextContent("검사 묶음");
    expect(summary).toHaveTextContent("MCP");
    expect(summary).toHaveTextContent("CLI 대체");
    expect(within(summary).queryByRole("term")).not.toBeInTheDocument();
    const statusPanel = screen.getByRole("tabpanel", { name: "상태" });
    expect(within(statusPanel).getByText("현재 그래프")).toBeInTheDocument();
    expect(within(statusPanel).queryByText("탐색 결과 계약")).not.toBeInTheDocument();
    const validationFlowSummary = within(statusPanel)
      .getByText("검증 흐름 보기")
      .closest("summary");
    expect(validationFlowSummary?.className).toContain("min-h-8");
    expect(within(statusPanel).getByText("01")).not.toBeVisible();
    expect(within(statusPanel).getByText("계획")).not.toBeVisible();
    expect(within(statusPanel).getByText("04")).not.toBeVisible();
    expect(within(statusPanel).getByText("근거 확정")).not.toBeVisible();

    fireEvent.click(within(statusPanel).getByText("검증 흐름 보기"));
    expect(within(statusPanel).getByText("01")).toBeVisible();
    expect(within(statusPanel).getByText("계획")).toBeVisible();
    expect(within(statusPanel).getByText("04")).toBeVisible();
    expect(within(statusPanel).getByText("근거 확정")).toBeVisible();

    fireEvent.click(within(tablist).getByRole("tab", { name: "실행 순서" }));
    const runPanel = screen.getByRole("tabpanel", { name: "실행 순서" });
    expect(within(runPanel).getByText("실행 순서")).toBeInTheDocument();
    expect(runPanel).toHaveTextContent("자체 점검 + 상태 게이트");
    expect(runPanel).toHaveTextContent("그래프 분포");
    expect(runPanel).toHaveTextContent("증거 계약");
    expect(runPanel).toHaveTextContent(
      "증거 계약: totalMatches · limited · followUp / evidence.pathsComplete",
    );
    expect(runPanel).toHaveTextContent("totalMatches · limited · followUp");
    expect(runPanel).toHaveTextContent("evidence.pathsComplete");
    fireEvent.click(within(runPanel).getByRole("button", { name: "증거 계약 복사" }));
    await waitFor(() => {
      expect(copyTextMock).toHaveBeenCalledWith(
        expect.stringContaining("# Graph evidence contract"),
      );
    });
    const copiedContract = copyTextMock.mock.calls.at(-1)?.[0] ?? "";
    expect(copiedContract).toContain("- Scan: totalMatches · limited · followUp");
    expect(copiedContract).toContain("- Path: evidence.pathsComplete");
    expect(copiedContract).toContain("- Runtime gate: pnpm dogfood:graph-db");
    expect(copiedContract).toContain(
      "- Decision rule: Treat scan rows and paths as candidates until the contract is reported; defer decisions when evidence.pathsComplete is false.",
    );
    expect(within(runPanel).queryByText("탐색 결과 계약")).not.toBeInTheDocument();
    expect(within(runPanel).getByText("나머지 검사 3개 보기")).toBeInTheDocument();
    expect(within(runPanel).getByText("4 · 도메인 결합")).not.toBeVisible();
    expect(within(runPanel).getByText("6 · 비즈니스 질문")).not.toBeVisible();

    fireEvent.click(within(runPanel).getByText("나머지 검사 3개 보기"));
    expect(within(runPanel).getByText("4 · 도메인 결합")).toBeVisible();
    expect(within(runPanel).getByText("6 · 비즈니스 질문")).toBeVisible();

    fireEvent.click(within(tablist).getByRole("tab", { name: "결과 기준" }));
    const criteriaPanel = screen.getByRole("tabpanel", { name: "결과 기준" });
    expect(within(criteriaPanel).getByText("탐색 결과 계약")).toBeInTheDocument();
    expect(within(criteriaPanel).getByText("경로 결과 계약")).toBeInTheDocument();
    expect(
      within(criteriaPanel).getByText("결과 계약과 실행 게이트 보기"),
    ).toBeInTheDocument();
    expect(within(criteriaPanel).getByText("에이전트 실행 점검")).toBeInTheDocument();
    expect(criteriaPanel).toHaveTextContent("Context");
    expect(criteriaPanel).toHaveTextContent("agent_brief");
    expect(criteriaPanel).toHaveTextContent("/mcp · codex mcp list");
    expect(criteriaPanel).toHaveTextContent("relation_check");
    expect(criteriaPanel).toHaveTextContent("health · maintenance");
    expect(criteriaPanel).toHaveTextContent("read-check-write-sync");
    expect(within(criteriaPanel).getByText("자체 점검 + 상태 게이트")).not.toBeVisible();

    fireEvent.click(within(criteriaPanel).getByText("결과 계약과 실행 게이트 보기"));
    expect(within(criteriaPanel).getByText("자체 점검 + 상태 게이트")).toBeVisible();
  });
});
