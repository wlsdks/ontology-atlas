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
  close: "닫기",
  moreSuffix: "더",
  expandedNote: "{count}개는 왼쪽 지도에 펼쳐져 있어요",
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
      },
      {
        id: "domains/ai-agent-partner",
        title: "AI Agent Partner",
        kind: "domain",
        direction: "incoming",
        relationType: "contains",
      },
    ],
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
  it("keeps the detail surface compact so the map remains readable", () => {
    setup();
    const popover = screen.getByTestId("topology-node-popover");
    expect(popover.className).toContain("w-[min(300px,calc(100vw-2rem))]");
    expect(popover.className).toContain("max-h-[min(74vh,32rem)]");
    expect(popover.className).toContain("2xl:w-[320px]");
  });

  it("지도에 펼쳐진 자식은 리스트에서 제외하고 안내 한 줄로 축약한다", () => {
    setup({ expandedChildIds: new Set(["elements/mcp-sdk"]) });
    // 펼쳐진 자식은 중복 나열 안 함 (Toss '한 화면에 한 가지').
    expect(screen.queryByText("MCP SDK")).not.toBeInTheDocument();
    expect(screen.getByText("1개는 왼쪽 지도에 펼쳐져 있어요")).toBeInTheDocument();
    // 펼쳐지지 않은 관계는 그대로.
    expect(screen.getByText("AI Agent Partner")).toBeInTheDocument();
  });

  it("연결이 전부 펼쳐졌으면 빈 상태 문구 대신 안내만 보여준다", () => {
    setup({
      expandedChildIds: new Set(["elements/mcp-sdk", "domains/ai-agent-partner"]),
    });
    expect(screen.getByText("2개는 왼쪽 지도에 펼쳐져 있어요")).toBeInTheDocument();
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
        name: /MCP SDK.*이 노드가 기대는 곳.*사용/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /AI Agent Partner.*이 노드를 쓰는 곳.*포함/,
      }),
    ).toBeInTheDocument();
  });

  it("shows the connected node kind in each connection row", () => {
    setup();
    expect(
      screen.getByRole("button", {
        name: /MCP SDK.*요소.*이 노드가 기대는 곳.*사용/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /AI Agent Partner.*도메인.*이 노드를 쓰는 곳.*포함/,
      }),
    ).toBeInTheDocument();
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
