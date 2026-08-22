import {
  fireEvent,
  render,
  screen,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { buildOntologyTree } from "@/shared/lib/ontology-tree";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { TopologyIndexPanel } from "./TopologyIndexPanel";

// `@/i18n/navigation`'s Link needs an IntlProvider context this file doesn't
// stand up (established pattern, see `DocsVaultViewer.test.tsx`) — mocked to
// a plain anchor so href/click assertions still work (the agent-activity deep link).
// This widget receives labels as props, but the rows below it read the screen's
// language (the decision that keeps a Latin eyebrow off Hangul,
// `shared/lib/latin-eyebrow`).
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

// TopologyIndexPanel's own tests exercise the tree/search/census — the
// root-first-open "get started" module it mounts at the top needs a
// LocalVaultProvider + i18n context it doesn't stand up here, and its
// visibility logic is unit-tested separately
// (`@/features/first-run-starter/ui/FirstRunStarterModule.test.tsx`). Stub
// it to a spy so this file can still assert it receives the right census
// props without pulling in vault/i18n providers.
const firstRunStarterProps = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/features/first-run-starter", () => ({
  // The 2026-07-24 restructure — the module wraps the INDEX body (children) and
  // draws exclusively against the guide. The stub imitates the "no guide" state
  // (children as-is) so this file verifies INDEX behaviour alone.
  FirstRunStarterModule: (props: { children?: React.ReactNode }) => {
    firstRunStarterProps.current = props;
    return <>{props.children}</>;
  },
}));

// The ontology block "import" module is stubbed for the same reason (it needs its own
// vault and i18n context, and its behaviour is unit-verified by
// `BlockImportModule.test.tsx`) — this file only checks that the panel mounts it.
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
  censusRelations: "relations",
  censusDomains: "domains",
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
  dustyNodesLabel: "0 nodes gathering dust",
  dustyNodesAction: "See freshness",
  sourceUnboundLabel: "1 project with no code folder",
  sourceUnboundAction: "Connect",
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

  /**
   * 「다른 폴더에서 노드 가져오기」 (import nodes from another folder) is **not in
   * INDEX** (moved 2026-08-02, owner: *"이건 뭐임? 이 문구가 왜 있는거지..?"* — what is
   * this? why is this text here?).
   *
   * Something used once or twice in a lifetime stood as a permanent button on the
   * screen for reading the map. Its home is now settings → workspace
   * (`AppSettingsMenu`). This case stops it **coming back** — it is a self-contained
   * module, so putting one line back here revives it silently.
   */
  it("블록 가져오기 모듈을 INDEX 에 싣지 않는다 — 설정으로 옮겼다", () => {
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

  it("INDEX tree is a single Tab stop — roving tabindex + Arrow/Home/End move the roving focus (P0)", () => {
    // Regression (accessibility audit P0): every treeitem used to carry tabIndex=0,
    // so expanding a domain added +N Tab stops and a keyboard user had to Tab
    // through the whole tree. WAI-ARIA `tree` requires exactly ONE Tab entry
    // point (the active row), with Arrow keys walking siblings.
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
    // moves DOM focus with it.
    fireEvent.keyDown(project, { key: "ArrowDown" });
    expect(document.activeElement).toBe(domain);
    expect(tabbableRows()).toEqual([domain]);

    // Expanding the domain adds child rows but MUST NOT add Tab stops.
    fireEvent.click(domain.querySelector("button")!);
    expect(rowFor("capability:mcp-server")).toBeInTheDocument();
    expect(rowFor("capability:cli-entry")).toBeInTheDocument();
    expect(tabbableRows()).toEqual([domain]);

    // ArrowDown from the domain lands on its first child (whatever the tree's
    // child sort is — the +N rows are reachable by Arrow, never by Tab).
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
      // The tour and plain-mode callbacks are defined only when HomePage supplies them
      // (this test passes neither — confirming undefined passes through).
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

    // A collapsed branch unmounts after the expansion transition
    // (`.ai-row-disclosure`) finishes — the price of removing the "sudden vanish" is
    // that it disappears one beat later.
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
    // The sr-only census remains.
    expect(screen.getByTestId("topology-index-census")).toBeInTheDocument();
  });

  // P1 결함①a (사용성 전수 검수 2026-07-23) — 일반(비개발) 모드는
  // element 행을 트리에서 제외하는데(호출자의 filterTreeExcludeKind), 그
  // 사실을 설명하는 텍스트가 어디에도 없어 "역량 2 · 요소 7"인데 펼치면
  // 2행만 보이는 정합성 결함으로 읽혔다.
  describe("plainMode hint (P1 결함①a)", () => {
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

  // 오버뷰 좌측 레일 attention winner 단일화 (2026-07-24) — vault 미연결
  // (정적 샘플) 상태에서 "먼지 앉은 노드" 같은 유지보수 컨트롤은 첫
  // 방문자에게 노출하지 않는다. `vaultLoaded=false`면 렌더만 억제하고,
  // `vaultLoaded=true`(또는 생략 — 하위호환 기본값)면 그대로 나타나야 한다.
  describe("vault-connected gate for maintenance controls (P1 오버뷰 레일)", () => {
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

    it("surfaces the unbound-code-folder fact without anyone clicking the project node", () => {
      /*
       * Why this row exists — measured 2026-08-04: 「이 프로젝트에 연결된 코드 폴더가
       * 없습니다」 (this project has no code folder attached) appeared **0 times** on the
       * first screen and was visible only after clicking that one exact project node
       * (a 15-node fixture; 100+ nodes in dogfood). A prescription is worthless if the
       * diagnosis is never seen.
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

// Owner report from real use (2026-07-24) — resolving the sensitivity of expanding
// only on an exact chevron hit: a row with children now does select and expand in one click.
describe("TopologyIndexPanel — 행 클릭 펼침", () => {
  it("자식이 있는 행을 클릭하면 선택과 동시에 자식이 열린다", () => {
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

  it("이미 펼쳐진 행을 다시 클릭해도 접히지 않는다(접기는 셰브론 담당)", () => {
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
});
