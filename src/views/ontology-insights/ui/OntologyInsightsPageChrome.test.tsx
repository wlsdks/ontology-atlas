import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  buildInsightsReaderQuestionHandoff,
  buildInsightsReaderPresetHref,
  getInsightsTabDescriptionKey,
  getInsightsTabForReaderIntent,
  InsightsPageHeaderChrome,
  InsightsProofBandHeader,
  InsightsQuestionPresetStrip,
  InsightsReaderIntentStrip,
  InsightsSessionProofStrip,
  SESSION_PROOF_PACKET,
} from "./OntologyInsightsPage";
import { buildInsightsCollaboratorBrief } from "../lib/collaborator-insights-brief";
import { InsightsCollaboratorBriefPanel } from "./parts/InsightsCollaboratorBriefPanel";
import { copyText } from "@/shared/lib/copy-text";

vi.mock("@/shared/ui", () => ({
  EmptyState: ({ title }: { title: ReactNode }) => <div>{title}</div>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/shared/lib/copy-text", () => ({
  copyText: vi.fn(async () => true),
}));

const copyTextMock = vi.mocked(copyText);

describe("OntologyInsightsPage compact chrome", () => {
  it("maps stakeholder reader intents to the first useful insights tab", () => {
    expect(getInsightsTabForReaderIntent("planning")).toBe("collaboration");
    expect(getInsightsTabForReaderIntent("marketing")).toBe("collaboration");
    expect(getInsightsTabForReaderIntent("leadership")).toBe("collaboration");
    expect(getInsightsTabForReaderIntent("agent")).toBe("agent");
    expect(getInsightsTabForReaderIntent("developer")).toBe("proof");
    expect(getInsightsTabForReaderIntent(null)).toBe("proof");
  });

  it("maps each top-level tab to a short purpose line so hidden information groups stay understandable", () => {
    expect(getInsightsTabDescriptionKey("proof")).toBe("surfaceTabProofDesc");
    expect(getInsightsTabDescriptionKey("collaboration")).toBe(
      "surfaceTabCollaborationDesc",
    );
    expect(getInsightsTabDescriptionKey("agent")).toBe("surfaceTabAgentDesc");
    expect(getInsightsTabDescriptionKey("census")).toBe("surfaceTabCensusDesc");
  });

  it("keeps the page explanation visible without turning the header into a card", () => {
    render(
      <InsightsPageHeaderChrome
        eyebrow="온톨로지 · 질문과 근거"
        title="그래프에 묻고 근거로 확인"
        subtitle="허브, 경로, 영향, 소유권 질문을 같은 로컬 온톨로지에서 확인합니다."
        infoLabel="질문·근거 화면 설명 보기"
        proofPoints={["질문할 그래프", "MCP/CLI 재현", "근거 게이트"]}
      />,
    );

    expect(screen.getByRole("heading", { name: "그래프에 묻고 근거로 확인" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "질문·근거 화면 설명 보기" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "질문·근거 화면 설명 보기" }),
    ).not.toHaveTextContent("!");
    expect(
      screen.getByText("허브, 경로, 영향, 소유권 질문을 같은 로컬 온톨로지에서 확인합니다."),
    ).toHaveClass("text-[color:var(--color-text-tertiary)]");
    expect(screen.getByRole("list", { name: "그래프에 묻고 근거로 확인" })).toHaveTextContent(
      "질문할 그래프",
    );
    expect(screen.getByRole("list", { name: "그래프에 묻고 근거로 확인" })).toHaveTextContent(
      "MCP/CLI 재현",
    );
    expect(screen.getByRole("list", { name: "그래프에 묻고 근거로 확인" })).toHaveTextContent(
      "근거 게이트",
    );
  });

  it("keeps the proof band introduction visible and compact", () => {
    render(
      <InsightsProofBandHeader
        eyebrow="근거 게이트"
        description="이 그래프에서 나온 답을 agent나 사람이 믿어도 되는지 확인합니다."
        infoLabel="근거 게이트 설명 보기"
      />,
    );

    expect(screen.getByText("근거 게이트")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "근거 게이트 설명 보기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "근거 게이트 설명 보기" })).not.toHaveTextContent("!");
    expect(
      screen.getByText("이 그래프에서 나온 답을 agent나 사람이 믿어도 되는지 확인합니다."),
    ).toHaveClass("text-[color:var(--color-text-tertiary)]");
  });

  it("shows reader intent as a quiet first-action strip instead of another dashboard card", () => {
    render(
      <InsightsReaderIntentStrip
        label="Marketing reader intent"
        title="Ground claims in verified capabilities"
        body="Use capability rows and copied graph handoffs before campaign copy."
        actionLabel="Review evidence"
        actionHref="/ontology/insights/?reader=marketing"
      />,
    );

    const strip = screen.getByTestId("insights-reader-intent");
    expect(strip).toHaveAttribute("aria-label", "Marketing reader intent");
    expect(strip).toHaveClass("border-y");
    expect(strip).not.toHaveClass("rounded-lg");
    expect(strip).toHaveTextContent("Ground claims in verified capabilities");
    expect(screen.getByRole("link", { name: "Review evidence" })).toHaveAttribute(
      "href",
      "/ontology/insights/?reader=marketing",
    );
  });

  it("shows stakeholder graph questions as quiet first-screen presets", async () => {
    copyTextMock.mockClear();
    const marketingHandoff = buildInsightsReaderQuestionHandoff({
      intent: "marketing",
      reader: "Marketing",
      question: "Capability evidence for claims",
      signal: "58 implementation proofs",
      operation: "match_nodes + lineage",
      href: buildInsightsReaderPresetHref("marketing"),
    });

    render(
      <InsightsQuestionPresetStrip
        ariaLabel="Role-based graph questions"
        eyebrow="Start with a question"
        title="Pick a role to ask the same graph for evidence."
        body="Planning, marketing, leadership, development, and agent work start from different questions."
        copiedLabel="Copied"
        presets={[
          {
            reader: "Planning",
            question: "Vocabulary boundaries before scope",
            signal: "6 domains · 33 capabilities",
            operation: "facets + domain_matrix",
            href: buildInsightsReaderPresetHref("planning"),
            selected: false,
            copyLabel: "Copy question",
            copyText: buildInsightsReaderQuestionHandoff({
              intent: "planning",
              reader: "Planning",
              question: "Vocabulary boundaries before scope",
              signal: "6 domains · 33 capabilities",
              operation: "facets + domain_matrix",
              href: buildInsightsReaderPresetHref("planning"),
            }),
          },
          {
            reader: "Marketing",
            question: "Capability evidence for claims",
            signal: "58 implementation proofs",
            operation: "match_nodes + lineage",
            href: buildInsightsReaderPresetHref("marketing"),
            selected: true,
            copyLabel: "Copy question",
            copyText: marketingHandoff,
          },
        ]}
      />,
    );

    const strip = screen.getByTestId("insights-question-presets");
    expect(strip).toHaveAttribute("aria-label", "Role-based graph questions");
    expect(strip).toHaveClass("border-y");
    expect(strip).toHaveClass("hidden");
    expect(strip).toHaveClass("md:block");
    expect(strip).not.toHaveClass("rounded-lg");
    expect(strip).toHaveTextContent("Pick a role to ask the same graph for evidence.");
    expect(strip).toHaveTextContent("business-first · outcome -> domain -> capability -> element");
    expect(strip).toHaveTextContent("6 domains · 33 capabilities");
    expect(strip).toHaveTextContent("58 implementation proofs");
    expect(strip).toHaveTextContent("facets + domain_matrix");
    expect(strip).toHaveTextContent("match_nodes + lineage");
    expect(screen.getByRole("link", { name: /Planning/ })).toHaveAttribute(
      "href",
      "/ontology/insights/?reader=planning",
    );
    const selected = screen.getByRole("link", { name: /Marketing/ });
    expect(selected).toHaveAttribute("href", "/ontology/insights/?reader=marketing");
    expect(selected).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getAllByRole("button", { name: "Copy question" })[1]);
    await waitFor(() => {
      expect(copyTextMock).toHaveBeenCalledWith(marketingHandoff);
    });
    expect(marketingHandoff).toContain("# Ontology reader graph question");
    expect(marketingHandoff).toContain("- Reader: Marketing");
    expect(marketingHandoff).toContain("- Question: Capability evidence for claims");
    expect(marketingHandoff).toContain("- Graph operations: match_nodes + lineage");
    expect(marketingHandoff).toContain(
      "- Local app surface: tauri://localhost/ko/ontology/insights/?reader=marketing",
    );
    expect(marketingHandoff).toContain("# Business ontology lens");
    expect(marketingHandoff).toContain("- Policy: business-first");
    expect(marketingHandoff).toContain("- Read order: outcome -> domain -> capability -> element");
    expect(marketingHandoff).toContain(
      "- Do not treat paths, APIs, routes, or commands as the ontology root.",
    );
    expect(marketingHandoff).toContain("# Business extraction checks");
    expect(marketingHandoff).toContain(
      "- What business outcome should this ontology explain or improve?",
    );
    expect(marketingHandoff).toContain(
      "- Which business/product domain boundary does this code change?",
    );
    expect(marketingHandoff).toContain(
      "- What capability claim can a planner, marketer, or leader discuss?",
    );
    expect(marketingHandoff).toContain(
      "- Which implementation evidence proves or disproves that capability?",
    );
    expect(marketingHandoff).toContain("# Executable MCP payloads");
    expect(marketingHandoff).toContain(
      'query_ontology({"operation":"match_nodes","kind":"capability","minDegree":2,"sort":"degree","limit":10})',
    );
    expect(marketingHandoff).toContain(
      'query_ontology({"operation":"facets","limit":10})',
    );
    expect(marketingHandoff).toContain("# CLI fallback");
    expect(marketingHandoff).toContain(
      "ontology-atlas match-nodes [vault] --kind capability --min-degree 2 --sort degree --limit 10",
    );
    expect(marketingHandoff).toContain("ontology-atlas facets [vault] --limit 10");
    expect(marketingHandoff).toContain("pnpm dogfood:graph-db");
    expect(marketingHandoff).toContain("evidence.pathsComplete");
  });

  it("shows business extraction checks directly in the collaborator evidence tab", () => {
    const brief = buildInsightsCollaboratorBrief({
      nodeCount: 102,
      relationCount: 583,
      domainCount: 6,
      crossDomainEdgeCount: 3,
      orphanCount: 0,
      topHubs: [
        {
          id: "capabilities/agent-onboarding-brief",
          title: "Agent Onboarding Brief",
          kind: "capability",
          degree: 12,
        },
      ],
    });

    render(
      <InsightsCollaboratorBriefPanel
        brief={brief}
        impactCliCheckCommand="ontology-atlas domain-matrix [vault]"
        impactMcpCheckPayload='query_ontology({"operation":"domain_matrix"})'
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "collaboratorTabEvidence" }));

    expect(screen.getByTestId("insights-collaborator-business-checks")).toHaveTextContent(
      "collaboratorBusinessExtractionChecks",
    );
    expect(screen.getByTestId("insights-collaborator-business-checks")).toHaveTextContent(
      "What business outcome should this ontology explain or improve?",
    );
    expect(screen.getByTestId("insights-collaborator-business-checks")).toHaveTextContent(
      "Which business/product domain boundary does this code change?",
    );
    expect(screen.getByTestId("insights-collaborator-business-checks")).toHaveTextContent(
      "What capability claim can a planner, marketer, or leader discuss?",
    );
    expect(screen.getByTestId("insights-collaborator-business-checks")).toHaveTextContent(
      "Which implementation evidence proves or disproves that capability?",
    );
  });

  it("separates current AI session checks from terminal fallback checks and stale tool cache hints", () => {
    render(
      <InsightsSessionProofStrip
        title="현재 AI 세션 확인"
        copyLabel="세션 확인 복사"
        copiedLabel="복사됨"
        copyText="query_ontology({&quot;operation&quot;:&quot;agent_brief&quot;})"
        items={[
          {
            title: "현재 세션 확인",
            body: "tools/list 24개, index_project, query_ontology가 보여야 합니다.",
            tone: "direct",
          },
          {
            title: "터미널 대체 확인",
            body: "mcp-verify는 로컬 서버와 vault 상태만 검증합니다.",
            tone: "fallback",
          },
          {
            title: "캐시 불일치",
            body: "23개로 남으면 agent reload 또는 cached MCP tools 갱신.",
            tone: "ready",
          },
        ]}
      />,
    );

    const strip = screen.getByTestId("insights-session-proof-strip");
    expect(strip).toHaveAttribute("aria-label", "현재 AI 세션 확인");
    expect(strip).toHaveTextContent("현재 AI 세션 확인");
    expect(screen.getByRole("button", { name: "세션 확인 복사" })).toBeInTheDocument();
    expect(strip).toHaveTextContent("현재 세션 확인");
    expect(strip).toHaveTextContent("tools/list 24개");
    expect(strip).toHaveTextContent("터미널 대체 확인");
    expect(strip).toHaveTextContent("로컬 서버와 vault 상태만");
    expect(strip).toHaveTextContent("캐시 불일치");
    expect(strip).toHaveTextContent("cached MCP tools");
  });

  it("keeps the copied session proof tied to graph verification and evidence contracts", () => {
    expect(SESSION_PROOF_PACKET).toContain(
      "tauri://localhost/ko/ontology/insights/",
    );
    expect(SESSION_PROOF_PACKET).toContain("pnpm dogfood:graph-db");
    expect(SESSION_PROOF_PACKET).toContain(
      "Scan evidence contract: totalMatches · limited · followUp",
    );
    expect(SESSION_PROOF_PACKET).toContain(
      "Path evidence contract: evidence.pathsComplete",
    );
    expect(SESSION_PROOF_PACKET).toContain(
      "Do not treat graph rows or paths as decision evidence until these contracts are reported.",
    );
  });
});
