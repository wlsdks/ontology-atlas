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
    expect(dialog).toHaveClass("md:max-w-[min(1280px,calc(100vw-3rem))]");
    expect(dialog).toHaveClass("overflow-hidden");
    expect(dialog).not.toHaveClass("md:right-6");
    expect(dialog).not.toHaveClass("md:w-[360px]");
    expect(screen.getByTestId("ontology-node-detail-backdrop")).toBeInTheDocument();
    expect(screen.getByTestId("ontology-node-detail-scroll")).toHaveClass("overflow-y-auto");
    expect(screen.getByRole("link", { name: "닫기" })).toHaveClass("h-11");
    expect(screen.getByRole("link", { name: "닫기" })).toHaveTextContent("닫기");
    expect(screen.getByRole("link", { name: "닫기" })).toHaveAttribute("href", "/ontology/");
    expect(screen.getByRole("link", { name: "개념 보기로 돌아가기" })).toHaveClass("h-10");
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

    const nav = screen.getByRole("navigation", { name: "개념 상세 섹션" });
    expect(nav).toHaveTextContent("개요");
    expect(nav).toHaveTextContent("관계");
    expect(nav).toHaveTextContent("Agent");
    expect(nav).toHaveTextContent("검토");
    expect(screen.getByRole("button", { name: /개요/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /관계/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("lays out the concept detail as a desktop LNB workbench with a large reading pane", () => {
    renderPanel();

    const shell = screen.getByTestId("ontology-node-detail-workbench");
    expect(shell).toHaveClass("md:grid-cols-[248px_minmax(0,1fr)]");
    expect(shell).toHaveClass("lg:grid-cols-[272px_minmax(0,1fr)]");
    expect(shell).toHaveClass("xl:grid-cols-[288px_minmax(0,1fr)]");

    const nav = screen.getByRole("navigation", { name: "개념 상세 섹션" });
    expect(nav).toHaveAttribute("data-layout", "lnb");
    expect(nav).toHaveClass("md:sticky");
    expect(nav).toHaveTextContent("의미와 핵심 정보");
    expect(nav).toHaveTextContent("MCP 검증 묶음");

    const readingPane = screen.getByTestId("ontology-node-detail-reading-pane");
    expect(readingPane).toHaveClass("text-lg");
    expect(readingPane).toHaveClass("md:text-[18px]");
    expect(readingPane).toHaveClass("md:px-6");
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

    fireEvent.click(screen.getByRole("button", { name: /관계/ }));

    expect(screen.getByRole("button", { name: /관계/ })).toHaveAttribute(
      "aria-pressed",
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
