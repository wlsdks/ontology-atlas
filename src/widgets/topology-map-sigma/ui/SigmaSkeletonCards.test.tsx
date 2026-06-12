import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Graph from "graphology";
import { describe, expect, it, vi } from "vitest";
import { ONTOLOGY_KIND_TONE } from "@/entities/ontology-class";
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
  viewportToGraph: ({ x, y }: { x: number; y: number }) => ({
    x: (x - 100) / 2,
    y: (y - 50) / 2,
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

  it("초기 배치가 끝나기 전에는 overlay 를 ready 로 표시하지 않는다", async () => {
    render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={makeGraph()}
        cards={[...CARDS]}
        selectedSlug={null}
        onSelect={vi.fn()}
      />,
    );
    const layer = screen.getByTestId("sigma-skeleton-cards");

    expect(layer).toHaveAttribute("data-skeleton-cards-ready", "false");
    expect(layer.className).toContain("data-[skeleton-cards-ready=false]:opacity-0");

    await waitFor(
      () => expect(layer).toHaveAttribute("data-skeleton-cards-ready", "true"),
      { timeout: 1000 },
    );
  });

  it("카드 표면이 kind 틴트 정량 토큰 (bg 8% · border 18% — 패널 평준화)", () => {
    render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={makeGraph()}
        cards={[...CARDS]}
        selectedSlug={null}
        onSelect={vi.fn()}
      />,
    );
    const domainCard = screen
      .getByText("Views")
      .closest("[data-skeleton-card]") as HTMLElement;
    const expectAlpha = (alpha: string) =>
      ONTOLOGY_KIND_TONE.domain.fill.replace(/,\s*[\d.]+\)$/, `, ${alpha})`);
    expect(domainCard.style.getPropertyValue("--card-border")).toBe(
      expectAlpha("0.18"),
    );
    // 틴트는 불투명 panel 베이스 위 레이어 — 반투명 bg 단독이면 뒤 엣지가 비친다.
    const tint = domainCard.querySelector("[data-kind-tint]");
    expect(tint).toHaveStyle({
      backgroundColor: expectAlpha("0.08"),
    });
  });

  it("카드 주변에 edge clearance mask 를 깔아 흰 선이 라운드 모서리로 삐져나오지 않게 한다", () => {
    render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={makeGraph()}
        cards={[...CARDS]}
        selectedSlug={null}
        onSelect={vi.fn()}
      />,
    );
    const domainCard = screen
      .getByText("Views")
      .closest("[data-skeleton-card]") as HTMLElement;
    const mask = domainCard.querySelector("[data-edge-mask]");
    expect(mask).toBeInTheDocument();
    expect(mask).toHaveClass("bg-[color:var(--color-canvas)]");
    expect(mask).toHaveStyle({ inset: "-10px" });
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

  it("선택된 카드는 다른 골격 카드보다 위에 뜨고 selected wash 를 쓴다", () => {
    render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={makeGraph()}
        cards={[...CARDS]}
        selectedSlug="domain:d1"
        onSelect={vi.fn()}
      />,
    );
    const selectedCard = screen
      .getByText("Views")
      .closest("[data-skeleton-card]") as HTMLElement;
    const projectCard = screen
      .getByText("Atlas")
      .closest("[data-skeleton-card]") as HTMLElement;
    const tint = selectedCard.querySelector("[data-kind-tint]") as HTMLElement;
    expect(selectedCard).toHaveStyle({ zIndex: "8" });
    expect(projectCard).toHaveStyle({ zIndex: "0" });
    expect(tint.style.background).toContain(
      "var(--topology-card-selected-wash)",
    );
  });

  it("긴 skeleton 제목은 카드 폭 안에서 truncate 되어 주변 카드와 겹칠 여지를 줄인다", () => {
    render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={makeGraph()}
        cards={[
          {
            id: "domain:d1",
            title: "Very Long Capability Name That Should Not Push The Card Wider",
            kind: "domain",
            tier: 1 as const,
          },
        ]}
        selectedSlug={null}
        onSelect={vi.fn()}
      />,
    );
    const title = screen.getByText(
      "Very Long Capability Name That Should Not Push The Card Wider",
    );
    expect(title).toHaveClass("min-w-0", "truncate");
    expect(title.closest("[data-skeleton-card]")).toHaveStyle({
      maxWidth: "var(--topology-anchor-card-max-width, 14rem)",
    });
  });

  it("카드 위치 transform 은 transition 하지 않는다 (초기 배치 중 겹침 방지)", () => {
    render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={makeGraph()}
        cards={[...CARDS]}
        selectedSlug={null}
        onSelect={vi.fn()}
      />,
    );
    const card = screen.getByText("Views").closest("[data-skeleton-card]")!;

    expect(card.className).not.toContain("transition-[opacity,border-color,transform]");
    expect(card.className).toContain("transition-[opacity,border-color,box-shadow]");
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
    // d1(선택)만 풀 잉크 — 상위 방향 이웃(p)도 anchor-dim, 비-이웃(d2)도 dim.
    // (ego = 선택 + *하위 kind* 자식 열 — 디자이너 패널 합의)
    expect(
      screen.getByText("Views").closest("[data-skeleton-card]"),
    ).toHaveAttribute("data-dimmed", "false");
    expect(
      screen.getByText("Atlas").closest("[data-skeleton-card]"),
    ).toHaveAttribute("data-dimmed", "true");
    expect(
      screen.getByText("Agent").closest("[data-skeleton-card]"),
    ).toHaveAttribute("data-dimmed", "true");
  });

  it("선택의 자식 카드로 SVG 커넥터 path 를 그린다 (MindNode S-커브)", () => {
    const graph = makeGraph();
    graph.addNode("capability:c1", {
      size: 5,
      color: "#888",
      borderColor: "#999",
      outerBorderColor: "rgba(0,0,0,0)",
      projectSlug: "",
      categoryId: "",
      isHub: false,
      ownerKey: "unassigned",
      x: 30,
      y: 5,
      label: "Cap",
    });
    graph.addEdge("domain:d1", "capability:c1", {
      size: 1,
      color: "#fff",
      kind: "contains",
      relationType: "contains",
    });
    render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={graph}
        cards={[
          ...CARDS,
          {
            id: "capability:c1",
            title: "Cap",
            kind: "capability",
            tier: 2 as const,
          },
        ]}
        selectedSlug="domain:d1"
        onSelect={vi.fn()}
      />,
    );
    // 하위 kind 이웃(capability)으로만 커넥터 — 상위(project)는 없음.
    expect(
      document.querySelector('[data-connector="capability:c1"]'),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-connector="capability:c1"]')).toHaveAttribute(
      "data-relation-type",
      "contains",
    );
    expect(document.querySelector("[data-connector-relation-label]")).toHaveTextContent(
      "contains",
    );
    expect(document.querySelector("[data-connector-relation-label]")).toHaveAttribute(
      "data-relation-label-to",
      "capability:c1",
    );
    expect(document.querySelector("[data-relation-label-bg]")).toHaveAttribute(
      "data-relation-label-bg",
      "ego:capability:c1→domain:d1",
    );
    expect(document.querySelector('[data-connector="project:p"]')).toBeNull();
  });

  it("hover 시 간단 팝업 — 계층 라벨 + 설명", () => {
    render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={makeGraph()}
        cards={[
          {
            ...CARDS[1],
            summary: "토폴로지·브라우즈·빌더를 묶는 화면 도메인",
          },
        ]}
        selectedSlug={null}
        onSelect={vi.fn()}
        describeKind={(kind) => (kind === "domain" ? "도메인 · 2계층" : kind)}
      />,
    );
    const card = screen.getByText("Views").closest("[data-skeleton-card]")!;
    fireEvent.mouseEnter(card);
    expect(screen.getByTestId("skeleton-card-hover")).toHaveTextContent(
      "도메인 · 2계층",
    );
    expect(screen.getByTestId("skeleton-card-hover")).toHaveTextContent(
      "화면 도메인",
    );
    fireEvent.mouseLeave(card);
    expect(screen.queryByTestId("skeleton-card-hover")).toBeNull();
  });

  it("드래그(이동 4px 초과) 후 click 은 선택을 발화하지 않는다", () => {
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
    const card = screen.getByText("Views").closest("[data-skeleton-card]")!;
    fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
    fireEvent.pointerMove(card, { clientX: 60, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(card, { clientX: 60, clientY: 40, pointerId: 1 });
    fireEvent.click(card);
    expect(onSelect).not.toHaveBeenCalled();
    // 제자리 클릭은 선택.
    fireEvent.pointerDown(card, { clientX: 60, clientY: 40, pointerId: 1, button: 0 });
    fireEvent.pointerUp(card, { clientX: 60, clientY: 40, pointerId: 1 });
    fireEvent.click(card);
    expect(onSelect).toHaveBeenCalledWith("domain:d1");
  });

  it("anchor 카드를 드래그하면 연결된 카드 묶음이 같은 delta 로 움직여 서로 겹치지 않는다", () => {
    const graph = makeGraph();
    graph.addEdge("project:p", "domain:d1", {
      size: 1,
      color: "#fff",
      kind: "contains",
      relationType: "contains",
    });
    graph.addNode("domain:d2", {
      size: 5,
      color: "#888",
      borderColor: "#999",
      outerBorderColor: "rgba(0,0,0,0)",
      projectSlug: "",
      categoryId: "",
      isHub: false,
      ownerKey: "unassigned",
      x: -20,
      y: -20,
      label: "Disconnected",
    });
    render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={graph}
        cards={[
          ...CARDS,
          {
            id: "domain:d2",
            title: "Disconnected",
            kind: "domain",
            tier: 1 as const,
          },
        ]}
        selectedSlug={null}
        onSelect={vi.fn()}
      />,
    );
    const card = screen.getByText("Views").closest("[data-skeleton-card]")!;
    fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
    expect(card).toHaveAttribute("data-drag-cluster", "true");
    expect(screen.getByText("Atlas").closest("[data-skeleton-card]")).toHaveAttribute(
      "data-drag-cluster",
      "true",
    );
    expect(screen.getByText("Disconnected").closest("[data-skeleton-card]")).toHaveAttribute(
      "data-drag-cluster",
      "false",
    );
    expect(document.querySelector("[data-drag-cluster-connector]")).toHaveAttribute(
      "data-drag-connector-to",
      "project:p",
    );
    expect(document.querySelector("[data-drag-cluster-connector]")).toHaveAttribute(
      "data-relation-type",
      "contains",
    );
    expect(document.querySelector("[data-drag-relation-label]")).toHaveTextContent(
      "contains",
    );
    expect(document.querySelector("[data-relation-label-bg]")).toHaveAttribute(
      "data-relation-label-bg",
      "drag:domain:d1→project:p",
    );
    fireEvent.pointerMove(card, { clientX: 60, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(card, { clientX: 60, clientY: 40, pointerId: 1 });

    expect(graph.getNodeAttributes("domain:d1").x).toBeCloseTo(35);
    expect(graph.getNodeAttributes("domain:d1").y).toBeCloseTo(20);
    expect(graph.getNodeAttributes("project:p").x).toBeCloseTo(25);
    expect(graph.getNodeAttributes("project:p").y).toBeCloseTo(15);
    expect(graph.getNodeAttributes("domain:d2").x).toBeCloseTo(-20);
    expect(graph.getNodeAttributes("domain:d2").y).toBeCloseTo(-20);
    expect(card).toHaveAttribute("data-drag-cluster", "false");
    expect(document.querySelector("[data-drag-cluster-connector]")).toBeNull();
    expect(document.querySelector("[data-drag-relation-label]")).toBeNull();
  });

  it("드래그한 묶음이 다른 카드와 겹치면 비연결 카드를 밀어낸다", () => {
    const graph = makeGraph();
    graph.addEdge("project:p", "domain:d1", { size: 1, color: "#fff" });
    graph.addNode("domain:d2", {
      size: 5,
      color: "#888",
      borderColor: "#999",
      outerBorderColor: "rgba(0,0,0,0)",
      projectSlug: "",
      categoryId: "",
      isHub: false,
      ownerKey: "unassigned",
      x: 38,
      y: 20,
      label: "Collision Candidate",
    });
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getMockRect(this: HTMLElement) {
        const slug = this.dataset?.slug;
        if (!slug) {
          return {
            left: 0,
            top: 0,
            right: 800,
            bottom: 600,
            width: 800,
            height: 600,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          };
        }
        const attrs = graph.getNodeAttributes(slug);
        const center = stubSigma.graphToViewport(attrs);
        const width = 120;
        const height = 40;
        return {
          left: center.x - width / 2,
          top: center.y - height / 2,
          right: center.x + width / 2,
          bottom: center.y + height / 2,
          width,
          height,
          x: center.x - width / 2,
          y: center.y - height / 2,
          toJSON: () => ({}),
        };
      });

    try {
      render(
        <SigmaSkeletonCards
          sigma={stubSigma}
          graph={graph}
          cards={[
            ...CARDS,
            {
              id: "domain:d2",
              title: "Collision Candidate",
              kind: "domain",
              tier: 1 as const,
            },
          ]}
          selectedSlug={null}
          onSelect={vi.fn()}
        />,
      );
      const card = screen.getByText("Views").closest("[data-skeleton-card]")!;
      fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
      fireEvent.pointerMove(card, { clientX: 60, clientY: 40, pointerId: 1 });
      fireEvent.pointerUp(card, { clientX: 60, clientY: 40, pointerId: 1 });

      expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
        "data-drag-push-away-count",
        "1",
      );
      expect(graph.getNodeAttributes("domain:d1").x).toBeCloseTo(35);
      expect(graph.getNodeAttributes("project:p").x).toBeCloseTo(25);
      expect(graph.getNodeAttributes("domain:d2").y).not.toBeCloseTo(20);
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("도킹된 자식 카드를 드래그해도 부모 anchor 묶음이 같이 움직인다", () => {
    const graph = makeGraph();
    graph.addNode("capability:c1", {
      size: 5,
      color: "#888",
      borderColor: "#999",
      outerBorderColor: "rgba(0,0,0,0)",
      projectSlug: "",
      categoryId: "",
      isHub: false,
      ownerKey: "unassigned",
      x: 30,
      y: 5,
      label: "Cap",
    });
    graph.addEdge("project:p", "domain:d1", { size: 1, color: "#fff" });
    graph.addEdge("domain:d1", "capability:c1", { size: 1, color: "#fff" });

    render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={graph}
        cards={[
          ...CARDS,
          {
            id: "capability:c1",
            title: "Cap",
            kind: "capability",
            tier: 2 as const,
            dock: {
              parentId: "domain:d1",
              index: 0,
              total: 1,
              side: "right",
            },
          },
        ]}
        selectedSlug="domain:d1"
        onSelect={vi.fn()}
      />,
    );

    const dockedCard = screen.getByText("Cap").closest("[data-skeleton-card]")!;
    fireEvent.pointerDown(dockedCard, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
    expect(dockedCard).toHaveAttribute("data-drag-cluster", "true");
    expect(screen.getByText("Views").closest("[data-skeleton-card]")).toHaveAttribute(
      "data-drag-cluster",
      "true",
    );
    fireEvent.pointerMove(dockedCard, { clientX: 60, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(dockedCard, { clientX: 60, clientY: 40, pointerId: 1 });

    expect(graph.getNodeAttributes("domain:d1").x).toBeCloseTo(35);
    expect(graph.getNodeAttributes("domain:d1").y).toBeCloseTo(20);
    expect(graph.getNodeAttributes("project:p").x).toBeCloseTo(25);
    expect(graph.getNodeAttributes("project:p").y).toBeCloseTo(15);
    // The docked child keeps its graph coordinate; its DOM position is derived
    // from the moved parent card so the visual branch travels as one unit.
    expect(graph.getNodeAttributes("capability:c1").x).toBeCloseTo(30);
    expect(graph.getNodeAttributes("capability:c1").y).toBeCloseTo(5);
  });

  it("pointercancel 후 move 는 카드를 끌지 않는다 (stale drag 방지)", () => {
    const graph = makeGraph();
    const before = { ...graph.getNodeAttributes("domain:d1") };
    render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={graph}
        cards={[...CARDS]}
        selectedSlug={null}
        onSelect={vi.fn()}
      />,
    );
    const card = screen.getByText("Views").closest("[data-skeleton-card]")!;
    fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
    fireEvent.pointerCancel(card, { pointerId: 1 });
    fireEvent.pointerMove(card, { clientX: 120, clientY: 90, pointerId: 1 });
    expect(graph.getNodeAttributes("domain:d1").x).toBe(before.x);
    expect(graph.getNodeAttributes("domain:d1").y).toBe(before.y);
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
