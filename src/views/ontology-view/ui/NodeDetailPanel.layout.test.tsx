import { NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { TooltipProvider } from "@/shared/ui";
import {
  NodeDetailPanel,
  OntologyCommandBarHeader,
  OntologyMetaFooter,
  OntologyMeaningGateStrip,
  OntologyStatusStrip,
  TreeProjectionWarnings,
} from "./OntologyViewPage";
import { DEFAULT_BUSINESS_ONTOLOGY_LENS } from "@/shared/lib/business-ontology-lens";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/ko/ontology/",
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ replace: vi.fn() }),
}));

function node(overrides: Partial<KnowledgeGraphNode> = {}): KnowledgeGraphNode {
  return {
    id: "project:ontology-atlas",
    title: "ontology-atlas",
    kind: "project",
    summary: "Local-first codebase ontology workbench for Claude Code and Codex.",
    projectIds: ["project"],
    evidenceIds: ["ontology/project"],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
    ...overrides,
  };
}

function renderPanel() {
  render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <TooltipProvider>
        <NodeDetailPanel
          node={node()}
          documentTitleByEvidenceId={new Map([["ontology/project", "Project"]])}
          ego={null}
          reachability={null}
          reachabilityDepth={3}
          reachabilityDirection="outgoing"
          egoHops={1}
          onChangeEgoHops={() => {}}
          onChangeReachabilityDepth={() => {}}
          onChangeReachabilityDirection={() => {}}
          onSelectNeighbor={() => {}}
          onClose={() => {}}
        />
      </TooltipProvider>
    </NextIntlClientProvider>,
  );
}

describe("NodeDetailPanel layout", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("frames the ontology browse surface as business meaning to implementation evidence", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <OntologyMeaningGateStrip
          domainCount={6}
          capabilityCount={33}
          elementCount={56}
          relationCount={368}
          coreDomains={[
            { id: "domain:views", title: "Views", capabilityCount: 16 },
            { id: "domain:ai-agent-partner", title: "AI Agent Partner", capabilityCount: 9 },
          ]}
        />
      </NextIntlClientProvider>,
    );

    const gate = screen.getByTestId("ontology-meaning-gate");
    expect(gate).toHaveAccessibleName("개념 지도 화면에서 의미와 구현 근거를 안내하는 요약");
    expect(gate).toHaveTextContent("먼저 도메인을 고르세요.");
    expect(gate).not.toHaveTextContent("같은 slug로 의미, 관계, 구현 근거, MCP 검증까지 이어집니다");
    expect(gate).not.toHaveTextContent(
      "다음 행동: 계층에서 개념을 선택하고, 필요하면 관계 편집에서 관계를 고친 뒤 그래프 검증에서 같은 graph를 확인하세요.",
    );
    expect(screen.queryByRole("button", { name: "브리핑 복사" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "요약 복사" })).toHaveAccessibleDescription(
      "도메인, 역량, 구현 근거 요약을 복사합니다.",
    );
    expect(screen.getByRole("button", { name: "요약 복사" })).not.toHaveAccessibleDescription(
      /검증 도구/,
    );
    expect(screen.queryByRole("list", { name: "온톨로지 읽는 순서" })).not.toBeInTheDocument();
    expect(gate).not.toHaveTextContent("비즈니스 언어");
    expect(gate).not.toHaveTextContent("도메인 6개");
    expect(gate).not.toHaveTextContent("제품 역량");
    expect(gate).not.toHaveTextContent("역량 33개");
    expect(gate).not.toHaveTextContent("요소 56개 · 의미 관계 368개");
    expect(gate).not.toHaveTextContent("Meaning gate");
    expect(gate).not.toHaveTextContent("reader lanes");
    expect(gate).not.toHaveTextContent("Wedge");
    expect(gate).toHaveTextContent("먼저 볼 도메인");
    expect(gate).toHaveTextContent("Views");
    expect(gate).toHaveTextContent("역량 16개");
    expect(screen.queryByRole("list", { name: "비즈니스 결정 질문" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "AI 에이전트 그래프 검증 순서" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "비즈니스 graph DB 질의" })).not.toBeInTheDocument();
    expect(gate).not.toHaveTextContent("facets");
    expect(gate).not.toHaveTextContent("domain_matrix");
    expect(gate).not.toHaveTextContent("query_plan → all_paths");
    expect(gate).not.toHaveTextContent("agent_brief");
    expect(gate).not.toHaveTextContent("workspace_brief");
    expect(gate).not.toHaveTextContent("health");

    expect(screen.queryByRole("button", { name: "읽는 순서 보기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "확인 질문 보기" })).not.toBeInTheDocument();
    const detailToggle = screen.getByRole("button", { name: "세부 내용 보기" });
    expect(detailToggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(detailToggle);

    expect(detailToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("list", { name: "온톨로지 읽는 순서" })).toHaveAttribute(
      "data-business-lens-policy",
      DEFAULT_BUSINESS_ONTOLOGY_LENS.policy,
    );
    expect(screen.getByRole("list", { name: "온톨로지 읽는 순서" })).toHaveAttribute(
      "data-business-read-order",
      DEFAULT_BUSINESS_ONTOLOGY_LENS.readOrder.join(">"),
    );
    expect(gate).toHaveTextContent("비즈니스 언어");
    expect(gate).toHaveTextContent("도메인 6개");
    expect(gate).toHaveTextContent("제품 역량");
    expect(gate).toHaveTextContent("역량 33개");
    expect(gate).toHaveTextContent("구현 증거");
    expect(gate).toHaveTextContent("요소 56개 · 의미 관계 368개");

    expect(screen.queryByRole("button", { name: "검증 도구 보기" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "비즈니스 결정 질문" })).toHaveAttribute(
      "data-reader-decision-lens",
      "planning>marketing>leadership>developer>agent",
    );
    expect(screen.getByRole("list", { name: "AI 에이전트 그래프 검증 순서" })).toHaveAttribute(
      "data-agent-graph-db-gate",
      "agent_brief>workspace_brief>health",
    );
    expect(screen.getByRole("list", { name: "비즈니스 graph DB 질의" })).toHaveAttribute(
      "data-business-graph-db-pack",
      "facets>domain_matrix>query_plan:all_paths",
    );
    expect(gate).toHaveTextContent("비즈니스 graph DB 질의");
    expect(gate).toHaveTextContent("facets");
    expect(gate).toHaveTextContent("domain_matrix");
    expect(gate).toHaveTextContent("query_plan → all_paths");
    expect(gate).toHaveTextContent("AI 에이전트 그래프 검증");
    expect(gate).toHaveTextContent("agent_brief");
    expect(gate).toHaveTextContent("workspace_brief");
    expect(gate).toHaveTextContent("health");
    expect(screen.getByRole("button", { name: "agent_brief 실행 점검 복사" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "workspace_brief 실행 점검 복사" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "health 실행 점검 복사" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "분포 질의 복사" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "결합 질의 복사" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "경로 질의 복사" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Views 역량 16개" })).toHaveAttribute(
      "href",
      "/ontology/?node=domain%3Aviews",
    );
    expect(gate).toHaveClass("border-b");
    expect(gate).not.toHaveClass("rounded-lg");
    expect(gate).not.toHaveClass("bg-[color:var(--color-overlay-1)]");
    expect(gate).not.toHaveClass("shadow");
    expect(gate).not.toHaveClass("backdrop-blur");
  });

  it("keeps the top status strip focused on choosing rows instead of explaining background counts", () => {
    const onOpenWarnings = vi.fn();

    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <OntologyStatusStrip
          warningCount={84}
          onOpenWarnings={onOpenWarnings}
        />
      </NextIntlClientProvider>,
    );

    const strip = screen.getByLabelText("개념 지도 상태와 계층 투영 기준");
    expect(strip).toHaveTextContent("개념 지도");
    expect(strip).toHaveTextContent("행을 선택하면 의미 · 관계 · 구현 근거가 열립니다");
    expect(strip).toHaveTextContent("접은 관계84건");
    expect(strip).not.toHaveTextContent("참고 문서 3개");
    expect(screen.queryByLabelText(/계층 밖 근거/)).not.toBeInTheDocument();
    expect(strip).not.toHaveTextContent("원천 102개");
    expect(strip).not.toHaveTextContent("계층 행 283개");
    expect(strip).not.toHaveTextContent("전체 관계 496개");

    const warningButton = screen.getByRole("button", { name: "접은 관계 84건 보기" });
    expect(warningButton).not.toHaveAttribute("title");
    fireEvent.click(warningButton);
    expect(onOpenWarnings).toHaveBeenCalledTimes(1);
  });

  it("copies a business-to-code brief from the meaning gate", async () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <OntologyMeaningGateStrip
          domainCount={6}
          capabilityCount={33}
          elementCount={56}
          relationCount={368}
          coreDomains={[
            { id: "domain:views", title: "Views", capabilityCount: 16 },
            { id: "domain:ai-agent-partner", title: "AI Agent Partner", capabilityCount: 9 },
          ]}
        />
      </NextIntlClientProvider>,
    );

    const copyButton = screen.getByRole("button", { name: "요약 복사" });
    expect(copyButton).toHaveAccessibleDescription(
      "도메인, 역량, 구현 근거 요약을 복사합니다.",
    );
    expect(copyButton).not.toHaveAccessibleDescription(/검증 도구/);

    fireEvent.click(screen.getByRole("button", { name: "요약 복사" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("# Ontology Atlas business-to-code brief"),
      );
    });
    const copied = vi.mocked(navigator.clipboard.writeText).mock.calls[0]?.[0] ?? "";
    expect(copied).toContain("- Audience: 기획자, 마케터, C-level, 개발자, AI agent");
    expect(copied).toContain("- Ontology read order: outcome → domain → capability → element");
    expect(copied).toContain("- Business outcome: 결과 먼저");
    expect(copied).toContain("- Business language: 도메인 6개");
    expect(copied).toContain("- Product capability: 역량 33개");
    expect(copied).toContain("- Implementation proof: 요소 56개 · 의미 관계 368개");
    expect(copied).toContain(
      "- Lens guardrail: Do not treat paths, APIs, routes, or commands as the ontology root.",
    );
    expect(copied).toContain("- Core domain lanes: Views (역량 16개), AI Agent Partner (역량 9개)");
    expect(copied).toContain(
      "- Reader lanes: 기획 — 공유 어휘로 scope를 잡기; 마케팅 — 검증 가능한 역량으로 메시지 쓰기; 리더십 — 소유권과 변경 영향 보기; 개발 — 역량을 구현 증거로 추적하기; Agent — 같은 slug로 MCP 검증 실행",
    );
    expect(copied).toContain(
      "- Reader handoffs: 기획 → /ontology/?node=domain%3Aviews&reader=planning; 마케팅 → /ontology/insights/?reader=marketing; 리더십 → /ontology/insights/?reader=leadership; 개발 → /ontology/edit/?reader=developer; Agent → /ontology/insights/?reader=agent",
    );
    expect(copied).toContain("## Business evidence gate");
    expect(copied).toContain(
      "1. Report meaningGate.businessOntology.evidence rows before treating source folders as capabilities.",
    );
    expect(copied).toContain(
      "2. Report meaningGate.implementationEvidence.reviewRequiredRows for source folders that still need product meaning.",
    );
    expect(copied).toContain(
      "3. Keep paths, APIs, routes, and commands as implementation evidence until a domain/capability owner is clear.",
    );
    expect(copied).toContain("## Business decision questions");
    expect(copied).toContain("1. 이 온톨로지가 어떤 사용자·운영 결과를 설명하거나 개선해야 하는가?");
    expect(copied).toContain("2. 어떤 business/product 경계가 이 결정을 소유하는가?");
    expect(copied).toContain("4. 어떤 구현 증거가 그 의미를 검증하는가?");
    expect(copied).toContain("## Business graph DB query pack");
    expect(copied).toContain(
      "1. 분포 — query_ontology({\"operation\":\"facets\"}) — ontology-atlas facets docs/ontology — totalMatches, limited, followUp를 보고해 질문 후보인지 표시합니다.",
    );
    expect(copied).toContain(
      "2. 결합 — query_ontology({\"operation\":\"domain_matrix\"}) — ontology-atlas domain-matrix docs/ontology",
    );
    expect(copied).toContain(
      "3. 경로 — query_ontology({\"operation\":\"query_plan\",\"targetOperation\":\"all_paths\"}) → query_ontology({\"operation\":\"all_paths\",\"limit\":5}) — ontology-atlas all-paths docs/ontology --plan --limit 5",
    );
    expect(copied).toContain("1. Open shared vocabulary hubs before writing a plan, campaign, or roadmap note.");
    expect(copied).toContain("3. Ask Claude Code / Codex to verify the same ontology slug before changing code.");
    expect(copied).toContain("## Agent handoff checks");
    expect(copied).toContain('1. query_ontology({"operation":"agent_brief"})');
    expect(copied).toContain('2. query_ontology({"operation":"workspace_brief"})');
    expect(copied).toContain('3. query_ontology({"operation":"health"})');
    expect(copied).toContain("CLI fallback:");
    expect(copied).toContain("- ontology-atlas agent-brief docs/ontology --json");
    expect(copied).toContain("- ontology-atlas health docs/ontology");
  });

  it("keeps the default meaning gate focused on choosing a concept instead of showing every reading step", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <OntologyMeaningGateStrip
          domainCount={6}
          capabilityCount={33}
          elementCount={56}
          relationCount={368}
          coreDomains={[
            { id: "domain:views", title: "Views", capabilityCount: 16 },
            { id: "domain:ai-agent-partner", title: "AI Agent Partner", capabilityCount: 9 },
          ]}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "먼저 도메인을 고르세요." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Views/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /AI Agent Partner/ })).toBeInTheDocument();

    expect(screen.queryByText("비즈니스 결과")).not.toBeInTheDocument();
    expect(screen.queryByText("코드 근거를 승격하기 전에 의사결정")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "읽는 순서 보기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "확인 질문 보기" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "세부 내용 보기" })).toBeInTheDocument();
  });

  it("copies individual agent graph DB gate checks from the visible gate", async () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <OntologyMeaningGateStrip
          domainCount={6}
          capabilityCount={33}
          elementCount={56}
          relationCount={368}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "세부 내용 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "health 실행 점검 복사" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('query_ontology({"operation":"health"})'),
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "health 실행 점검 복사됨" })).toBeInTheDocument();
    });
    const copiedHealthGate = vi.mocked(navigator.clipboard.writeText).mock.calls.at(-1)?.[0] ?? "";
    expect(copiedHealthGate).toContain("# AI agent graph verification: health");
    expect(copiedHealthGate).toContain("- MCP: query_ontology({\"operation\":\"health\"})");
    expect(copiedHealthGate).toContain("- CLI fallback: ontology-atlas health docs/ontology");
    expect(copiedHealthGate).toContain("- Why: 소유, 포함, 관계 어긋남이 있으면 수정 전 멈춥니다.");
  });

  it("copies an individual business graph DB query from the meaning gate", async () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <OntologyMeaningGateStrip
          domainCount={6}
          capabilityCount={33}
          elementCount={56}
          relationCount={368}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "세부 내용 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "경로 질의 복사" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("# Business graph DB query: path"),
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "경로 질의 복사됨" })).toBeInTheDocument();
    });
    const copiedQuery = vi.mocked(navigator.clipboard.writeText).mock.calls.at(-1)?.[0] ?? "";
    expect(copiedQuery).toContain("- MCP: query_ontology({\"operation\":\"query_plan\",\"targetOperation\":\"all_paths\"}) → query_ontology({\"operation\":\"all_paths\",\"limit\":5})");
    expect(copiedQuery).toContain("- CLI fallback: ontology-atlas all-paths docs/ontology --plan --limit 5");
    expect(copiedQuery).toContain("- Evidence to report: evidence.pathsComplete가 true인지 확인하고 불완전하면 결정을 보류합니다.");
    expect(copiedQuery).toContain("- Evidence rule: Report query_plan first and do not treat paths as complete proof unless evidence.pathsComplete is true.");
  });

  it("copies a business decision question as an ontology evidence prompt", async () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <OntologyMeaningGateStrip
          domainCount={6}
          capabilityCount={33}
          elementCount={56}
          relationCount={368}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "세부 내용 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "Q2 결정 질문 복사" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("# Ontology decision question: boundary"),
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Q2 결정 질문 복사됨" })).toBeInTheDocument();
    });
    const copiedQuestion = vi.mocked(navigator.clipboard.writeText).mock.calls.at(-1)?.[0] ?? "";
    expect(copiedQuestion).toContain("- Question: 어떤 business/product 경계가 이 결정을 소유하는가?");
    expect(copiedQuestion).toContain("- MCP: query_ontology({\"operation\":\"match_nodes\",\"kind\":\"domain\",\"limit\":10})");
    expect(copiedQuestion).toContain("- CLI fallback: ontology-atlas match-nodes docs/ontology --kind domain --limit 10");
    expect(copiedQuestion).toContain(
      "- Guardrail: Treat paths, APIs, routes, and commands as implementation evidence until the business outcome is clear.",
    );
  });

  it("uses a centered modal workbench instead of a narrow desktop right rail", () => {
    renderPanel();

    const dialog = screen.getByRole("dialog", { name: /ontology-atlas/ });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveClass("w-[min(96rem,calc(100vw-1rem))]");
    expect(dialog).toHaveClass("h-[min(56rem,calc(100dvh-1rem))]");
    expect(dialog).toHaveClass("overflow-hidden");
    expect(dialog).not.toHaveClass("md:right-6");
    expect(dialog).not.toHaveClass("md:w-[360px]");
    expect(screen.getByTestId("ontology-node-detail-backdrop")).toBeInTheDocument();
    expect(screen.getByTestId("ontology-node-detail-scroll")).toHaveClass("overflow-hidden");
    expect(screen.getByRole("button", { name: "닫기" })).toHaveClass("h-9");
    expect(screen.getByRole("button", { name: "닫기" })).toHaveTextContent("닫기");
    expect(screen.getByRole("link", { name: "의미 지도로 돌아가기" })).toHaveClass("h-9");
    expect(screen.getByRole("link", { name: "의미 지도로 돌아가기" })).toHaveAttribute(
      "href",
      "/ontology/",
    );
    expect(
      screen.getByText(/이 개념이 왜 필요한지, 어떤 관계와 근거로 설명되는지/),
    ).toBeInTheDocument();
  });

  it("mounts the detail workbench through a body portal so page layout cannot turn it into an inline rail", () => {
    renderPanel();

    expect(screen.getByTestId("ontology-node-detail-backdrop").parentElement).toBe(
      document.body,
    );
  });

  it("exposes an internal navigation rail for the modal sections", () => {
    renderPanel();

    const nav = screen.getByRole("tablist", { name: "개념 상세 섹션" });
    expect(nav).toHaveTextContent("개요");
    expect(nav).toHaveTextContent("관계");
    expect(nav).not.toHaveTextContent("Agent");
    expect(nav).not.toHaveTextContent("검토");
    expect(screen.getByRole("tab", { name: /개요/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /관계/ })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    const advancedToggle = screen.getByRole("button", { name: "검증 도구 보기" });
    expect(advancedToggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(advancedToggle);
    expect(advancedToggle).toHaveAttribute("aria-expanded", "true");
    expect(nav).toHaveTextContent("Agent");
    expect(nav).toHaveTextContent("검토");
    expect(screen.getByRole("tabpanel", { name: /개요/ })).toBeInTheDocument();
  });

  it("lays out the concept detail as a wide-screen LNB workbench with a large reading pane", () => {
    renderPanel();

    const scrollShell = screen.getByTestId("ontology-node-detail-scroll");
    expect(scrollShell).toHaveClass("md:grid-cols-[15rem_minmax(0,1fr)]");
    expect(scrollShell).toHaveClass("lg:grid-cols-[17rem_minmax(0,1fr)]");
    expect(scrollShell).toHaveClass("xl:grid-cols-[19rem_minmax(0,1fr)]");
    expect(scrollShell).toHaveClass("overflow-hidden");

    const shell = screen.getByTestId("ontology-node-detail-workbench");
    expect(shell).not.toHaveClass("md:grid-cols-[248px_minmax(0,1fr)]");
    expect(shell).toHaveClass("contents");

    const nav = screen.getByRole("tablist", { name: "개념 상세 섹션" });
    expect(nav).toHaveAttribute("data-layout", "lnb");
    expect(nav).toHaveClass("overflow-x-auto");
    expect(nav).toHaveClass("md:flex-col");
    expect(nav).toHaveTextContent("의미와 핵심 정보");
    expect(nav).not.toHaveTextContent("MCP 검증 묶음");
    expect(screen.getByRole("tab", { name: /개요/ })).toHaveClass("md:min-h-[4.75rem]");
    expect(screen.getByTestId("ontology-node-detail-lnb-summary")).toHaveTextContent(
      "선택 개념",
    );
    expect(screen.getByTestId("ontology-node-detail-lnb-summary")).toHaveClass("md:block");
    expect(screen.getByTestId("ontology-node-detail-lnb-summary")).toHaveTextContent(
      "ontology-atlas",
    );
    expect(screen.getByTestId("ontology-node-detail-lnb-summary")).toHaveTextContent(
      "나감 0 · 들어옴 0",
    );

    const readingPane = screen.getByTestId("ontology-node-detail-reading-pane");
    expect(readingPane).toHaveClass("overflow-y-auto");
    expect(readingPane).toHaveClass("rounded-xl");
    expect(readingPane).toHaveClass("text-base");
    expect(readingPane).toHaveClass("md:text-lg");
    expect(readingPane).not.toHaveClass("md:px-6");

    expect(screen.getByRole("button", { name: "분류 기준 보기" })).toBeInTheDocument();
    expect(screen.queryByTestId("ontology-kind-decision-card")).not.toBeInTheDocument();
    expect(readingPane).not.toHaveTextContent("경로만 있으면 element");

    const header = screen.getByTestId("ontology-node-detail-header");
    expect(header).toHaveTextContent(
      "이 개념이 왜 필요한지, 어떤 관계와 근거로 설명되는지 확인합니다.",
    );
    expect(header).not.toHaveTextContent("agent");
    expect(header).not.toHaveTextContent("MCP");
    expect(screen.queryByLabelText("연결·검증 열기")).not.toBeInTheDocument();

    const nextActions = screen.getByRole("navigation", { name: "선택 개념 다음 작업" });
    expect(nextActions).toHaveTextContent("다음 작업");
    expect(nextActions).toHaveTextContent("관계 보기");
    expect(nextActions).toHaveTextContent("관계 고치기");
    expect(nextActions).toHaveTextContent("그래프 검증");
    expect(screen.getByRole("link", { name: "관계 보기" })).toHaveAttribute(
      "href",
      "/topology/?mode=focus&p=project%3Aontology-atlas",
    );
    expect(screen.getByRole("link", { name: "관계 고치기" })).toHaveAttribute(
      "href",
      "/ontology/edit/?node=ontology-atlas",
    );
    expect(screen.getByRole("link", { name: "그래프 검증" })).toHaveAttribute(
      "href",
      "/ontology/insights/?node=ontology-atlas",
    );
    expect(screen.queryByLabelText("그래프 검증 열기")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "분류 기준 보기" }));

    const decisionCard = screen.getByTestId("ontology-kind-decision-card");
    expect(decisionCard).toHaveTextContent("분류 기준");
    expect(decisionCard).toHaveTextContent("전체 제품 또는 시스템 범위");
    expect(decisionCard).toHaveTextContent("경로만 있으면 element");
    expect(decisionCard).toHaveAttribute("data-kind-tone", "indigo");
    expect(decisionCard).toHaveAttribute("data-kind-fill", "rgba(126, 134, 216, 0.94)");
    expect(decisionCard.className).not.toMatch(/\bborder-l/);
    expect(decisionCard).toHaveClass("bg-[color:var(--color-overlay-1)]");
    expect(decisionCard).not.toHaveStyle({
      borderLeftColor: "rgba(126, 134, 216, 0.88)",
    });
    const decisionMarker = screen.getByTestId("ontology-kind-decision-marker");
    expect(decisionMarker).toHaveTextContent("프로젝트");
    expect(decisionMarker).toHaveClass("border-[color:var(--color-border-soft)]");
    expect(decisionMarker).toHaveClass("bg-[color:var(--color-panel)]");
    const decisionSwatch = screen.getByTestId("ontology-kind-decision-swatch");
    expect(decisionSwatch).toHaveStyle({
      borderColor: "rgba(126, 134, 216, 0.46)",
    });
    expect(decisionSwatch).toHaveClass("bg-transparent");
    expect(screen.queryByTestId("ontology-kind-decision-stripe")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ontology-signal-rail")).not.toBeInTheDocument();
  });

  it("shows one purpose-built section at a time instead of stacking every panel", () => {
    renderPanel();

    expect(screen.getByTestId("ontology-node-detail-section-overview")).not.toHaveAttribute(
      "hidden",
    );
    expect(screen.getByTestId("ontology-node-detail-section-relations")).toHaveAttribute(
      "hidden",
    );
    expect(screen.getByTestId("ontology-node-detail-section-agent")).toHaveAttribute("hidden");
    expect(screen.getByTestId("ontology-node-detail-section-review")).toHaveAttribute("hidden");

    fireEvent.click(screen.getByRole("tab", { name: /관계/ }));

    expect(screen.getByRole("tab", { name: /관계/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("ontology-node-detail-section-overview")).toHaveAttribute(
      "hidden",
    );
    expect(screen.getByTestId("ontology-node-detail-section-relations")).not.toHaveAttribute(
      "hidden",
    );
  });
});

describe("OntologyCommandBarHeader", () => {
  it("keeps raw graph-size counts out of visible and accessibility header chrome", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <OntologyCommandBarHeader />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("온톨로지")).toBeInTheDocument();
    expect(
      screen.getByText("개념을 선택하면 의미 · 관계 · 구현 근거가 열립니다"),
    ).toBeInTheDocument();
    expect(screen.queryByText("원천 102개 · 계층 행 283개 · 전체 관계 496개")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/원천 102개 · 계층 행 283개 · 전체 관계 496개/)).not.toBeInTheDocument();
    expect(screen.getByText("온톨로지").closest("div")).not.toHaveAttribute("title");
  });
});

describe("TreeProjectionWarnings disclosure", () => {
  it("keeps projection details behind one compact relation summary control", () => {
    const projectionBody =
      "개념 지도는 한 개념당 대표 project → domain → capability → element 경로만 계층선으로 그립니다. 여러 부모, 순환, 중복 도달까지 모두 선으로 그리면 읽기 어려워서, 나머지 관계는 접어두고 그래프 검증과 관계 편집에서 확인하게 둡니다.";

    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <TreeProjectionWarnings
          warnings={[
            'multiple parents for "domain:views"',
            'cycle detected at "capability:mcp-server"',
            'reached twice "element:operations-nav"',
            'self-parent "domain:views"',
          ]}
          open={false}
          activeTab="summary"
          onOpenSummary={() => {}}
          onClose={() => {}}
          onTabChange={() => {}}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("button", { name: "계층에 접은 관계 4건" })).toBeInTheDocument();
    expect(screen.queryByText("계층 지도에 접은 관계 4건")).not.toBeInTheDocument();
    expect(screen.queryByText("그래프 관계 · 검증 가능")).not.toBeInTheDocument();
    expect(screen.queryByText(projectionBody)).not.toBeInTheDocument();
  });
});

describe("OntologyMetaFooter", () => {
  it("does not repeat graph-size counts as visible or accessibility footer chrome", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <OntologyMetaFooter
          mode="local"
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("모드: 로컬 온톨로지 저장소")).toBeInTheDocument();
    expect(
      screen.queryByText("원천 개념 102 · 표시 행 283 · 관계 496"),
    ).not.toBeInTheDocument();
    const footer = screen.getByRole("contentinfo");
    expect(footer).not.toHaveAttribute("aria-label");
    expect(footer).not.toHaveAttribute("title");
  });
});
