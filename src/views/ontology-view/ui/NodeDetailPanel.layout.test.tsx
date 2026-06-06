import { NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { TooltipProvider } from "@/shared/ui";
import { NodeDetailPanel, OntologyMeaningGateStrip } from "./OntologyViewPage";
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
    expect(gate).toHaveTextContent("도메인에서 시작해 역량과 구현 증거까지 내려갑니다");
    expect(gate).toHaveTextContent("같은 slug로 의미, 관계, 구현 근거, MCP 검증까지 이어집니다");
    expect(screen.getByRole("list", { name: "온톨로지 읽는 순서" })).toBeInTheDocument();
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
    expect(gate).not.toHaveTextContent("Meaning gate");
    expect(gate).not.toHaveTextContent("reader lanes");
    expect(gate).not.toHaveTextContent("Wedge");
    expect(gate).toHaveTextContent("먼저 볼 도메인");
    expect(gate).toHaveTextContent("Views");
    expect(gate).toHaveTextContent("역량 16개");
    expect(screen.getByRole("list", { name: "비즈니스 결정 질문" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "비즈니스 결정 질문" })).toHaveAttribute(
      "data-reader-decision-lens",
      "planning>marketing>leadership>developer>agent",
    );
    expect(screen.getByRole("list", { name: "Agent graph DB 검증 게이트" })).toHaveAttribute(
      "data-agent-graph-db-gate",
      "agent_brief>workspace_brief>health",
    );
    expect(gate).toHaveTextContent("Agent graph DB gate");
    expect(gate).toHaveTextContent("agent_brief");
    expect(gate).toHaveTextContent("workspace_brief");
    expect(gate).toHaveTextContent("health");
    expect(gate).toHaveTextContent("AI agent가 같은 ontology graph를 읽고, drift를 검증한 뒤, 변경을 제안합니다.");
    expect(gate).toHaveTextContent("누가 이 개념으로 결정을 내리는가?");
    expect(gate).toHaveTextContent("어떤 사용자·운영 결과를 바꾸는가?");
    expect(gate).toHaveTextContent("어떤 구현 증거가 그 의미를 검증하는가?");
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

    const copyButton = screen.getByRole("button", { name: "브리핑 복사" });
    expect(copyButton).toHaveAccessibleDescription(
      "도메인, 역량, 구현 증거 요약과 agent_brief, workspace_brief, health 실행 점검을 함께 복사합니다.",
    );

    fireEvent.click(screen.getByRole("button", { name: "브리핑 복사" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("# Ontology Atlas business-to-code brief"),
      );
    });
    const copied = vi.mocked(navigator.clipboard.writeText).mock.calls[0]?.[0] ?? "";
    expect(copied).toContain("- Audience: 기획자, 마케터, C-level, 개발자, AI agent");
    expect(copied).toContain("- Ontology read order: domain → capability → element");
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
    expect(copied).toContain("1. 누가 이 개념으로 결정을 내리는가?");
    expect(copied).toContain("2. 어떤 사용자·운영 결과를 바꾸는가?");
    expect(copied).toContain("3. 어떤 구현 증거가 그 의미를 검증하는가?");
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
      screen.getByText(/선택한 개념이 왜 필요한지/),
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
    expect(nav).toHaveTextContent("Agent");
    expect(nav).toHaveTextContent("검토");
    expect(screen.getByRole("tab", { name: /개요/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /관계/ })).toHaveAttribute(
      "aria-selected",
      "false",
    );
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
    expect(nav).toHaveTextContent("MCP 검증 묶음");
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
