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
  it("상태/확인 순서/결과 기준 정보를 탭으로 나눠 첫 화면 밀도를 낮춘다", async () => {
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
        .getByRole("button", { name: "AI 확인 묶음 복사" })
        .compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "결정 브리프 복사" })
        .compareDocumentPosition(screen.getByRole("button", { name: "터미널 확인 묶음 복사" })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      summary.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const businessLane = screen.getByLabelText("비즈니스 온톨로지 결정 질문");
    expect(businessLane).toHaveTextContent("결정 질문");
    expect(businessLane).toHaveTextContent(
      "경로나 API를 말하기 전에 사용자 결과, 제품 경계, 역량 주장, 구현 근거를 순서대로 확인합니다.",
    );
    expect(businessLane).toHaveTextContent("AI 확인 묶음 · 질문 8개");
    expect(businessLane).toHaveTextContent("1. 결과");
    expect(businessLane).toHaveTextContent("2. 경계");
    expect(businessLane).toHaveTextContent("3. 주장");
    expect(businessLane).toHaveTextContent("4. 근거");
    expect(businessLane).toHaveTextContent("결과 분포와 도메인 경계");
    expect(businessLane).toHaveTextContent("제품 경계와 연결");
    expect(businessLane).toHaveTextContent("역량 주장 후보");
    expect(businessLane).toHaveTextContent("구현 근거 연결");
    expect(businessLane).toHaveTextContent("답변 기준 보기");
    expect(businessLane).not.toHaveTextContent("business_questions");
    expect(businessLane).not.toHaveTextContent("MCP");
    expect(businessLane).not.toHaveTextContent("facets + domain_matrix");
    expect(businessLane).not.toHaveTextContent("match_nodes + domain_matrix");
    expect(businessLane).not.toHaveTextContent("match_nodes capability");
    expect(businessLane).not.toHaveTextContent("capability -> element");
    expect(businessLane).toHaveTextContent(
      "What business outcome should this ontology explain or improve?",
    );
    expect(businessLane).not.toHaveTextContent(
      "Which business/product domain boundary does this code change?",
    );
    expect(businessLane).not.toHaveTextContent(
      "What capability claim can a planner, marketer, or leader discuss?",
    );
    expect(businessLane).not.toHaveTextContent(
      "Which implementation evidence proves or disproves that capability?",
    );
    expect(businessLane).toHaveTextContent(
      "결과, 그래프 압력, 바뀌는 의사결정을 모두 말해야 통과입니다.",
    );
    expect(businessLane).not.toHaveTextContent(
      "경계, match 수, coupling 근거를 모두 말해야 통과입니다.",
    );
    expect(within(businessLane).getByRole("button", { name: "1. 결과 결과 분포와 도메인 경계" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      summary.compareDocumentPosition(businessLane) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      businessLane.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(within(businessLane).getByRole("button", { name: "결과 복사" }));
    await waitFor(() => {
      expect(copyTextMock).toHaveBeenCalledWith(
        expect.stringContaining("Question focus: Business outcome"),
      );
    });
    const copiedOutcomeQuestion = copyTextMock.mock.calls.at(-1)?.[0] ?? "";
    expect(copiedOutcomeQuestion).toContain("query_ontology.facets");
    expect(copiedOutcomeQuestion).toContain("query_ontology.domain_matrix");
    expect(copiedOutcomeQuestion).toContain("Acceptance criteria:");
    expect(copiedOutcomeQuestion).toContain(
      "Accept only if the answer names the outcome, cites facets plus domain_matrix pressure, and states the changed decision.",
    );

    fireEvent.click(
      within(businessLane).getByRole("button", { name: "2. 경계 제품 경계와 연결" }),
    );
    expect(within(businessLane).getByRole("button", { name: "2. 경계 제품 경계와 연결" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(businessLane).toHaveTextContent(
      "Which business/product domain boundary does this code change?",
    );
    expect(businessLane).toHaveTextContent(
      "경계, match 수, coupling 근거를 모두 말해야 통과입니다.",
    );
    fireEvent.click(within(businessLane).getByRole("button", { name: /경계 복사/ }));
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
    expect(copiedBoundaryQuestion).toContain(
      "Accept only if the answer names the boundary, reports match_nodes totals plus followUp, and cites coupling evidence.",
    );

    fireEvent.click(
      within(businessLane).getByRole("button", { name: "3. 주장 역량 주장 후보" }),
    );
    expect(businessLane).toHaveTextContent(
      "What capability claim can a planner, marketer, or leader discuss?",
    );
    expect(businessLane).toHaveTextContent(
      "구현 근거보다 사람이 읽을 capability 주장이 먼저 나와야 통과입니다.",
    );
    fireEvent.click(within(businessLane).getByRole("button", { name: /주장 복사/ }));
    await waitFor(() => {
      expect(copyTextMock).toHaveBeenCalledWith(
        expect.stringContaining("Question focus: Capability claim"),
      );
    });
    const copiedClaimQuestion = copyTextMock.mock.calls.at(-1)?.[0] ?? "";
    expect(copiedClaimQuestion).toContain("query_ontology.match_nodes");
    expect(copiedClaimQuestion).toContain('"kind": "capability"');
    expect(copiedClaimQuestion).not.toContain("query_ontology.match_edges");
    expect(copiedClaimQuestion).toContain(
      "Accept only if the answer writes the human capability claim first, then cites capability scan evidence before implementation proof.",
    );

    fireEvent.click(
      within(businessLane).getByRole("button", { name: "4. 근거 구현 근거 연결" }),
    );
    expect(businessLane).toHaveTextContent(
      "Which implementation evidence proves or disproves that capability?",
    );
    expect(businessLane).toHaveTextContent(
      "근거 행에 후속 확인과 proves/disproves/needs review 판정이 있어야 통과입니다.",
    );
    fireEvent.click(within(businessLane).getByRole("button", { name: /근거 복사/ }));
    await waitFor(() => {
      expect(copyTextMock).toHaveBeenCalledWith(
        expect.stringContaining("Question focus: Implementation evidence"),
      );
    });
    const copiedEvidenceQuestion = copyTextMock.mock.calls.at(-1)?.[0] ?? "";
    expect(copiedEvidenceQuestion).toContain("query_ontology.match_edges");
    expect(copiedEvidenceQuestion).toContain("capability -> element match_edges");
    expect(copiedEvidenceQuestion).toContain("Required answer shape:");
    expect(copiedEvidenceQuestion).toContain(
      "Verdict: <proves / disproves / needs review before business claim>",
    );
    expect(copiedEvidenceQuestion).toContain(
      "Accept only if the answer lists capability -> element proof rows with followUp evidence and a proves/disproves/needs review verdict.",
    );
    expect(copiedEvidenceQuestion).toContain(
      "Reject path-only, API-only, route-only, or command-only answers as implementation notes, not business ontology evidence.",
    );
    expect(copiedEvidenceQuestion).toContain("capability -> element");
    expect(
      screen.getByRole("button", { name: "현재 그래프 설명 보기" }).className,
    ).toContain("h-8 w-8");
    expect(screen.getByRole("button", { name: "터미널 확인 묶음 복사" }).className).toContain(
      "min-h-8",
    );
    expect(screen.getByRole("button", { name: "결정 브리프 복사" }).className).toContain(
      "min-h-8",
    );
    expect(screen.getByRole("button", { name: "AI 확인 묶음 복사" }).className).toContain(
      "min-h-8",
    );
    fireEvent.click(screen.getByRole("button", { name: "결정 브리프 복사" }));
    await waitFor(() => {
      expect(copyTextMock).toHaveBeenCalledWith(
        expect.stringContaining("# Business ontology decision brief"),
      );
    });
    const copiedBusinessBrief = copyTextMock.mock.calls.at(-1)?.[0] ?? "";
    expect(copiedBusinessBrief).toContain("Read order: outcome -> domain -> capability -> element");
    expect(copiedBusinessBrief).toContain(
      "What business outcome should this ontology explain or improve?",
    );
    expect(copiedBusinessBrief).toContain(
      "Which business/product domain boundary does this code change?",
    );
    expect(copiedBusinessBrief).toContain(
      "What capability claim can a planner, marketer, or leader discuss?",
    );
    expect(copiedBusinessBrief).toContain(
      "Which implementation evidence proves or disproves that capability?",
    );
    expect(copiedBusinessBrief).toContain("Required answer shape:");
    expect(copiedBusinessBrief).toContain(
      "Claim: write the human capability claim first, cite capability graph evidence second, and only then mention implementation proof.",
    );
    expect(copiedBusinessBrief).toContain(
      "Evidence: list capability -> element proof rows with followUp evidence, and mark whether each row proves, disproves, or needs review.",
    );
    expect(copiedBusinessBrief).toContain("Graph DB query pack item: business_questions");
    expect(copiedBusinessBrief).toContain("- Runtime gate: pnpm dogfood:graph-db");
    expect(screen.getByText("다음")).toBeInTheDocument();
    expect(screen.getByText(/먼저 비즈니스 질문으로 판단할 대상을 좁히고/)).toBeInTheDocument();
    const agentLens = screen.getByLabelText("AI 확인 기준");
    expect(agentLens).toHaveTextContent("AI 확인 기준");
    expect(agentLens).toHaveTextContent("5개 기준");
    expect(agentLens).not.toHaveTextContent("맥락");
    expect(agentLens).not.toHaveTextContent("도구");
    expect(agentLens).not.toHaveTextContent("근거");
    expect(agentLens).not.toHaveTextContent("변화");
    expect(agentLens).not.toHaveTextContent("흐름");
    expect(agentLens).not.toHaveTextContent("AI 판단 지도");
    expect(agentLens).not.toHaveTextContent("agent-practitioner-concerns-map");
    fireEvent.click(within(agentLens).getByText("AI 판단 기준 보기"));
    expect(agentLens).toHaveTextContent("맥락");
    expect(agentLens).toHaveTextContent("도구");
    expect(agentLens).toHaveTextContent("근거");
    expect(agentLens).toHaveTextContent("변화");
    expect(agentLens).toHaveTextContent("흐름");
    expect(agentLens).toHaveTextContent("AI 판단 지도");
    const nextLabel = screen.getByText("다음");
    expect(tablist.compareDocumentPosition(nextLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      nextLabel.compareDocumentPosition(agentLens) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(summary).toHaveTextContent("준비도");
    expect(summary).toHaveTextContent("확인 순서");
    expect(summary).toHaveTextContent("AI 확인");
    expect(summary).toHaveTextContent("터미널 확인");
    expect(summary).not.toHaveTextContent("검증 흐름");
    expect(summary).not.toHaveTextContent("에이전트용");
    expect(summary).not.toHaveTextContent("터미널용");
    expect(summary).not.toHaveTextContent("MCP");
    expect(summary).not.toHaveTextContent("CLI 대체");
    expect(within(summary).queryByRole("term")).not.toBeInTheDocument();
    const statusPanel = screen.getByRole("tabpanel", { name: "상태" });
    expect(within(statusPanel).getByText("현재 그래프")).toBeInTheDocument();
    expect(within(statusPanel).queryByText("탐색 결과 계약")).not.toBeInTheDocument();
    const validationFlowSummary = within(statusPanel)
      .getByText("확인 순서 보기")
      .closest("summary");
    expect(validationFlowSummary?.className).toContain("min-h-8");
    expect(within(statusPanel).getByText("01")).not.toBeVisible();
    expect(within(statusPanel).getByText("계획")).not.toBeVisible();
    expect(within(statusPanel).getByText("04")).not.toBeVisible();
    expect(within(statusPanel).getByText("근거 확정")).not.toBeVisible();

    fireEvent.click(within(statusPanel).getByText("확인 순서 보기"));
    expect(within(statusPanel).getByText("01")).toBeVisible();
    expect(within(statusPanel).getByText("계획")).toBeVisible();
    expect(within(statusPanel).getByText("04")).toBeVisible();
    expect(within(statusPanel).getByText("근거 확정")).toBeVisible();

    fireEvent.click(within(tablist).getByRole("tab", { name: "확인 순서" }));
    const runPanel = screen.getByRole("tabpanel", { name: "확인 순서" });
    expect(within(runPanel).getByText("확인 순서")).toBeInTheDocument();
    expect(runPanel).toHaveTextContent("기본 상태 점검");
    expect(runPanel).toHaveTextContent("그래프 분포");
    expect(runPanel).toHaveTextContent("판단 기준");
    expect(runPanel).toHaveTextContent(
      "판단 기준: totalMatches · limited · followUp / evidence.pathsComplete",
    );
    expect(runPanel).toHaveTextContent("totalMatches · limited · followUp");
    expect(runPanel).toHaveTextContent("evidence.pathsComplete");
    fireEvent.click(within(runPanel).getByRole("button", { name: "판단 기준 복사" }));
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
    expect(within(runPanel).queryByText("증거 계약")).not.toBeInTheDocument();
    expect(within(runPanel).getByText("나머지 검사 3개 보기")).toBeInTheDocument();
    expect(within(runPanel).getByText("4 · 도메인 결합")).not.toBeVisible();
    expect(within(runPanel).getByText("6 · 비즈니스 질문")).not.toBeVisible();

    fireEvent.click(within(runPanel).getByText("나머지 검사 3개 보기"));
    expect(within(runPanel).getByText("4 · 도메인 결합")).toBeVisible();
    expect(within(runPanel).getByText("6 · 비즈니스 질문")).toBeVisible();

    fireEvent.click(within(tablist).getByRole("tab", { name: "결과 기준" }));
    const criteriaPanel = screen.getByRole("tabpanel", { name: "결과 기준" });
    expect(within(criteriaPanel).getByText("탐색 판단 기준")).toBeInTheDocument();
    expect(within(criteriaPanel).getByText("경로 판단 기준")).toBeInTheDocument();
    expect(within(criteriaPanel).queryByText("탐색 결과 계약")).not.toBeInTheDocument();
    expect(within(criteriaPanel).queryByText("경로 결과 계약")).not.toBeInTheDocument();
    expect(
      within(criteriaPanel).getByText("필요할 때 실행 명령 보기"),
    ).toBeInTheDocument();
    expect(within(criteriaPanel).getByText("AI에게 넘기기 전 확인")).toBeInTheDocument();
    expect(criteriaPanel).toHaveTextContent("맥락");
    expect(criteriaPanel).toHaveTextContent("추측을 줄입니다");
    expect(criteriaPanel).toHaveTextContent("연결 상태를 봅니다");
    expect(criteriaPanel).toHaveTextContent("실행 근거를 남깁니다");
    expect(criteriaPanel).toHaveTextContent("오래된 기억을 찾습니다");
    expect(criteriaPanel).toHaveTextContent("작은 루프를 우선합니다");
    expect(criteriaPanel).not.toHaveTextContent("agent_brief");
    expect(criteriaPanel).not.toHaveTextContent("/mcp · codex mcp list");
    expect(criteriaPanel).not.toHaveTextContent("relation_check");
    expect(criteriaPanel).not.toHaveTextContent("health · maintenance");
    expect(criteriaPanel).not.toHaveTextContent("read-check-write-sync");
    expect(within(criteriaPanel).getByText("기본 상태 점검")).not.toBeVisible();

    fireEvent.click(within(criteriaPanel).getByText("필요할 때 실행 명령 보기"));
    expect(within(criteriaPanel).getByText("기본 상태 점검")).toBeVisible();
  });
});
