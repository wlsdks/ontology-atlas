import { NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { TooltipProvider } from "@/shared/ui";
import { NodeDetailPanel, OntologyMeaningGateStrip } from "./OntologyViewPage";

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
        />
      </NextIntlClientProvider>,
    );

    const gate = screen.getByTestId("ontology-meaning-gate");
    expect(gate).toHaveAccessibleName("비즈니스 의미에서 구현 증거까지 읽는 온톨로지 게이트");
    expect(gate).toHaveTextContent("Meaning gate");
    expect(gate).toHaveTextContent("소스 파일 목록이 아니라");
    expect(gate).toHaveTextContent("비즈니스 언어");
    expect(gate).toHaveTextContent("도메인 6개");
    expect(gate).toHaveTextContent("제품 역량");
    expect(gate).toHaveTextContent("역량 33개");
    expect(gate).toHaveTextContent("구현 증거");
    expect(gate).toHaveTextContent("요소 56개 · 의미 관계 368개");
    expect(gate).toHaveTextContent("전체 의사결정 루프");
    expect(gate).toHaveClass("rounded-xl");
    expect(gate).toHaveClass("bg-[color:var(--color-overlay-1)]");
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
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "business-to-code brief 복사" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("# Ontology Atlas business-to-code brief"),
      );
    });
    const copied = vi.mocked(navigator.clipboard.writeText).mock.calls[0]?.[0] ?? "";
    expect(copied).toContain("- Audience: 기획자, 마케터, C-level, 개발자, AI agent");
    expect(copied).toContain("- Business language: 도메인 6개");
    expect(copied).toContain("- Product capability: 역량 33개");
    expect(copied).toContain("- Implementation proof: 요소 56개 · 의미 관계 368개");
    expect(copied).toContain("1. Open shared vocabulary hubs before writing a plan, campaign, or roadmap note.");
    expect(copied).toContain("3. Ask Claude Code / Codex to verify the same ontology slug before changing code.");
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
    expect(screen.getByRole("link", { name: "개념 보기로 돌아가기" })).toHaveClass("h-9");
    expect(screen.getByRole("link", { name: "개념 보기로 돌아가기" })).toHaveAttribute(
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
    expect(decisionCard).toHaveStyle({
      borderLeftColor: "rgba(126, 134, 216, 0.88)",
    });
    expect(screen.getByTestId("ontology-kind-decision-marker")).toHaveTextContent("프로젝트");
    expect(screen.getByTestId("ontology-kind-decision-stripe")).toHaveStyle({
      backgroundColor: "rgba(126, 134, 216, 0.88)",
    });
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
