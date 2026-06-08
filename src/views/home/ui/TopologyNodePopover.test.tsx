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
  it("renders the node title, kind, summary, and its direct connections", () => {
    setup();
    expect(screen.getByText("MCP Server")).toBeInTheDocument();
    expect(screen.getByText("capability")).toBeInTheDocument();
    expect(screen.getByText("AI agent surface.")).toBeInTheDocument();
    // each direct connection is a row the user can click into
    expect(screen.getByText("MCP SDK")).toBeInTheDocument();
    expect(screen.getByText("AI Agent Partner")).toBeInTheDocument();
  });

  it("shows plain-language counts instead of graph jargon", () => {
    setup();
    expect(screen.getByText("이 노드를 쓰는 곳")).toBeInTheDocument();
    expect(screen.getByText("이 노드가 기대는 곳")).toBeInTheDocument();
    // no '영향받음' / '의존 N' raw jargon
    expect(screen.queryByText(/영향받음/)).not.toBeInTheDocument();
  });

  it("reports a hidden remainder when connections are capped", () => {
    setup({ focus: focusModel({ hiddenConnectionCount: 5 }) });
    expect(screen.getByText("+5 더")).toBeInTheDocument();
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
});
