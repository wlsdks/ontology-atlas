import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildOntologyTree } from "@/shared/lib/ontology-tree";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { TopologyIndexPanel } from "./TopologyIndexPanel";

// TopologyIndexPanel's own tests exercise the tree/search/census — the
// root-first-open "시작하기" module it mounts at the top needs a
// LocalVaultProvider + i18n context it doesn't stand up here, and its
// visibility logic is unit-tested separately
// (`@/features/first-run-starter/ui/FirstRunStarterModule.test.tsx`). Stub
// it to a spy so this file can still assert it receives the right census
// props without pulling in vault/i18n providers.
const firstRunStarterProps = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/features/first-run-starter", () => ({
  FirstRunStarterModule: (props: unknown) => {
    firstRunStarterProps.current = props;
    return null;
  },
}));

function makeNode(id: string, kind: string, title?: string): KnowledgeGraphNode {
  return {
    id,
    title: title ?? id,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date("2026-04-27"),
    lastApprovedBy: "system",
  };
}

function makeEdge(id: string, from: string, to: string): KnowledgeGraphEdge {
  return {
    id,
    from,
    to,
    type: "contains",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date("2026-04-27"),
    lastApprovedBy: "system",
  };
}

const labels = {
  label: "Index",
  fold: "Collapse",
  foldAria: "Collapse INDEX",
  searchPlaceholder: "Search concepts",
  censusConcepts: "concepts",
  censusRelations: "relations",
  censusDomains: "domains",
  agentSync: "Agent sync",
  capabilitiesShort: "caps",
  elementsShort: "elems",
  domainCountTitle: "겹침 포함", freshTitle: "recently updated",
  emptyHint: "No matches",
  segmentAll: "All",
  segmentRecent: "Recent changes 0",
  segmentRecentAria: "Filter by recent changes",
  recentEmptyHint: "Nothing changed in the last 7 days",
  agentBadge: "Agent just now",
  uncatalogedDocsLabel: "0 docs not on the map",
  uncatalogedDocsAction: "Promote",
};

function buildFixtureTree() {
  const nodes = [
    makeNode("project:root", "project", "ontology-atlas"),
    makeNode("domain:onboarding", "domain", "Onboarding & UX"),
    makeNode("capability:mcp-server", "capability", "MCP Server"),
    makeNode("capability:cli-entry", "capability", "CLI Developer Entry"),
    makeNode("element:agent-brief", "element", "Agent Brief"),
  ];
  const edges = [
    makeEdge("e1", "project:root", "domain:onboarding"),
    makeEdge("e2", "domain:onboarding", "capability:mcp-server"),
    makeEdge("e3", "domain:onboarding", "capability:cli-entry"),
    makeEdge("e4", "capability:mcp-server", "element:agent-brief"),
  ];
  return buildOntologyTree(nodes, edges);
}

describe("TopologyIndexPanel", () => {
  it("renders the project root and reveals children on caret expand", () => {
    const treeResult = buildFixtureTree();
    render(
      <TopologyIndexPanel
        treeResult={treeResult}
        totalConcepts={4}
        totalRelations={3}
        domainCount={1}
        changedSlugs={new Set()}
        selectedId={null}
        onSelect={() => {}}
        onCollapse={() => {}}
        labels={labels}
      />,
    );

    expect(screen.getByText("ontology-atlas")).toBeInTheDocument();
    expect(screen.getByText("Onboarding & UX")).toBeInTheDocument();
    // capability is nested under a collapsed domain by default — not yet visible
    expect(screen.queryByText("MCP Server")).not.toBeInTheDocument();

    const domainRow = screen.getByText("Onboarding & UX").closest('[data-index-row]')!;
    fireEvent.click(domainRow.querySelector("button")!);
    expect(screen.getByText("MCP Server")).toBeInTheDocument();
  });

  it("collapses when any part of the header row is clicked, not just the chevron", () => {
    // Regression: the chevron used to be the only hit area for collapsing
    // INDEX. The whole header row is now the toggle (role=button via a real
    // <button>), so a click anywhere in it — including the label text far
    // from the chevron — must fire onCollapse.
    const onCollapse = vi.fn();
    const treeResult = buildFixtureTree();
    render(
      <TopologyIndexPanel
        treeResult={treeResult}
        totalConcepts={4}
        totalRelations={3}
        domainCount={1}
        changedSlugs={new Set()}
        selectedId={null}
        onSelect={() => {}}
        onCollapse={onCollapse}
        labels={labels}
      />,
    );

    const header = screen.getByTestId("topology-index-fold");
    expect(header.tagName).toBe("BUTTON");
    expect(header).toHaveAttribute("aria-expanded", "true");

    // Click the label span, not the chevron — proves the whole row is live.
    fireEvent.click(screen.getByText(labels.label));
    expect(onCollapse).toHaveBeenCalledTimes(1);

    fireEvent.click(header);
    expect(onCollapse).toHaveBeenCalledTimes(2);
  });

  it("calls onSelect with the node id when a row is clicked", () => {
    const onSelect = vi.fn();
    const treeResult = buildFixtureTree();
    render(
      <TopologyIndexPanel
        treeResult={treeResult}
        totalConcepts={4}
        totalRelations={3}
        domainCount={1}
        changedSlugs={new Set()}
        selectedId={null}
        onSelect={onSelect}
        onCollapse={() => {}}
        labels={labels}
      />,
    );

    fireEvent.click(screen.getByText("Onboarding & UX"));
    expect(onSelect).toHaveBeenCalledWith("domain:onboarding");
  });

  it("search narrows the tree and auto-reveals matches without manual expand", () => {
    const treeResult = buildFixtureTree();
    render(
      <TopologyIndexPanel
        treeResult={treeResult}
        totalConcepts={4}
        totalRelations={3}
        domainCount={1}
        changedSlugs={new Set()}
        selectedId={null}
        onSelect={() => {}}
        onCollapse={() => {}}
        labels={labels}
      />,
    );

    fireEvent.change(screen.getByTestId("topology-index-search"), {
      target: { value: "agent brief" },
    });

    // matched leaf + its ancestor chain (capability, domain) stay visible —
    // filterTreeByQuery's "keep ancestors" contract.
    expect(screen.getByText("Agent Brief")).toBeInTheDocument();
    expect(screen.getByText("MCP Server")).toBeInTheDocument();
    // sibling capability with no matching descendant is pruned out.
    expect(screen.queryByText("CLI Developer Entry")).not.toBeInTheDocument();
  });

  it("renders the census row with the same totals passed in", () => {
    const treeResult = buildFixtureTree();
    render(
      <TopologyIndexPanel
        treeResult={treeResult}
        totalConcepts={296}
        totalRelations={508}
        domainCount={6}
        changedSlugs={new Set()}
        selectedId={null}
        onSelect={() => {}}
        onCollapse={() => {}}
        labels={labels}
      />,
    );

    const census = screen.getByTestId("topology-index-census");
    expect(census).toHaveTextContent("296");
    expect(census).toHaveTextContent("508");
    expect(census).toHaveTextContent("6");
  });

  it("passes the same census totals through to the first-run starter module", () => {
    const treeResult = buildFixtureTree();
    render(
      <TopologyIndexPanel
        treeResult={treeResult}
        totalConcepts={102}
        totalRelations={478}
        domainCount={6}
        changedSlugs={new Set()}
        selectedId={null}
        onSelect={() => {}}
        onCollapse={() => {}}
        labels={labels}
      />,
    );

    expect(firstRunStarterProps.current).toEqual({
      concepts: 102,
      relations: 478,
      domains: 6,
    });
  });

  it("P4a: omitting recentChanges skips the segment control entirely", () => {
    render(
      <TopologyIndexPanel
        treeResult={buildFixtureTree()}
        totalConcepts={4}
        totalRelations={3}
        domainCount={1}
        changedSlugs={new Set()}
        selectedId={null}
        onSelect={() => {}}
        onCollapse={() => {}}
        labels={labels}
      />,
    );
    expect(screen.queryByTestId("topology-index-segment-recent")).not.toBeInTheDocument();
  });

  it("P4a: the recent-changes segment filters the tree to the given ids and keeps ancestor chains", () => {
    const treeResult = buildFixtureTree();
    render(
      <TopologyIndexPanel
        treeResult={treeResult}
        totalConcepts={4}
        totalRelations={3}
        domainCount={1}
        changedSlugs={new Set()}
        selectedId={null}
        onSelect={() => {}}
        onCollapse={() => {}}
        labels={labels}
        recentChanges={{ ids: new Set(["element:agent-brief"]), agentAttributedNodeId: null }}
      />,
    );

    fireEvent.click(screen.getByTestId("topology-index-segment-recent"));

    expect(screen.getByText("Agent Brief")).toBeInTheDocument();
    expect(screen.getByText("MCP Server")).toBeInTheDocument(); // ancestor chain preserved
    expect(screen.queryByText("CLI Developer Entry")).not.toBeInTheDocument(); // unrelated sibling pruned
  });

  it("P4a: switching back to 'all' restores the full tree", () => {
    const treeResult = buildFixtureTree();
    render(
      <TopologyIndexPanel
        treeResult={treeResult}
        totalConcepts={4}
        totalRelations={3}
        domainCount={1}
        changedSlugs={new Set()}
        selectedId={null}
        onSelect={() => {}}
        onCollapse={() => {}}
        labels={labels}
        recentChanges={{ ids: new Set(["element:agent-brief"]), agentAttributedNodeId: null }}
      />,
    );

    fireEvent.click(screen.getByTestId("topology-index-segment-recent"));
    fireEvent.click(screen.getByTestId("topology-index-segment-all"));

    expect(screen.queryByText("CLI Developer Entry")).not.toBeInTheDocument(); // still collapsed by default
    const domainRow = screen.getByText("Onboarding & UX").closest('[data-index-row]')!;
    fireEvent.click(domainRow.querySelector("button")!);
    expect(screen.getByText("CLI Developer Entry")).toBeInTheDocument();
  });

  it("P4a: an empty recent-changes lens shows the dedicated empty hint, not the search one", () => {
    render(
      <TopologyIndexPanel
        treeResult={buildFixtureTree()}
        totalConcepts={4}
        totalRelations={3}
        domainCount={1}
        changedSlugs={new Set()}
        selectedId={null}
        onSelect={() => {}}
        onCollapse={() => {}}
        labels={labels}
        recentChanges={{ ids: new Set(), agentAttributedNodeId: null }}
      />,
    );

    fireEvent.click(screen.getByTestId("topology-index-segment-recent"));
    expect(screen.getByText(labels.recentEmptyHint)).toBeInTheDocument();
  });

  it("P4b: renders the agent-attribution badge only on the matching row", () => {
    render(
      <TopologyIndexPanel
        treeResult={buildFixtureTree()}
        totalConcepts={4}
        totalRelations={3}
        domainCount={1}
        changedSlugs={new Set()}
        selectedId={null}
        onSelect={() => {}}
        onCollapse={() => {}}
        labels={labels}
        recentChanges={{
          ids: new Set(["capability:mcp-server"]),
          agentAttributedNodeId: "capability:mcp-server",
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("topology-index-segment-recent"));
    expect(screen.getAllByTestId("topology-index-agent-badge")).toHaveLength(1);
  });

  it("P4c: renders the uncataloged-docs row only when count > 0 and a handler is given", () => {
    const onPromote = vi.fn();
    const { rerender } = render(
      <TopologyIndexPanel
        treeResult={buildFixtureTree()}
        totalConcepts={4}
        totalRelations={3}
        domainCount={1}
        changedSlugs={new Set()}
        selectedId={null}
        onSelect={() => {}}
        onCollapse={() => {}}
        labels={labels}
        uncatalogedDocCount={0}
        onPromoteUncatalogedDocs={onPromote}
      />,
    );
    expect(screen.queryByTestId("topology-index-uncataloged-docs")).not.toBeInTheDocument();

    rerender(
      <TopologyIndexPanel
        treeResult={buildFixtureTree()}
        totalConcepts={4}
        totalRelations={3}
        domainCount={1}
        changedSlugs={new Set()}
        selectedId={null}
        onSelect={() => {}}
        onCollapse={() => {}}
        labels={labels}
        uncatalogedDocCount={3}
        onPromoteUncatalogedDocs={onPromote}
      />,
    );
    fireEvent.click(screen.getByTestId("topology-index-uncataloged-docs"));
    expect(onPromote).toHaveBeenCalledTimes(1);
  });

  it("수렴 스펙 ①: 헤더는 시각 카운트를 렌더하지 않는다 (지형도 HUD 와 3중 중복 해소, sr-only census 만 존치)", () => {
    render(
      <TopologyIndexPanel
        treeResult={buildFixtureTree()}
        totalConcepts={4}
        totalRelations={3}
        domainCount={1}
        changedSlugs={new Set()}
        selectedId={null}
        onSelect={() => {}}
        onCollapse={() => {}}
        labels={labels}
      />,
    );
    const fold = screen.getByTestId("topology-index-fold");
    expect(fold.textContent).not.toMatch(/\d/);
    // sr-only census 는 남아 있다
    expect(screen.getByTestId("topology-index-census")).toBeInTheDocument();
  });
});
