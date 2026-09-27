import {
  fireEvent,
  render,
  screen,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import type React from "react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { buildOntologyTree } from "@/entities/knowledge-graph/lib/ontology-tree";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { TopologyIndexPanel } from "./TopologyIndexPanel";

// `@/i18n/navigation`'s Link needs an IntlProvider this file does not set up, so it is a plain
// anchor. The rows read the screen's language through `shared/lib/latin-eyebrow`.
vi.mock("next-intl", () => ({
  useLocale: () => "ko",
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

// The first-run module needs vault and i18n providers and is tested in
// `FirstRunStarterModule.test.tsx`; stubbed to a spy that renders children, so this file checks
// INDEX alone and the props it passes.
const firstRunStarterProps = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/features/first-run-starter", () => ({
  FirstRunStarterModule: (props: { children?: React.ReactNode }) => {
    firstRunStarterProps.current = props;
    return <>{props.children}</>;
  },
}));

// The block import module is stubbed for the same reason (`BlockImportModule.test.tsx`).
const blockImportMounted = vi.hoisted(() => ({ current: 0 }));
vi.mock("@/features/ontology-blocks", () => ({
  BlockImportModule: () => {
    blockImportMounted.current += 1;
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
  sourceDocuments: "documents",
  sourceDocumentsPartialTitle: "partially read",
  censusRelations: "relations",
  censusDomains: "domains",
  capabilitiesShort: "caps",
  elementsShort: "elems",
  subcountsTitle: "caps: one thing a person can do · elems: the code that implements it",
  domainCountTitle: "겹침 포함", freshTitle: "recently updated",
  emptyHint: "No matches",
  segmentAll: "All",
  segmentRecent: "Recent changes 0",
  segmentRecentAria: "Filter by recent changes",
  recentEmptyHint: "Nothing changed in the last 7 days",
  agentBadge: "Agent just now",
  uncatalogedDocsLabel: "0 docs not on the map",
  uncatalogedDocsAction: "Promote",
  dustyNodesLabel: "0 nodes gathering dust",
  dustyNodesAction: "See freshness",
  brokenDocsLabel: "2 docs the checks caught",
  brokenDocsAction: "Open the library",
  sourceUnboundLabel: "1 project with no code folder",
  openedInsideLabel: 'opened-inside',
  openedInsideDismiss: 'opened-inside-dismiss',
  sourceUnboundAction: "Connect",
  tidyHeading: "To tidy",
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
  /*
   * One badge column, one meaning: the row's number is the map node's mark, counted from the same
   * domain census for every kind (`views/home/lib/map-adapter.ts`).
   */
  it("a project row counts everything below it, the same number its node carries", () => {
    const census = new Map([
      ["project:root", { id: "project:root", title: "ontology-atlas", capabilityCount: 2, elementCount: 1, total: 3 }],
      ["domain:onboarding", { id: "domain:onboarding", title: "Onboarding & UX", capabilityCount: 2, elementCount: 1, total: 3 }],
    ]);
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
        labels={{ ...labels, subtotalTitle: "하위 전체" }}
        domainCensus={census}
      />,
    );

    const projectRow = document.querySelector('[data-index-row="project:root"]')!;
    const badge = projectRow.querySelector('[data-testid="topology-index-row-count"]')!;
    // 1 would be the count of its direct children — the number the map never shows.
    expect(badge.textContent?.trim(), 'a project row must state the same count as the map node').toBe("3");
    expect(badge.getAttribute("title")).toBe("하위 전체 3");
  });

  it("falls back to the child count when no census reaches the row", () => {
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
    const projectRow = document.querySelector('[data-index-row="project:root"]')!;
    expect(projectRow.querySelector('[data-testid="topology-index-row-count"]')?.textContent?.trim()).toBe("1");
  });

  it("uses one tree role without conflicting navigation semantics", () => {
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

    const tree = screen.getByRole("tree", { name: labels.label });
    expect(tree.tagName).toBe("DIV");
  });

  /* After opening a folder the panel must name the folder that was read. */
  describe("naming the folder the rows came from", () => {
    const base = {
      treeResult: buildFixtureTree(),
      totalConcepts: 4,
      totalRelations: 3,
      domainCount: 1,
      changedSlugs: new Set<string>(),
      selectedId: null,
      onSelect: () => {},
      onCollapse: () => {},
      labels,
    };

    it("says the folder basename and how many documents came out of it", () => {
      render(<TopologyIndexPanel {...base} sourceName="my-vault" sourceDocumentCount={99} />);

      const line = screen.getByTestId("topology-index-source");
      expect(line).toHaveTextContent("my-vault");
      expect(line).toHaveTextContent("99 documents");
    });

    /*
     * `entities/docs-vault/model/types.ts`: a screen saying "N documents" must say in the same
     * place whether N is all of them.
     */
    it("marks a count the walk did not finish rather than presenting it as the whole folder", () => {
      render(
        <TopologyIndexPanel
          {...base}
          sourceName="huge-repo"
          sourceDocumentCount={500}
          sourceDocumentCountPartial
        />,
      );

      expect(screen.getByTestId("topology-index-source")).toHaveTextContent("500+ documents");
    });

    it("stays silent with no folder open — the sample keeps its own badge", () => {
      render(<TopologyIndexPanel {...base} />);

      expect(screen.queryByTestId("topology-index-source")).not.toBeInTheDocument();
    });

    it("names the folder even before the document count is known", () => {
      render(<TopologyIndexPanel {...base} sourceName="my-vault" sourceDocumentCount={null} />);

      const line = screen.getByTestId("topology-index-source");
      expect(line).toHaveTextContent("my-vault");
      expect(line, 'an unknown count must not be invented as 0').not.toHaveTextContent("documents");
    });
  });

  // The filter says which rows survived; the mark says where the query landed.
  it('marks where the typed text sits in the remaining rows', async () => {
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
    const search = screen.getByTestId("topology-index-search");
    fireEvent.change(search, { target: { value: "MCP" } });

    const row = await screen.findByText(
      (_, element) => element?.textContent === "MCP Server" && element.tagName === "SPAN",
    );
    const mark = row.querySelector("mark");
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe("MCP");
  });

  it('marks nothing for an empty query', () => {
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
    expect(document.querySelectorAll("mark")).toHaveLength(0);
  });

  it("does not render the retired agent/growth/handoff footer", () => {
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
    expect(screen.queryByTestId("topology-index-footer")).not.toBeInTheDocument();
  });

  it("opens newly loaded root rows so the INDEX does not stop at one project line", () => {
    const empty = buildOntologyTree([], []);
    const { rerender } = render(
      <TopologyIndexPanel
        treeResult={empty}
        totalConcepts={0}
        totalRelations={0}
        domainCount={0}
        changedSlugs={new Set()}
        selectedId={null}
        onSelect={() => {}}
        onCollapse={() => {}}
        labels={labels}
      />,
    );
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
      />,
    );
    expect(screen.getByText("Onboarding & UX")).toBeInTheDocument();
  });

  /** Block import is not in INDEX (it lives in settings); this stops one line from reviving it. */
  it('does not carry the block import module in INDEX', () => {
    blockImportMounted.current = 0;
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
    expect(blockImportMounted.current).toBe(0);
  });

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

  /**
   * A flat tree must state its shape: each treeitem carries aria-level, aria-posinset and
   * aria-setsize, since the hierarchy is only a left margin.
   */
  it("every row states its level and its place among its siblings", () => {
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

    const rowOf = (text: string) => screen.getByText(text).closest('[role="treeitem"]')!;
    const root = rowOf("ontology-atlas");
    expect(root.getAttribute("aria-level"), "root level").toBe("1");
    expect(root.getAttribute("aria-posinset")).toBe("1");
    expect(root.getAttribute("aria-setsize")).toBe("1");

    const withinSet = (row: Element, label: string) => {
      const pos = Number(row.getAttribute("aria-posinset"));
      const size = Number(row.getAttribute("aria-setsize"));
      expect(Number.isInteger(pos) && pos >= 1, `${label} position`).toBe(true);
      expect(pos, `${label} position within its set`).toBeLessThanOrEqual(size);
    };

    const domain = rowOf("Onboarding & UX");
    expect(domain.getAttribute("aria-level"), "a domain is one level in").toBe("2");
    withinSet(domain, "domain");

    fireEvent.click(domain.querySelector("button")!);
    const capability = rowOf("MCP Server");
    expect(capability.getAttribute("aria-level"), "a capability is two levels in").toBe("3");
    withinSet(capability, "capability");

    // No row is left silent about where it sits.
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[role="treeitem"]'));
    expect(rows.length).toBeGreaterThan(2);
    for (const row of rows) {
      const label = row.textContent?.slice(0, 16) ?? "";
      expect(Number(row.getAttribute("aria-level")), `level for ${label}`).toBeGreaterThanOrEqual(1);
      withinSet(row, label);
    }
  });

  it("INDEX tree is a single Tab stop — roving tabindex + Arrow/Home/End move the roving focus (P0)", () => {
    // WAI-ARIA `tree` has exactly one Tab entry point, with arrow keys walking siblings.
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

    const rowFor = (id: string) =>
      document.querySelector(`[data-index-row="${id}"]`) as HTMLElement;
    const rowsInDomOrder = () =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-index-row]"));
    const tabbableRows = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>('[data-index-row][tabindex="0"]'),
      );

    const project = rowFor("project:root");
    const domain = rowFor("domain:onboarding");

    // Exactly one Tab entry point, and it's the first row by default.
    expect(tabbableRows()).toEqual([project]);
    expect(domain).toHaveAttribute("tabindex", "-1");

    // ArrowDown rolls the single tabindex=0 onto the next visible sibling and
    fireEvent.keyDown(project, { key: "ArrowDown" });
    expect(document.activeElement).toBe(domain);
    expect(tabbableRows()).toEqual([domain]);

    // Expanding the domain adds child rows but MUST NOT add Tab stops.
    fireEvent.click(domain.querySelector("button")!);
    expect(rowFor("capability:mcp-server")).toBeInTheDocument();
    expect(rowFor("capability:cli-entry")).toBeInTheDocument();
    expect(tabbableRows()).toEqual([domain]);

    // ArrowDown from the domain lands on its first child (whatever the tree's
    const order = rowsInDomOrder();
    const firstChild = order[1 + 1]; // [project, domain, firstChild, ...]
    fireEvent.keyDown(domain, { key: "ArrowDown" });
    expect(document.activeElement).toBe(firstChild);

    // Home returns to the first row; End jumps to the last visible row.
    fireEvent.keyDown(firstChild, { key: "Home" });
    expect(document.activeElement).toBe(project);
    fireEvent.keyDown(project, { key: "End" });
    expect(document.activeElement).toBe(order[order.length - 1]);
  });

  it("collapses when any part of the header row is clicked, not just the chevron", () => {
    // The whole header row is the collapse toggle, not just the chevron.
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

    const search = screen.getByRole("textbox", { name: labels.searchPlaceholder });
    expect(search).toHaveAttribute("name", "topology-index-search");

    fireEvent.change(search, {
      target: { value: "agent brief" },
    });

    // matched leaf + its ancestor chain (capability, domain) stay visible —
    expect(screen.getByText("Agent Brief")).toBeInTheDocument();
    expect(screen.getByText("MCP Server")).toBeInTheDocument();
    // sibling capability with no matching descendant is pruned out.
    expect(screen.queryByText("CLI Developer Entry")).not.toBeInTheDocument();
  });

  it("M-10: Escape in the search field with a query clears it and stops the keypress (search-scoped, not a canvas deselect)", () => {
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

    const input = screen.getByTestId("topology-index-search") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "agent brief" } });
    expect(input.value).toBe("agent brief");
    // the filter is active — sibling with no match is pruned
    expect(screen.queryByText("CLI Developer Entry")).not.toBeInTheDocument();

    const windowHandler = vi.fn();
    window.addEventListener("keydown", windowHandler);
    const notPrevented = fireEvent.keyDown(input, { key: "Escape", bubbles: true });
    window.removeEventListener("keydown", windowHandler);

    // query cleared, filter released
    expect(input.value).toBe("");
    // the keypress was consumed — the window-level topology Esc ladder never sees it
    expect(windowHandler).not.toHaveBeenCalled();
    // fireEvent returns false when preventDefault was called
    expect(notPrevented).toBe(false);
  });

  it("M-10: Escape in an EMPTY search field is not consumed — it bubbles to the window ladder", () => {
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

    const input = screen.getByTestId("topology-index-search") as HTMLInputElement;
    const windowHandler = vi.fn();
    window.addEventListener("keydown", windowHandler);
    fireEvent.keyDown(input, { key: "Escape", bubbles: true });
    window.removeEventListener("keydown", windowHandler);

    // nothing to clear → the keypress reaches the window (the ladder can act)
    expect(windowHandler).toHaveBeenCalledTimes(1);
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

    expect(firstRunStarterProps.current).toMatchObject({
      concepts: 102,
      relations: 478,
      domains: 6,
      // Tour and plain-mode callbacks exist only when HomePage supplies them.
      onStartTour: undefined,
      onEnablePlainMode: undefined,
      audiencePlain: false,
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

  it("P4a: switching back to 'all' restores the full tree", async () => {
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

    // A collapsed branch unmounts after its disclosure transition (`.ai-row-disclosure`).
    await waitForElementToBeRemoved(() => screen.queryByText("CLI Developer Entry"));
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

  it("the tidy rows are one titled list that exists only while a row does", () => {
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
        vaultLoaded
      />,
    );
    expect(screen.queryByTestId("topology-index-tidy")).not.toBeInTheDocument();

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
        brokenDocCount={6}
        uncatalogedDocCount={1}
        onPromoteUncatalogedDocs={() => {}}
        vaultLoaded
      />,
    );
    const section = screen.getByTestId("topology-index-tidy");
    expect(section).toHaveAccessibleName(labels.tidyHeading);
    const rows = section.querySelectorAll("li");
    expect(rows).toHaveLength(2);
    expect(section.querySelector('[data-testid="topology-index-uncataloged-docs"]')).not.toBeNull();
    expect(section.querySelector('[data-testid="topology-index-broken-docs"]')).not.toBeNull();
    // One row grammar: every row wears the same classes.
    const classes = new Set([...section.querySelectorAll("a, button")].map((el) => el.className));
    expect(classes.size).toBe(1);
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

  it('does not render the visible count in the header, only the sr-only census', () => {
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
    // The sr-only census remains.
    expect(screen.getByTestId("topology-index-census")).toBeInTheDocument();
  });

  // Plain mode drops element rows, so a hint explains why a domain's counts exceed its visible
  // rows.
  describe('plainMode hint', () => {
    it("renders the quiet plain-mode hint when plainMode is true and the label is provided", () => {
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
          labels={{ ...labels, plainHint: "요소는 숨겨져 있어요" }}
          plainMode
        />,
      );
      expect(screen.getByTestId("topology-index-plain-hint")).toHaveTextContent(
        "요소는 숨겨져 있어요",
      );
    });

    it("does not render the hint in developer mode (plainMode omitted/false)", () => {
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
          labels={{ ...labels, plainHint: "요소는 숨겨져 있어요" }}
        />,
      );
      expect(screen.queryByTestId("topology-index-plain-hint")).not.toBeInTheDocument();
    });

    it("does not render the hint when plainMode is true but no label is given (backward-compat)", () => {
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
          plainMode
        />,
      );
      expect(screen.queryByTestId("topology-index-plain-hint")).not.toBeInTheDocument();
    });
  });

  // Maintenance rows are hidden in the static sample and shown with a vault (or when `vaultLoaded`
  // is omitted).
  describe('vault-connected gate for maintenance controls', () => {
    it("hides maintenance rows when vaultLoaded is false", () => {
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
          dustyNodeCount={51}
          uncatalogedDocCount={3}
          onPromoteUncatalogedDocs={() => {}}
          vaultLoaded={false}
        />,
      );
      expect(screen.queryByTestId("topology-index-dusty-nodes")).not.toBeInTheDocument();
      expect(screen.queryByTestId("topology-index-uncataloged-docs")).not.toBeInTheDocument();
    });

    it("shows maintenance rows once vaultLoaded is true", () => {
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
          dustyNodeCount={51}
          uncatalogedDocCount={3}
          onPromoteUncatalogedDocs={() => {}}
          vaultLoaded
        />,
      );
      expect(screen.getByTestId("topology-index-dusty-nodes")).toBeInTheDocument();
      expect(screen.getByTestId("topology-index-uncataloged-docs")).toBeInTheDocument();
    });

    /* The map's one quiet line for documents the checks caught. */
    it('tells the map about docs that failed checks and links to the docs', () => {
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
          brokenDocCount={2}
          vaultLoaded
        />,
      );
      const row = screen.getByTestId("topology-index-broken-docs");
      expect(row).toHaveTextContent("2 docs the checks caught");
      expect(row).toHaveAttribute("href", expect.stringContaining("/docs"));
    });

    it('omits that line when no docs failed', () => {
      // No success badge: a row that says "0 problems" is furniture, not information.
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
          brokenDocCount={0}
          vaultLoaded
        />,
      );
      expect(screen.queryByTestId("topology-index-broken-docs")).not.toBeInTheDocument();
    });

    it('omits that line before a folder is attached', () => {
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
          brokenDocCount={2}
          vaultLoaded={false}
        />,
      );
      expect(screen.queryByTestId("topology-index-broken-docs")).not.toBeInTheDocument();
    });

    it("surfaces the unbound-code-folder fact without anyone clicking the project node", () => {
      /*
       * Surfaces an unbound project on the first screen instead of only after clicking that node.
       */
      const onSelect = vi.fn();
      render(
        <TopologyIndexPanel
          treeResult={buildFixtureTree()}
          totalConcepts={4}
          totalRelations={3}
          domainCount={1}
          changedSlugs={new Set()}
          selectedId={null}
          onSelect={onSelect}
          onCollapse={() => {}}
          labels={labels}
          unboundProjectNodeId="project:root"
          vaultLoaded
        />,
      );
      const row = screen.getByTestId("topology-index-source-unbound");
      expect(row).toHaveTextContent("1 project with no code folder");
      // This row does not open the folder picker — the prescription lives in exactly one place, the project panel.
      fireEvent.click(row);
      expect(onSelect).toHaveBeenCalledWith("project:root");
    });

    /* Opening a folder other than the one chosen must be stated on screen. */
    it("says so when the map inside the picked project was opened instead", () => {
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
          openedInsidePickedFolder="/Users/dana/my-product"
          vaultLoaded
        />,
      );
      expect(screen.getByTestId("topology-index-opened-inside")).toHaveTextContent(
        "opened-inside",
      );
    });

    /* The notice can be closed; nothing else clears it. */
    /*
     * A map with many concepts is built, so the make-a-map-from-code door would read as starting
     * over.
     */
    /*
     * `unboundProjectNodeId` is also null for a vault with no projects, which must still get the
     * door.
     */
    it("shows the door on an empty vault, where nothing has been built at all", () => {
      render(
        <TopologyIndexPanel
          treeResult={buildFixtureTree()}
          totalConcepts={0}
          totalRelations={0}
          domainCount={0}
          changedSlugs={new Set()}
          selectedId={null}
          onSelect={() => {}}
          onCollapse={() => {}}
          labels={labels}
          unboundProjectNodeId={null}
          noProjectsYet
          agentAvailable
          vaultLoaded
        />,
      );
      expect(
        (firstRunStarterProps.current as { mapUnbuilt?: boolean } | null)?.mapUnbuilt,
        'an empty vault is the state that has built nothing yet',
      ).toBe(true);
    });

    it("keeps the door away from a map that is plainly already built", () => {
      render(
        <TopologyIndexPanel
          treeResult={buildFixtureTree()}
          totalConcepts={82}
          totalRelations={115}
          domainCount={7}
          changedSlugs={new Set()}
          selectedId={null}
          onSelect={() => {}}
          onCollapse={() => {}}
          labels={labels}
          unboundProjectNodeId="project:root"
          agentAvailable
          vaultLoaded
        />,
      );
      // Asserted on the prop because this file stubs the starter module.
      expect(
        (firstRunStarterProps.current as { mapUnbuilt?: boolean } | null)?.mapUnbuilt,
        'suggesting map creation on an existing map reads as starting over',
      ).toBe(false);
      // The right action for a built map missing its evidence link is still offered.
      expect(screen.getByTestId("topology-index-source-unbound")).toBeInTheDocument();
    });

    it("lets the notice be closed once it has been read", () => {
      const onDismiss = vi.fn();
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
          openedInsidePickedFolder="/Users/dana/my-product"
          onDismissOpenedInside={onDismiss}
          vaultLoaded
        />,
      );
      fireEvent.click(screen.getByTestId("topology-index-opened-inside-dismiss"));
      expect(onDismiss).toHaveBeenCalled();
    });

    it("stays quiet when the folder that was picked is the folder that opened", () => {
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
          vaultLoaded
        />,
      );
      expect(screen.queryByTestId("topology-index-opened-inside")).not.toBeInTheDocument();
    });

    it("hides the unbound row when every project already has a code folder", () => {
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
          unboundProjectNodeId={null}
          vaultLoaded
        />,
      );
      expect(screen.queryByTestId("topology-index-source-unbound")).not.toBeInTheDocument();
    });

    it("defaults to shown (vaultLoaded omitted) for backward compatibility with existing callers", () => {
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
          dustyNodeCount={51}
        />,
      );
      expect(screen.getByTestId("topology-index-dusty-nodes")).toBeInTheDocument();
    });
  });
});

// A row with children selects and expands in one click.
describe('TopologyIndexPanel row click expands', () => {
  it('opens children and selects when a row with children is clicked', () => {
    const onSelect = vi.fn();
    render(
      <TopologyIndexPanel
        treeResult={buildFixtureTree()}
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

    const root = screen.getAllByTestId("topology-index-row")[0];
    fireEvent.click(root);

    expect(onSelect).toHaveBeenCalled();
    expect(root).toHaveAttribute("aria-expanded", "true");
  });

  it('does not collapse an expanded row on a second click', () => {
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
    const root = screen.getAllByTestId("topology-index-row")[0];
    fireEvent.click(root);
    expect(root).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(root);
    expect(root).toHaveAttribute("aria-expanded", "true");
  });

  it('says what the capability and element counts mean in place', () => {
    /* The kind definitions travel to the counts, composed from the existing glossary strings. */
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
    const counts = screen.getAllByTestId("topology-index-subcounts")[0];
    expect(counts.textContent).toContain("caps");
    expect(counts.textContent).toContain("elems");
    expect(
      counts.getAttribute("title"),
      'the counts must say what they mean',
    ).toBe(labels.subcountsTitle);
  });
});

/*
 * The tree follows the selection: rows above a selected node open even when it was selected
 * elsewhere.
 */
describe("TopologyIndexPanel follows the selection", () => {
  const rowOf = (id: string) => document.querySelector(`[data-index-row="${id}"]`);

  /** The panel as the page drives it: a pick selects, and the selection comes back down. */
  function Selecting({ initial = null, tree = buildFixtureTree() }: { initial?: string | null; tree?: ReturnType<typeof buildFixtureTree> }) {
    const [selectedId, setSelectedId] = useState<string | null>(initial);
    return (
      <>
        <button type="button" data-testid="select-elsewhere" onClick={() => setSelectedId("capability:cli-entry")} />
        <button type="button" data-testid="select-agent-brief" onClick={() => setSelectedId("element:agent-brief")} />
        <TopologyIndexPanel
          treeResult={tree}
          totalConcepts={4}
          totalRelations={3}
          domainCount={1}
          changedSlugs={new Set()}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCollapse={() => {}}
          labels={labels}
        />
      </>
    );
  }

  it("opens the rows above a node selected from outside the tree", () => {
    render(<Selecting initial="element:agent-brief" />);

    const row = rowOf("element:agent-brief");
    expect(row, "the selected row is folded away under a closed domain").not.toBeNull();
    expect(row).toHaveAttribute("aria-selected", "true");
    expect(rowOf("domain:onboarding")).toHaveAttribute("aria-expanded", "true");
    expect(rowOf("capability:mcp-server")).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps a row picked from the search in the tree after the search is cleared", () => {
    render(<Selecting />);
    const search = screen.getByTestId("topology-index-search");

    fireEvent.change(search, { target: { value: "Agent Brief" } });
    fireEvent.click(rowOf("element:agent-brief")!);
    fireEvent.change(search, { target: { value: "" } });

    // A folding branch keeps its rows for the exit transition, so the branch state is asserted.
    expect(rowOf("domain:onboarding"), "the pick's domain folded when the search ended").toHaveAttribute("aria-expanded", "true");
    expect(rowOf("capability:mcp-server")).toHaveAttribute("aria-expanded", "true");
    expect(rowOf("element:agent-brief")).toHaveAttribute("aria-selected", "true");
  });

  it("reveals once per selection: a branch folded again stays folded until the next selection", async () => {
    render(<Selecting initial="element:agent-brief" />);
    const capability = rowOf("capability:mcp-server")!;

    fireEvent.click(capability.querySelector("button")!);
    await waitForElementToBeRemoved(() => rowOf("element:agent-brief"));
    expect(rowOf("capability:mcp-server")).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByTestId("select-elsewhere"));
    fireEvent.click(screen.getByTestId("select-agent-brief"));
    expect(rowOf("element:agent-brief"), "a new selection did not open its branch again").not.toBeNull();
  });

  it("reveals a selection that arrived before its tree", () => {
    const empty = { roots: [], orphans: [], warnings: [] };
    const { rerender } = render(
      <TopologyIndexPanel
        treeResult={empty}
        totalConcepts={0}
        totalRelations={0}
        domainCount={0}
        changedSlugs={new Set()}
        selectedId="element:agent-brief"
        onSelect={() => {}}
        onCollapse={() => {}}
        labels={labels}
      />,
    );
    rerender(
      <TopologyIndexPanel
        treeResult={buildFixtureTree()}
        totalConcepts={4}
        totalRelations={3}
        domainCount={1}
        changedSlugs={new Set()}
        selectedId="element:agent-brief"
        onSelect={() => {}}
        onCollapse={() => {}}
        labels={labels}
      />,
    );

    expect(rowOf("element:agent-brief")).not.toBeNull();
  });
});
