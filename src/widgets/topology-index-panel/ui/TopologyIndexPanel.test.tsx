import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { buildOntologyTree } from "@/shared/lib/ontology-tree";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { TopologyIndexPanel } from "./TopologyIndexPanel";

// `@/i18n/navigation`'s Link needs an IntlProvider context this file doesn't
// stand up (established pattern, see `DocsVaultViewer.test.tsx`) — mocked to
// a plain anchor so href/click assertions still work (P4-② agent-activity
// deep link).
// 이 위젯은 라벨을 prop 으로 받지만 하위 행이 화면 언어를 읽는다
// (라틴 아이브로를 한글에 얹지 않기 위한 판정, `shared/lib/latin-eyebrow`).
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
// root-first-open "시작하기" module it mounts at the top needs a
// LocalVaultProvider + i18n context it doesn't stand up here, and its
// visibility logic is unit-tested separately
// (`@/features/first-run-starter/ui/FirstRunStarterModule.test.tsx`). Stub
// it to a spy so this file can still assert it receives the right census
// props without pulling in vault/i18n providers.
const firstRunStarterProps = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/features/first-run-starter", () => ({
  // 2026-07-24 구조 개편 — 모듈이 INDEX 본문(children)을 감싸고 가이드와
  // 배타적으로 그린다. 스텁은 "가이드 없음" 상태(=children 그대로)를 흉내
  // 내 이 파일이 INDEX 동작만 검증하게 한다.
  FirstRunStarterModule: (props: { children?: React.ReactNode }) => {
    firstRunStarterProps.current = props;
    return <>{props.children}</>;
  },
}));

// 온톨로지 블록 "가져오기" 모듈도 같은 이유(자체 vault/i18n 컨텍스트 필요,
// 동작은 `BlockImportModule.test.tsx` 가 단위 검증)로 스텁 — 이 파일은
// 패널이 모듈을 mount 한다는 사실만 본다.
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
  agentSync: "Agent sync",
  agentSyncIdle: "Agent not connected",
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
  it("mounts the ontology block import module (Slice A wiring)", () => {
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
    expect(blockImportMounted.current).toBe(1);
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
    // Regression (H3 접근성 감사 P0): every treeitem used to carry tabIndex=0,
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
      // 2026-07-24 온보딩 라운드 — 투어/일반 모드 콜백은 HomePage 가 줄 때만
      // 정의된다(이 테스트는 미전달 → undefined 통과 확인).
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

  // P4-② (2026-07-21 리텐션 라운드) — 푸터의 "Updated with AI" 가 이미
  // 연결된 2일차 사용자를 등록 모달로 되돌려 보내는 막다른 길이었다.
  describe("footer agent-connect control (P4-②)", () => {
    it("opens the agent-connect sheet (button) when there is no agentActivityHref", () => {
      const onOpenAgentConnect = vi.fn();
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
          onOpenAgentConnect={onOpenAgentConnect}
        />,
      );
      const control = screen.getByTestId("topology-index-agent-connect");
      expect(control.tagName).toBe("BUTTON");
      fireEvent.click(control);
      expect(onOpenAgentConnect).toHaveBeenCalledTimes(1);
    });

    // C11 — no heartbeat (no agentActivityHref) must NOT show the progressive
    // "Updated with AI" copy that implies active sync. Show the neutral idle
    // label instead.
    it("shows the neutral idle label (not the progressive sync copy) when there is no heartbeat", () => {
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
          onOpenAgentConnect={() => {}}
        />,
      );
      const control = screen.getByTestId("topology-index-agent-connect");
      expect(control).toHaveTextContent("Agent not connected");
      expect(control).not.toHaveTextContent("Agent sync");
    });

    it("shows the live sync copy only when connected (agentActivityHref present)", () => {
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
          onOpenAgentConnect={() => {}}
          agentActivityHref="/ontology/insights/"
        />,
      );
      const control = screen.getByTestId("topology-index-agent-connect");
      expect(control).toHaveTextContent("Agent sync");
      expect(control).not.toHaveTextContent("Agent not connected");
    });

    it("deep-links to the activity digest instead of opening the modal when agentActivityHref is set (connected agent)", () => {
      const onOpenAgentConnect = vi.fn();
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
          onOpenAgentConnect={onOpenAgentConnect}
          agentActivityHref="/ontology/insights/"
        />,
      );
      const control = screen.getByTestId("topology-index-agent-connect");
      expect(control.tagName).toBe("A");
      expect(control).toHaveAttribute("href", "/ontology/insights/");
      fireEvent.click(control);
      expect(onOpenAgentConnect).not.toHaveBeenCalled();
    });
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
  // (정적 샘플) 상태에서 "먼지 앉은 노드"/"인계" 같은 유지보수·에이전트
  // 컨트롤은 첫 방문자에게 노출하지 않는다. 실 데이터(dustyNodeCount,
  // agentHandoff)는 그대로 받되 `vaultLoaded=false`면 렌더만 억제하고,
  // `vaultLoaded=true`(또는 생략 — 하위호환 기본값)면 그대로 나타나야 한다.
  describe("vault-connected gate for maintenance/agent controls (P1 오버뷰 레일)", () => {
    const agentHandoffProp = {
      briefText: "brief",
      reanalyzeText: "reanalyze",
      syncText: "sync",
      labels: {
        menuLabel: "인계",
        menuAria: "인계 메뉴",
        briefCopy: "브리핑 복사",
        briefCopied: "복사됨",
        briefCopyAriaLabel: "브리핑 복사",
        briefCopiedAriaLabel: "복사됨",
        reanalyzeCopy: "재분석 복사",
        reanalyzeCopied: "복사됨",
        reanalyzeCopyAriaLabel: "재분석 복사",
        reanalyzeCopiedAriaLabel: "복사됨",
        syncCopy: "동기화 복사",
        syncCopied: "복사됨",
        syncCopyAriaLabel: "동기화 복사",
        syncCopiedAriaLabel: "복사됨",
      },
    };

    it("hides the dusty-nodes row and the agent-handoff menu when vaultLoaded is false, even though counts/props are non-empty", () => {
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
          agentHandoff={agentHandoffProp}
          uncatalogedDocCount={3}
          onPromoteUncatalogedDocs={() => {}}
          vaultLoaded={false}
        />,
      );
      expect(screen.queryByTestId("topology-index-dusty-nodes")).not.toBeInTheDocument();
      expect(screen.queryByTestId("topology-index-agent-handoff")).not.toBeInTheDocument();
      expect(screen.queryByTestId("topology-index-uncataloged-docs")).not.toBeInTheDocument();
    });

    it("shows the dusty-nodes row and the agent-handoff menu once vaultLoaded is true", () => {
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
          agentHandoff={agentHandoffProp}
          uncatalogedDocCount={3}
          onPromoteUncatalogedDocs={() => {}}
          vaultLoaded
        />,
      );
      expect(screen.getByTestId("topology-index-dusty-nodes")).toBeInTheDocument();
      expect(screen.getByTestId("topology-index-agent-handoff")).toBeInTheDocument();
      expect(screen.getByTestId("topology-index-uncataloged-docs")).toBeInTheDocument();
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
          agentHandoff={agentHandoffProp}
        />,
      );
      expect(screen.getByTestId("topology-index-dusty-nodes")).toBeInTheDocument();
      expect(screen.getByTestId("topology-index-agent-handoff")).toBeInTheDocument();
    });
  });
});

// 소유자 실사용 지적 (2026-07-24) — 셰브론을 정확히 눌러야만 펼쳐지던
// 민감함 해소: 자식 있는 행은 클릭 한 번이 선택 + 펼침을 함께 한다.
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
