import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
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
    expect(dialog).toHaveClass("md:max-w-6xl");
    expect(dialog).toHaveClass("overflow-hidden");
    expect(dialog).not.toHaveClass("md:right-6");
    expect(dialog).not.toHaveClass("md:w-[360px]");
    expect(screen.getByTestId("ontology-node-detail-backdrop")).toBeInTheDocument();
    expect(screen.getByTestId("ontology-node-detail-scroll")).toHaveClass("overflow-y-auto");
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
  });

  it("lays out the concept detail as a desktop LNB workbench with a large reading pane", () => {
    renderPanel();

    const shell = screen.getByTestId("ontology-node-detail-workbench");
    expect(shell).toHaveClass("lg:grid-cols-[260px_minmax(0,1fr)]");

    const nav = screen.getByRole("navigation", { name: "개념 상세 섹션" });
    expect(nav).toHaveAttribute("data-layout", "lnb");
    expect(nav).toHaveClass("lg:sticky");
    expect(nav).toHaveTextContent("의미와 핵심 정보");
    expect(nav).toHaveTextContent("MCP 검증 묶음");

    const readingPane = screen.getByTestId("ontology-node-detail-reading-pane");
    expect(readingPane).toHaveClass("text-[15px]");
    expect(readingPane).toHaveClass("md:text-base");
    expect(readingPane).toHaveClass("lg:px-6");
  });
});
