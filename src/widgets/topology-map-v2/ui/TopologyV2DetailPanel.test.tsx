import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { TopologyV2DetailPanel } from "./TopologyV2DetailPanel";

// `@/i18n/navigation`'s Link wraps next-intl's `createNavigation`, which
// pulls in `next/navigation` — unresolvable under vitest's module graph in
// this repo (established pattern, see `DocsVaultViewer.test.tsx`). Mocked to
// a plain anchor so href/click assertions still work.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const labels = {
  kindLabel: "Domain",
  domainLabel: "domain",
  poweredOn: "fresh",
  poweredOff: "idle",
  metricContains: "contains",
  metricUsedBy: "used by",
  metricDependsOn: "leans on",
  metricEvidence: "evidence",
  noConnections: "no direct connections",
  handoff: "Copy next action",
  close: "Close",
  openFullDetail: "Full detail →",
  actionsGroupLabel: "Node actions",
  actionDocument: "Document",
  actionEditRelations: "Edit relations",
  actionCopyHandoff: "Copy handoff",
  actionPath: "Path",
};

function renderPanel(
  onOpenFullDetail?: () => void,
  evidence: { rows: { id: string; title: string; path: string | null }[]; total: number } = {
    rows: [],
    total: 0,
  },
  overrides: {
    documentHref?: string | null;
    onCopyHandoff?: () => void;
    onSetPathSource?: () => void;
    domain?: { id: string; title: string } | null;
    onSelectConnection?: (id: string) => void;
  } = {},
) {
  render(
    <TopologyV2DetailPanel
      slug="domains/views"
      title="Views"
      kind="domain"
      domain={overrides.domain !== undefined ? overrides.domain : null}
      powered={false}
      metric={{ contains: 0, usedBy: 1, dependsOn: 2, evidence: evidence.total }}
      groups={{
        contains: { rows: [], total: 0 },
        usedBy: { rows: [], total: 1 },
        dependsOn: { rows: [], total: 2 },
        belongsTo: { rows: [], total: 0 },
      }}
      evidence={evidence}
      handoffText="node: domains/views"
      documentHref={
        overrides.documentHref !== undefined
          ? overrides.documentHref
          : "/docs/domains/views"
      }
      builderEditHref="/ontology/edit/?node=domains%2Fviews"
      labels={labels}
      onSelectConnection={overrides.onSelectConnection ?? (() => {})}
      onCopyHandoff={overrides.onCopyHandoff ?? (() => {})}
      onClose={() => {}}
      onSetPathSource={overrides.onSetPathSource ?? (() => {})}
      onOpenFullDetail={onOpenFullDetail}
    />,
  );
}

describe("TopologyV2DetailPanel — full-detail A1 opt-in link", () => {
  it("renders the '전체 상세 →' link when onOpenFullDetail is provided", () => {
    const onOpenFullDetail = vi.fn();
    renderPanel(onOpenFullDetail);
    fireEvent.click(screen.getByTestId("topology-v2-detail-panel-open-full-detail"));
    expect(onOpenFullDetail).toHaveBeenCalledTimes(1);
  });

  it("hides the link when onOpenFullDetail is omitted", () => {
    renderPanel(undefined);
    expect(
      screen.queryByTestId("topology-v2-detail-panel-open-full-detail"),
    ).not.toBeInTheDocument();
  });
});

describe("TopologyV2DetailPanel — 근거(evidence) group promotion (RATIO-SYSTEM §4)", () => {
  it("renders an evidence group with its row's title/path when evidence rows exist", () => {
    renderPanel(undefined, {
      rows: [{ id: "capabilities/product-owner-operating-system", title: "product-owner-operating-system", path: "capabilities/" }],
      total: 1,
    });
    const group = screen.getByText("evidence").closest("[data-datasheet-group='evidence']");
    expect(group).not.toBeNull();
    expect(screen.getByText("product-owner-operating-system")).toBeInTheDocument();
    expect(screen.getByText("capabilities/")).toBeInTheDocument();
  });

  it("does not render the evidence group when there are no evidence rows", () => {
    renderPanel(undefined, { rows: [], total: 0 });
    expect(document.querySelector("[data-datasheet-group='evidence']")).toBeNull();
  });

  it("renders each evidence row as a link to its vault document", () => {
    renderPanel(undefined, {
      rows: [{ id: "capabilities/product-owner-operating-system", title: "product-owner-operating-system", path: "capabilities/" }],
      total: 1,
    });
    const link = screen.getByText("product-owner-operating-system").closest("a");
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("product-owner-operating-system"),
    );
  });
});

describe("TopologyV2DetailPanel — M-2 typed containment split", () => {
  it("renders a 담는 것(contains) group with the parent's children (not folded into 기대는 곳)", () => {
    render(
      <TopologyV2DetailPanel
        slug="domains/ai-agent-partner"
        title="AI Agent Partner"
        kind="domain"
        domain={null}
        powered={false}
        metric={{ contains: 2, usedBy: 1, dependsOn: 0, evidence: 0 }}
        groups={{
          contains: {
            rows: [
              { id: "capability:mcp-server", title: "MCP Server", kind: "capability", relationType: "contains", direction: "outgoing" },
              { id: "capability:agent-config", title: "Agent Config", kind: "capability", relationType: "contains", direction: "outgoing" },
            ],
            total: 2,
          },
          usedBy: {
            rows: [
              { id: "capability:x", title: "Consumer X", kind: "capability", relationType: "depends_on", direction: "incoming" },
            ],
            total: 1,
          },
          dependsOn: { rows: [], total: 0 },
          belongsTo: { rows: [], total: 0 },
        }}
        evidence={{ rows: [], total: 0 }}
        handoffText="node: domains/ai-agent-partner"
        documentHref={null}
        builderEditHref="/ontology/edit/?node=domains%2Fai-agent-partner"
        labels={labels}
        onSelectConnection={() => {}}
        onCopyHandoff={() => {}}
        onClose={() => {}}
        onSetPathSource={() => {}}
      />,
    );
    // the contains group exists and holds the contained capabilities
    const group = document.querySelector("[data-datasheet-group='contains']");
    expect(group).not.toBeNull();
    expect(screen.getByText("MCP Server")).toBeInTheDocument();
    expect(screen.getByText("Agent Config")).toBeInTheDocument();
    // the metric line leads with the "contains" typed segment
    const metric = screen.getByTestId("topology-v2-detail-panel").querySelector("[data-datasheet-metric='engraved']");
    expect(metric?.textContent).toContain("contains 2");
  });

  it("omits the 담는 것 segment + group for a leaf node (contains 0)", () => {
    renderPanel();
    expect(document.querySelector("[data-datasheet-group='contains']")).toBeNull();
    const metric = screen.getByTestId("topology-v2-detail-panel").querySelector("[data-datasheet-metric='engraved']");
    expect(metric?.textContent).not.toContain("contains");
  });
});

describe("TopologyV2DetailPanel — N6 소속 도메인 1급 사실", () => {
  it("renders a 도메인 · <이름> fact in the header when the node has an owning domain", () => {
    renderPanel(undefined, undefined, {
      domain: { id: "domains/ai-agent-partner", title: "AI Agent Partner" },
    });
    const fact = screen.getByTestId("topology-v2-detail-panel-domain");
    expect(fact).toHaveTextContent("domain");
    expect(fact).toHaveTextContent("AI Agent Partner");
  });

  it("hides the domain fact when the node has no owning domain", () => {
    renderPanel(undefined, undefined, { domain: null });
    expect(screen.queryByTestId("topology-v2-detail-panel-domain")).not.toBeInTheDocument();
  });

  it("focuses the domain via onSelectConnection when the domain fact is clicked", () => {
    const onSelectConnection = vi.fn();
    renderPanel(undefined, undefined, {
      domain: { id: "domains/ai-agent-partner", title: "AI Agent Partner" },
      onSelectConnection,
    });
    fireEvent.click(screen.getByTestId("topology-v2-detail-panel-domain"));
    expect(onSelectConnection).toHaveBeenCalledWith("domains/ai-agent-partner");
  });
});

describe("TopologyV2DetailPanel — W2-A action row", () => {
  it("links the 문서 tile to the document href when the node has a backing doc", () => {
    renderPanel(undefined, undefined, { documentHref: "/docs/domains/views" });
    const link = screen.getByTestId("topology-v2-detail-panel-action-document");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", expect.stringContaining("/docs/domains/views"));
  });

  it("disables the 문서 tile when the node has no sourceSlug/document href", () => {
    renderPanel(undefined, undefined, { documentHref: null });
    const tile = screen.getByTestId("topology-v2-detail-panel-action-document");
    expect(tile.tagName).not.toBe("A");
    expect(tile).toHaveAttribute("aria-disabled", "true");
  });

  it("links the 관계 편집 tile to the builder deep link", () => {
    renderPanel();
    const link = screen.getByTestId("topology-v2-detail-panel-action-edit");
    expect(link).toHaveAttribute("href", expect.stringContaining("/ontology/edit/"));
  });

  it("copies the handoff text when the 인계 복사 tile is clicked", () => {
    const onCopyHandoff = vi.fn();
    renderPanel(undefined, undefined, { onCopyHandoff });
    fireEvent.click(screen.getByTestId("topology-v2-detail-panel-action-handoff"));
    expect(onCopyHandoff).toHaveBeenCalledWith("node: domains/views");
  });

  it("calls onSetPathSource when the 경로 tile is clicked", () => {
    const onSetPathSource = vi.fn();
    renderPanel(undefined, undefined, { onSetPathSource });
    fireEvent.click(screen.getByTestId("topology-v2-detail-panel-action-path"));
    expect(onSetPathSource).toHaveBeenCalledTimes(1);
  });

  it("no longer renders a duplicate handoff button in the footer", () => {
    renderPanel();
    expect(
      screen.queryByTestId("topology-v2-detail-panel-handoff"),
    ).not.toBeInTheDocument();
  });
});
