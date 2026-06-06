import { NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { TooltipProvider } from "@/shared/ui";
import { NodeDetailPanel } from "./OntologyViewPage";

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
  it("uses a centered modal workbench instead of a narrow desktop right rail", () => {
    renderPanel();

    const dialog = screen.getByRole("dialog", { name: /ontology-atlas/ });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveClass("w-[min(72rem,calc(100vw-1.5rem))]");
    expect(dialog).toHaveClass("h-[min(46rem,calc(100dvh-1.5rem))]");
    expect(dialog).toHaveClass("overflow-hidden");
    expect(dialog).not.toHaveClass("md:right-6");
    expect(dialog).not.toHaveClass("md:w-[360px]");
    expect(screen.getByTestId("ontology-node-detail-backdrop")).toBeInTheDocument();
    expect(screen.getByTestId("ontology-node-detail-scroll")).toHaveClass("overflow-hidden");
    expect(screen.getByRole("button", { name: "닫기" })).toHaveClass("h-8");
    expect(screen.getByRole("button", { name: "닫기" })).toHaveTextContent("닫기");
    expect(screen.getByRole("link", { name: "개념 보기로 돌아가기" })).toHaveClass("h-8");
    expect(screen.getByRole("link", { name: "개념 보기로 돌아가기" })).toHaveAttribute(
      "href",
      "/ontology/",
    );
    expect(
      screen.getByText(/선택한 개념이 왜 필요한지/),
    ).toBeInTheDocument();
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
    expect(scrollShell).toHaveClass("lg:grid-cols-[13.5rem_minmax(0,1fr)]");
    expect(scrollShell).toHaveClass("xl:grid-cols-[15rem_minmax(0,1fr)]");
    expect(scrollShell).toHaveClass("overflow-hidden");

    const shell = screen.getByTestId("ontology-node-detail-workbench");
    expect(shell).not.toHaveClass("md:grid-cols-[248px_minmax(0,1fr)]");
    expect(shell).toHaveClass("contents");

    const nav = screen.getByRole("tablist", { name: "개념 상세 섹션" });
    expect(nav).toHaveAttribute("data-layout", "lnb");
    expect(nav).toHaveClass("overflow-x-auto");
    expect(nav).toHaveClass("lg:flex-col");
    expect(nav).toHaveTextContent("의미와 핵심 정보");
    expect(nav).toHaveTextContent("MCP 검증 묶음");

    const readingPane = screen.getByTestId("ontology-node-detail-reading-pane");
    expect(readingPane).toHaveClass("overflow-y-auto");
    expect(readingPane).toHaveClass("rounded-xl");
    expect(readingPane).toHaveClass("text-base");
    expect(readingPane).toHaveClass("md:text-[17px]");
    expect(readingPane).not.toHaveClass("md:px-6");

    const decisionCard = screen.getByTestId("ontology-kind-decision-card");
    expect(decisionCard).toHaveTextContent("분류 기준");
    expect(decisionCard).toHaveTextContent("전체 제품 또는 시스템 범위");
    expect(decisionCard).toHaveTextContent("경로만 있으면 element");
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
