import { fireEvent, render, screen } from "@testing-library/react";
import Graph from "graphology";
import { describe, expect, it, vi } from "vitest";
import type { SigmaEdgeAttrs, SigmaNodeAttrs } from "../lib/graph-build";
import { SigmaSkeletonCards } from "./SigmaSkeletonCards";

function makeGraph(): Graph<SigmaNodeAttrs, SigmaEdgeAttrs> {
  const graph = new Graph<SigmaNodeAttrs, SigmaEdgeAttrs>();
  const base = {
    size: 5,
    color: "#888",
    borderColor: "#999",
    outerBorderColor: "rgba(0,0,0,0)",
    projectSlug: "",
    categoryId: "",
    isHub: false,
    ownerKey: "unassigned",
  };
  graph.addNode("project:p", { ...base, x: 0, y: 0, label: "Atlas" });
  graph.addNode("domain:d1", { ...base, x: 10, y: 5, label: "Views" });
  return graph;
}

const stubSigma = {
  graphToViewport: ({ x, y }: { x: number; y: number }) => ({
    x: x * 2 + 100,
    y: y * 2 + 50,
  }),
  on: vi.fn(),
  off: vi.fn(),
};

const CARDS = [
  { id: "project:p", title: "Atlas", kind: "project", tier: 0 as const },
  { id: "domain:d1", title: "Views", kind: "domain", tier: 1 as const, count: 59 },
] as const;

describe("SigmaSkeletonCards — 골격 DOM 카드 오버레이", () => {
  it("카드마다 제목 + count 칩을 렌더하고 viewport 좌표에 배치한다", () => {
    render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={makeGraph()}
        cards={[...CARDS]}
        selectedSlug={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Atlas")).toBeInTheDocument();
    expect(screen.getByText("Views")).toBeInTheDocument();
    expect(screen.getByText("59")).toBeInTheDocument();
    const domainCard = screen.getByText("Views").closest("[data-skeleton-card]");
    expect(domainCard).toHaveStyle({
      transform: "translate(-50%, -50%) translate3d(120px, 60px, 0)",
    });
  });

  it("선택된 카드는 data-selected — 인디고 ring 채널", () => {
    render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={makeGraph()}
        cards={[...CARDS]}
        selectedSlug="domain:d1"
        onSelect={vi.fn()}
      />,
    );
    const card = screen.getByText("Views").closest("[data-skeleton-card]");
    expect(card).toHaveAttribute("data-selected", "true");
  });

  it("카드 클릭이 onSelect(slug) 를 부른다", () => {
    const onSelect = vi.fn();
    render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={makeGraph()}
        cards={[...CARDS]}
        selectedSlug={null}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText("Views"));
    expect(onSelect).toHaveBeenCalledWith("domain:d1");
  });

  it("선택이 있으면 ego(선택+이웃) 밖 카드는 dim 마크", () => {
    const graph = makeGraph();
    graph.addNode("domain:d2", {
      size: 5,
      color: "#888",
      borderColor: "#999",
      outerBorderColor: "rgba(0,0,0,0)",
      projectSlug: "",
      categoryId: "",
      isHub: false,
      ownerKey: "unassigned",
      x: -10,
      y: -5,
      label: "Agent",
    });
    graph.addEdge("project:p", "domain:d1", { size: 1, color: "#fff" });
    render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={graph}
        cards={[
          ...CARDS,
          { id: "domain:d2", title: "Agent", kind: "domain", tier: 1 as const },
        ]}
        selectedSlug="domain:d1"
        onSelect={vi.fn()}
      />,
    );
    // d1(선택)과 p(이웃)는 풀 잉크, d2(비-ego)는 dim.
    expect(
      screen.getByText("Views").closest("[data-skeleton-card]"),
    ).toHaveAttribute("data-dimmed", "false");
    expect(
      screen.getByText("Atlas").closest("[data-skeleton-card]"),
    ).toHaveAttribute("data-dimmed", "false");
    expect(
      screen.getByText("Agent").closest("[data-skeleton-card]"),
    ).toHaveAttribute("data-dimmed", "true");
  });

  it("그래프에 없는 카드는 건너뛴다 (전이 상태 안전)", () => {
    render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={makeGraph()}
        cards={[
          ...CARDS,
          { id: "domain:ghost", title: "Ghost", kind: "domain", tier: 1 as const },
        ]}
        selectedSlug={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByText("Ghost")).not.toBeInTheDocument();
  });
});
