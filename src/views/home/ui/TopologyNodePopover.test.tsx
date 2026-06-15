import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TopologyNodeFocusModel } from "../lib/topology-node-focus";
import {
  TopologyNodePopover,
  type TopologyNodePopoverLabels,
} from "./TopologyNodePopover";

const labels: TopologyNodePopoverLabels = {
  connections: "연결된 노드",
  usedBy: "이 노드를 쓰는 곳",
  dependsOn: "이 노드가 기대는 곳",
  noConnections: "직접 연결 없음",
  openFullDetail: "전체 상세",
  collapse: "지도 보기",
  expand: "상세 보기",
  close: "닫기",
  moreSuffix: "더",
  expandedNote:
    "{count}개 직접 연결은 지도에 펼쳐져 있어요. 지도 보기를 누르면 겹침 없이 확인할 수 있어요.",
  relationLensTitle: "관계 렌즈",
  relationLensDirectFactOne: "직접 의미 관계 {count}개",
  relationLensDirectFactOther: "직접 의미 관계 {count}개",
  relationLensTypeOne: "관계 유형 {count}종",
  relationLensTypeOther: "관계 유형 {count}종",
  relationLensNoScores: "추론된 유사도 점수가 아니라 타입이 있는 온톨로지 사실입니다.",
  relationQualityTitle: "관계 품질",
  relationQualityLabels: {
    strong: "강한 구조",
    supported: "근거 있는 관계",
    weak: "약한 관련",
    review: "검토",
  },
  agentReadinessTitle: "Agent readiness",
  agentReadinessLabels: {
    ready: "handoff-ready",
    preflight: "preflight",
    review: "review",
  },
  kindLabels: {
    capability: "역량",
    domain: "도메인",
    element: "요소",
    unknown: "기타",
  },
  relationTypeLabels: {
    contains: "포함",
    uses: "사용",
  },
};

function focusModel(
  extra: Partial<TopologyNodeFocusModel> = {},
): TopologyNodeFocusModel {
  return {
    id: "capabilities/mcp-server",
    title: "MCP Server",
    kind: "capability",
    summary: "AI agent surface.",
    sourceSlug: "capabilities/mcp-server",
    usedByCount: 1,
    dependsOnCount: 2,
    connections: [
      {
        id: "elements/mcp-sdk",
        title: "MCP SDK",
        kind: "element",
        direction: "outgoing",
        relationType: "uses",
        relationQuality: "strong",
        evidenceCount: 1,
        authored: true,
      },
      {
        id: "domains/ai-agent-partner",
        title: "AI Agent Partner",
        kind: "domain",
        direction: "incoming",
        relationType: "contains",
        relationQuality: "supported",
        evidenceCount: 0,
        authored: true,
      },
    ],
    relationQuality: {
      strong: 1,
      supported: 1,
      weak: 0,
      review: 0,
    },
    hiddenConnectionCount: 0,
    ...extra,
  };
}

function setup(props: Partial<React.ComponentProps<typeof TopologyNodePopover>> = {}) {
  const onSelectConnection = vi.fn();
  const onOpenFullDetail = vi.fn();
  const onClose = vi.fn();
  render(
    <TopologyNodePopover
      focus={focusModel()}
      labels={labels}
      onSelectConnection={onSelectConnection}
      onOpenFullDetail={onOpenFullDetail}
      onClose={onClose}
      {...props}
    />,
  );
  return { onSelectConnection, onOpenFullDetail, onClose };
}

describe("TopologyNodePopover", () => {
  it("uses a readable inspector rail while leaving the map primary", () => {
    setup();
    const popover = screen.getByTestId("topology-node-popover");
    expect(popover).toHaveAttribute("data-surface-role", "active-node-inspector");
    expect(popover).toHaveAttribute("data-attention-role", "supporting-detail");
    expect(popover).toHaveAttribute("data-focus-primary", "linked-focus-cluster");
    expect(popover).toHaveAttribute("data-hierarchy-contract", "click-focus-detail-support");
    expect(popover).toHaveAttribute("data-density", "readable");
    expect(popover).toHaveAttribute("data-size-policy", "inspector-rail");
    expect(popover).toHaveAttribute("data-selected-node-id", "capabilities/mcp-server");
    expect(popover).toHaveAttribute("data-selected-node-kind", "capability");
    expect(popover).toHaveAttribute("data-selected-node-title", "MCP Server");
    expect(popover).toHaveAttribute("data-selected-node-source", "capabilities/mcp-server");
    expect(popover).toHaveAttribute(
      "data-selected-node-summary",
      "capability capabilities/mcp-server · MCP Server",
    );
    expect(popover.className).toContain("min-w-0");
    expect(popover.className).toContain("w-[min(568px,calc(100vw-1.5rem))]");
    expect(popover.className).toContain("max-w-[min(568px,calc(100vw-1.5rem))]");
    expect(popover.className).toContain("lg:w-[348px]");
    expect(popover.className).toContain("lg:max-w-[348px]");
    expect(popover.className).toContain("min-[1400px]:w-[420px]");
    expect(popover.className).toContain("min-[1400px]:max-w-[420px]");
    expect(popover.className).toContain("max-h-[min(68vh,34rem)]");
  });

  it("keeps the connection list short so the selected map remains visible", () => {
    setup();
    const list = screen.getByText("MCP SDK").closest("ul");
    expect(list?.className).toContain("max-h-40");
  });

  it("can collapse into a low map chip without losing the selected node context", () => {
    const onToggleCollapsed = vi.fn();
    setup({ collapsed: true, onToggleCollapsed });

    const popover = screen.getByTestId("topology-node-popover");
    expect(popover).toHaveAttribute("data-surface-role", "active-node-inspector");
    expect(popover).toHaveAttribute("data-attention-role", "supporting-detail");
    expect(popover).toHaveAttribute("data-focus-primary", "linked-focus-cluster");
    expect(popover).toHaveAttribute("data-hierarchy-contract", "click-focus-detail-support");
    expect(popover).toHaveAttribute("data-collapsed", "true");
    expect(popover).toHaveAttribute("data-size-policy", "context-chip");
    expect(popover).toHaveAttribute("data-selected-node-id", "capabilities/mcp-server");
    expect(popover).toHaveAttribute(
      "data-selected-node-summary",
      "capability capabilities/mcp-server · MCP Server",
    );
    expect(popover.className).toContain("lg:w-[348px]");
    expect(popover.className).toContain("min-[1400px]:w-[420px]");
    expect(screen.getByText("MCP Server")).toBeInTheDocument();
    expect(screen.getByText("이 노드를 쓰는 곳 1 · 이 노드가 기대는 곳 2")).toBeInTheDocument();

    const expand = screen.getByRole("button", { name: "상세 보기" });
    expect(expand).toHaveAttribute("data-node-popover-toggle", "expand");
    fireEvent.click(expand);
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it("shows a readable compact map return control when expanded", () => {
    const onToggleCollapsed = vi.fn();
    setup({ onToggleCollapsed });

    const collapse = screen.getByRole("button", { name: "지도 보기" });
    expect(collapse).toHaveAttribute("data-node-popover-toggle", "collapse");
    expect(collapse).toHaveTextContent("지도 보기");

    fireEvent.click(collapse);
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it("지도에 펼쳐진 자식은 리스트에서 제외하고 안내 한 줄로 축약한다", () => {
    setup({ expandedChildIds: new Set(["elements/mcp-sdk"]) });
    // 펼쳐진 자식은 중복 나열 안 함 (Toss '한 화면에 한 가지').
    expect(screen.queryByText("MCP SDK")).not.toBeInTheDocument();
    const note = screen.getByTestId("topology-map-context-note");
    expect(note).toHaveAttribute("data-map-context-count", "1");
    expect(note).toHaveTextContent(
      "1개 직접 연결은 지도에 펼쳐져 있어요. 지도 보기를 누르면 겹침 없이 확인할 수 있어요.",
    );
    expect(note.className).toContain("border-[color:rgba(94,106,210,0.22)]");
    // 펼쳐지지 않은 관계는 그대로.
    expect(screen.getByText("AI Agent Partner")).toBeInTheDocument();
  });

  it("연결이 전부 펼쳐졌으면 빈 상태 문구 대신 안내만 보여준다", () => {
    setup({
      expandedChildIds: new Set(["elements/mcp-sdk", "domains/ai-agent-partner"]),
    });
    expect(screen.getByTestId("topology-map-context-note")).toHaveTextContent(
      "2개 직접 연결은 지도에 펼쳐져 있어요. 지도 보기를 누르면 겹침 없이 확인할 수 있어요.",
    );
    expect(screen.queryByText("직접 연결 없음")).not.toBeInTheDocument();
  });

  it("renders the node title, kind, summary, and its direct connections", () => {
    setup();
    expect(screen.getByText("MCP Server")).toBeInTheDocument();
    expect(screen.getByText("역량")).toBeInTheDocument();
    expect(screen.getByText("AI agent surface.")).toBeInTheDocument();
    // each direct connection is a row the user can click into
    expect(screen.getByText("MCP SDK")).toBeInTheDocument();
    expect(screen.getByText("AI Agent Partner")).toBeInTheDocument();
  });

  it("shows plain-language counts instead of graph jargon", () => {
    setup();
    expect(screen.getAllByText("이 노드를 쓰는 곳").length).toBeGreaterThan(0);
    expect(screen.getAllByText("이 노드가 기대는 곳").length).toBeGreaterThan(0);
    // no '영향받음' / '의존 N' raw jargon
    expect(screen.queryByText(/영향받음/)).not.toBeInTheDocument();
  });

  it("labels each connection row with its plain-language direction", () => {
    setup();
    expect(
      screen.getByRole("button", {
        name: /사용.*MCP SDK.*이 노드가 기대는 곳/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /포함.*AI Agent Partner.*이 노드를 쓰는 곳/,
      }),
    ).toBeInTheDocument();
  });

  it("shows the connected node kind in each connection row", () => {
    setup();
    expect(
      screen.getByRole("button", {
        name: /사용.*MCP SDK.*이 노드가 기대는 곳.*요소/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /포함.*AI Agent Partner.*이 노드를 쓰는 곳.*도메인/,
      }),
    ).toBeInTheDocument();
  });

  it("surfaces relation type as the first scan target in each connection row", () => {
    setup();
    const relationRows = document.querySelectorAll("[data-relation-row]");
    expect(relationRows).toHaveLength(2);
    expect(relationRows[0]).toHaveAttribute("data-relation-direction", "outgoing");
    expect(relationRows[0]).toHaveAttribute("data-relation-type", "uses");
    expect(relationRows[0]).toHaveAttribute("data-relation-quality", "strong");
    expect(relationRows[0]).toHaveAttribute("data-relation-evidence-state", "source-backed");
    expect(relationRows[0]).toHaveAttribute("data-relation-evidence-count", "1");
    expect(relationRows[0]).toHaveAttribute("data-agent-gate-kind", "handoff-ready");
    expect(relationRows[0]).toHaveAttribute("data-primary-copy-action", "explain_relation");
    expect(
      relationRows[0].querySelector("[data-relation-type-label]"),
    ).toHaveTextContent("사용");
    expect(
      relationRows[0].querySelector("[data-relation-evidence-glyph]"),
    ).toHaveTextContent("1");
    expect(
      relationRows[0].querySelector("[data-relation-row-agent-gate]"),
    ).toHaveTextContent("MCP");
    expect(relationRows[1]).toHaveAttribute("data-relation-direction", "incoming");
    expect(relationRows[1]).toHaveAttribute("data-relation-type", "contains");
    expect(relationRows[1]).toHaveAttribute("data-relation-quality", "supported");
    expect(relationRows[1]).toHaveAttribute("data-relation-evidence-state", "authored");
    expect(relationRows[1]).toHaveAttribute("data-agent-gate-kind", "handoff-ready");
    expect(
      relationRows[1].querySelector("[data-relation-type-label]"),
    ).toHaveTextContent("포함");
  });

  it("exposes each connection row as a fact to evidence to action handoff route", () => {
    setup();

    const relationRows = document.querySelectorAll("[data-relation-row]");
    expect(relationRows[0]).toHaveAttribute(
      "data-relation-fact-route",
      "fact>evidence>gate>action",
    );
    expect(relationRows[0]).toHaveAttribute("data-relation-fact-route-quality", "strong");
    expect(relationRows[0]).toHaveAttribute(
      "data-relation-fact-route-evidence",
      "source-backed",
    );
    expect(relationRows[0]).toHaveAttribute(
      "data-relation-fact-route-gate",
      "handoff-ready",
    );
    expect(relationRows[0]).toHaveAttribute(
      "data-relation-fact-route-action",
      "explain_relation",
    );
    expect(
      Array.from(relationRows[0].querySelectorAll("[data-relation-route-chip]"))
        .map((chip) => chip.getAttribute("data-relation-route-chip"))
        .join(">"),
    ).toBe("fact>evidence>action>payload");
    expect(relationRows[0].querySelector("[data-relation-route]")).toHaveAttribute(
      "data-relation-route-state",
      "compact-json-ready",
    );
    expect(
      relationRows[0].querySelector('[data-relation-route-chip="fact"]'),
    ).toHaveTextContent("사용");
    expect(
      relationRows[0].querySelector('[data-relation-route-chip="evidence"]'),
    ).toHaveTextContent("1");
    expect(
      relationRows[0].querySelector('[data-relation-route-chip="action"]'),
    ).toHaveTextContent("MCP");
    expect(
      relationRows[0].querySelector('[data-relation-route-chip="payload"]'),
    ).toHaveTextContent("JSON");
    expect(
      relationRows[0].querySelector('[data-relation-route-chip="payload"]'),
    ).toHaveAttribute(
      "title",
      "query_ontology · explain_relation · capabilities/mcp-server -> elements/mcp-sdk · uses",
    );
    expect(
      relationRows[0].querySelector('[data-relation-route-chip="payload"]'),
    ).toHaveAttribute(
      "data-relation-payload-summary",
      "query_ontology · explain_relation · capabilities/mcp-server -> elements/mcp-sdk · uses",
    );
  });

  it("exposes source to target endpoint context for outgoing and incoming rows", () => {
    setup();

    const relationRows = document.querySelectorAll("[data-relation-row]");
    expect(relationRows[0]).toHaveAttribute(
      "data-relation-endpoint-route",
      "capabilities/mcp-server>elements/mcp-sdk",
    );
    expect(relationRows[0]).toHaveAttribute(
      "data-relation-source-id",
      "capabilities/mcp-server",
    );
    expect(relationRows[0]).toHaveAttribute("data-relation-target-id", "elements/mcp-sdk");
    expect(
      relationRows[0].querySelector('[data-relation-endpoint-chip="source"]'),
    ).toHaveTextContent("capabilities/mcp-server");
    expect(
      relationRows[0].querySelector('[data-relation-endpoint-chip="target"]'),
    ).toHaveTextContent("elements/mcp-sdk");

    expect(relationRows[1]).toHaveAttribute(
      "data-relation-endpoint-route",
      "domains/ai-agent-partner>capabilities/mcp-server",
    );
    expect(relationRows[1]).toHaveAttribute(
      "data-relation-source-id",
      "domains/ai-agent-partner",
    );
    expect(relationRows[1]).toHaveAttribute(
      "data-relation-target-id",
      "capabilities/mcp-server",
    );
    expect(
      relationRows[1].querySelector('[data-relation-endpoint-chip="source"]'),
    ).toHaveTextContent("domains/ai-agent-partner");
    expect(
      relationRows[1].querySelector('[data-relation-endpoint-chip="target"]'),
    ).toHaveTextContent("capabilities/mcp-server");
  });

  it("summarizes each relation row as an accessible agent handoff fact", () => {
    setup();

    const relationRows = document.querySelectorAll("[data-relation-row]");
    expect(relationRows[0]).toHaveAttribute(
      "data-relation-handoff-summary",
      "capabilities/mcp-server > elements/mcp-sdk · 사용 · source-backed · handoff-ready · explain_relation",
    );
    expect(relationRows[0]).toHaveAttribute(
      "aria-label",
      "사용 · MCP SDK · 이 노드가 기대는 곳 · 요소 · capabilities/mcp-server > elements/mcp-sdk · 사용 · source-backed · handoff-ready · explain_relation",
    );
    expect(relationRows[1]).toHaveAttribute(
      "data-relation-handoff-summary",
      "domains/ai-agent-partner > capabilities/mcp-server · 포함 · authored · handoff-ready · explain_relation",
    );
  });

  it("exposes a machine-readable MCP handoff payload for each relation row", () => {
    setup();

    const relationRows = document.querySelectorAll("[data-relation-row]");
    expect(relationRows[0]).toHaveAttribute("data-relation-handoff-tool", "query_ontology");
    expect(relationRows[0]).toHaveAttribute(
      "data-relation-handoff-operation",
      "explain_relation",
    );
    expect(relationRows[0]).toHaveAttribute(
      "data-relation-handoff-from",
      "capabilities/mcp-server",
    );
    expect(relationRows[0]).toHaveAttribute("data-relation-handoff-to", "elements/mcp-sdk");
    expect(relationRows[0]).toHaveAttribute("data-relation-handoff-type", "uses");
    expect(relationRows[0]).toHaveAttribute(
      "data-relation-handoff-payload-summary",
      "query_ontology · explain_relation · capabilities/mcp-server -> elements/mcp-sdk · uses",
    );
    expect(
      JSON.parse(relationRows[0].getAttribute("data-relation-handoff-payload-json") || "{}"),
    ).toEqual({
      tool: "query_ontology",
      operation: "explain_relation",
      from: "capabilities/mcp-server",
      to: "elements/mcp-sdk",
      type: "uses",
    });
  });

  it("routes weak connection rows to relation_check before agent handoff", () => {
    setup({
      focus: focusModel({
        connections: [
          {
            id: "elements/mcp-sdk",
            title: "MCP SDK",
            kind: "element",
            direction: "outgoing",
            relationType: "uses",
            relationQuality: "weak",
            evidenceCount: 0,
            authored: false,
          },
        ],
      }),
    });

    const relationRow = document.querySelector("[data-relation-row]");
    expect(relationRow).toHaveAttribute("data-relation-evidence-state", "needs-review");
    expect(relationRow).toHaveAttribute("data-agent-gate-kind", "preflight-first");
    expect(relationRow).toHaveAttribute("data-primary-copy-action", "relation_check");
    expect(relationRow?.querySelector("[data-relation-evidence-glyph]")).toHaveTextContent("!");
    expect(relationRow?.querySelector("[data-relation-row-agent-gate]")).toHaveTextContent(
      "check",
    );
  });

  it("summarizes direct typed relations inside the connections section without a tall card", () => {
    setup();

    const section = screen.getByTestId("topology-connections-section");
    const lens = screen.getByTestId("topology-relation-lens");
    expect(section).toContainElement(lens);
    expect(lens).toHaveTextContent("관계 렌즈");
    expect(lens).toHaveTextContent("직접 의미 관계 3개");
    expect(lens).toHaveTextContent("관계 유형 2종");
    expect(lens).toHaveTextContent(
      "추론된 유사도 점수가 아니라 타입이 있는 온톨로지 사실입니다.",
    );
  });

  it("surfaces relation quality as a compact handoff lens", () => {
    setup();

    const lens = screen.getByTestId("topology-relation-quality-lens");
    expect(lens).toHaveAccessibleName(
      "관계 품질: 강한 구조 1 · 근거 있는 관계 1 · 약한 관련 0 · 검토 0",
    );
    expect(lens).toHaveAttribute(
      "data-relation-quality-summary",
      "강한 구조 1 · 근거 있는 관계 1 · 약한 관련 0 · 검토 0",
    );
    expect(lens).toHaveTextContent("강한 구조1");
    expect(lens).toHaveTextContent("근거 있는 관계1");
    expect(lens).toHaveTextContent("약한 관련0");
    expect(lens).toHaveTextContent("검토0");
  });

  it("summarizes relation rows by agent readiness before the list", () => {
    setup({
      focus: focusModel({
        connections: [
          {
            id: "elements/mcp-sdk",
            title: "MCP SDK",
            kind: "element",
            direction: "outgoing",
            relationType: "uses",
            relationQuality: "strong",
            evidenceCount: 1,
            authored: true,
          },
          {
            id: "elements/mcp-config",
            title: "MCP Config",
            kind: "element",
            direction: "outgoing",
            relationType: "uses",
            relationQuality: "weak",
            evidenceCount: 0,
            authored: false,
          },
          {
            id: "elements/mcp-unknown",
            title: "MCP Unknown",
            kind: "element",
            direction: "outgoing",
            relationType: "uses",
            relationQuality: "review",
            evidenceCount: 0,
            authored: false,
          },
        ],
      }),
    });

    const lens = screen.getByTestId("topology-node-agent-readiness-lens");
    expect(lens).toHaveAccessibleName(
      "Agent readiness: handoff-ready 1 · preflight 1 · review 1",
    );
    expect(lens).toHaveAttribute(
      "data-agent-readiness-summary",
      "handoff-ready 1 · preflight 1 · review 1",
    );
    expect(lens.querySelector('[data-agent-readiness-chip="ready"]')).toHaveTextContent(
      "handoff-ready1",
    );
    expect(lens.querySelector('[data-agent-readiness-chip="preflight"]')).toHaveTextContent(
      "preflight1",
    );
    expect(lens.querySelector('[data-agent-readiness-chip="review"]')).toHaveTextContent(
      "review1",
    );
  });

  it("uses singular relation lens labels when the count is one", () => {
    setup({
      focus: focusModel({
        usedByCount: 0,
        dependsOnCount: 1,
        connections: [
          {
            id: "elements/mcp-sdk",
            title: "MCP SDK",
            kind: "element",
            direction: "outgoing",
            relationType: "uses",
            relationQuality: "strong",
            evidenceCount: 1,
            authored: true,
          },
        ],
        relationQuality: {
          strong: 1,
          supported: 0,
          weak: 0,
          review: 0,
        },
      }),
      labels: {
        ...labels,
        relationLensDirectFactOne: "{count} direct fact",
        relationLensDirectFactOther: "{count} direct facts",
        relationLensTypeOne: "{count} relation type",
        relationLensTypeOther: "{count} relation types",
      },
    });

    expect(screen.getByTestId("topology-relation-lens")).toHaveTextContent(
      "1 direct fact",
    );
    expect(screen.getByTestId("topology-relation-lens")).toHaveTextContent(
      "1 relation type",
    );
    expect(screen.getByTestId("topology-relation-lens")).not.toHaveTextContent(
      "1 relation types",
    );
  });

  it("reports a hidden remainder when connections are capped", () => {
    setup({ focus: focusModel({ hiddenConnectionCount: 5 }) });
    expect(screen.getAllByText("+5 더").length).toBeGreaterThan(0);
  });

  it("ties hidden remainders to the full-detail action", () => {
    setup({ focus: focusModel({ hiddenConnectionCount: 5 }) });
    expect(
      screen.getByRole("button", {
        name: /전체 상세.*\+5 더/,
      }),
    ).toBeInTheDocument();
  });

  it("wires connection click, full-detail open, and close", () => {
    const { onSelectConnection, onOpenFullDetail, onClose } = setup();

    fireEvent.click(screen.getByText("MCP SDK"));
    expect(onSelectConnection).toHaveBeenCalledWith("elements/mcp-sdk");

    fireEvent.click(screen.getByRole("button", { name: "전체 상세" }));
    expect(onOpenFullDetail).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state when there are no direct connections", () => {
    setup({
      focus: focusModel({
        connections: [],
        usedByCount: 0,
        dependsOnCount: 0,
        relationQuality: {
          strong: 0,
          supported: 0,
          weak: 0,
          review: 0,
        },
      }),
    });
    expect(screen.getByText("직접 연결 없음")).toBeInTheDocument();
  });

  it("renders the plain-language 'so what' significance block when provided", () => {
    setup({
      significance: {
        whatLine: "AI Agent Partner 영역에 속한 역량",
        importanceLine: "12곳이 직접 의존하는 핵심 축이에요",
        dependsOnLine: "2곳에 기댑니다: MCP SDK, Parser",
        impactLine: "바꾸면 최대 7곳까지 영향이 번질 수 있어요",
        level: "core",
      },
    });
    expect(screen.getByText("AI Agent Partner 영역에 속한 역량")).toBeInTheDocument();
    expect(screen.getByText("12곳이 직접 의존하는 핵심 축이에요")).toBeInTheDocument();
    expect(screen.getByText("2곳에 기댑니다: MCP SDK, Parser")).toBeInTheDocument();
    expect(screen.getByText("바꾸면 최대 7곳까지 영향이 번질 수 있어요")).toBeInTheDocument();
  });

  it("omits the significance block when no significance is provided", () => {
    setup();
    expect(
      screen.queryByTestId("topology-node-significance"),
    ).not.toBeInTheDocument();
  });
});
