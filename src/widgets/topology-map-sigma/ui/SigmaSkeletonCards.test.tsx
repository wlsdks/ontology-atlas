import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("초기 배치 직후 overlay 를 ready 로 표시해 첫 화면 blank 를 막는다", () => {
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

    expect(layer).toHaveAttribute("data-skeleton-cards-ready", "true");
    expect(layer.className).toContain("data-[skeleton-cards-ready=false]:opacity-0");
  });

  it("14-inch급 viewport 에서 적용된 Relief UI scale 을 DOM marker 로 노출한다", () => {
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1512,
    });
    try {
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

      expect(layer).toHaveAttribute("data-topology-ui-scale", "1.12");
      expect(layer.style.getPropertyValue("--topology-card-scale")).toBe("1.12");
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: originalInnerWidth,
      });
    }
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

  it("선택 노드의 직접 dock companion 가시성을 레이어 marker 로 노출한다", async () => {
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getMockRect(this: HTMLElement) {
        const slug = this.dataset?.slug;
        if (slug === "domain:d1") {
          return {
            left: 120,
            top: 80,
            right: 240,
            bottom: 128,
            width: 120,
            height: 48,
            x: 120,
            y: 80,
            toJSON: () => ({}),
          };
        }
        if (slug === "capability:c1") {
          return {
            left: 304,
            top: 80,
            right: 448,
            bottom: 124,
            width: 144,
            height: 44,
            x: 304,
            y: 80,
            toJSON: () => ({}),
          };
        }
        return {
          left: 0,
          top: 0,
          right: 960,
          bottom: 540,
          width: 960,
          height: 540,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
    });

    try {
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
        x: 14,
        y: 7,
        label: "Agent handoff",
      });
      render(
        <SigmaSkeletonCards
          sigma={stubSigma}
          graph={graph}
          cards={[
            ...CARDS,
            {
              id: "capability:c1",
              title: "Agent handoff",
              kind: "capability",
              tier: 2 as const,
              dock: { parentId: "domain:d1", index: 0, total: 1, side: "right" },
            },
          ]}
          selectedSlug="domain:d1"
          onSelect={vi.fn()}
        />,
      );
      const layer = screen.getByTestId("sigma-skeleton-cards");

      await waitFor(() => {
        expect(layer).toHaveAttribute("data-selected-dock-companion-count", "1");
        expect(layer).toHaveAttribute(
          "data-selected-dock-visible-companion-count",
          "1",
        );
        expect(layer).toHaveAttribute("data-selected-dock-companion-visible", "true");
        expect(layer).toHaveAttribute(
          "data-click-focus-relationship-context",
          "durable",
        );
        expect(layer).toHaveAttribute(
          "data-click-focus-relationship-context-source",
          "selected-dock-companions",
        );
      });
    } finally {
      rectSpy.mockRestore();
    }
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

  it("safe margin 안의 선택 카드는 collision padding 이 화면 밖이어도 drag 가능한 표면으로 남긴다", () => {
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getMockRect(this: HTMLElement) {
        const slug = this.dataset?.slug;
        if (!slug) {
          return {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 1080,
            width: 1920,
            height: 1080,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          };
        }
        if (slug === "domain:d1") {
          return {
            left: 1518,
            top: 8,
            right: 1636,
            bottom: 52,
            width: 118,
            height: 44,
            x: 1518,
            y: 8,
            toJSON: () => ({}),
          };
        }
        return {
          left: 960,
          top: 540,
          right: 1080,
          bottom: 584,
          width: 120,
          height: 44,
          x: 960,
          y: 540,
          toJSON: () => ({}),
        };
      });

    try {
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

      expect(selectedCard).not.toHaveAttribute("data-surface-hidden", "true");
      expect(selectedCard.style.opacity).toBe("1");
      expect(selectedCard.style.pointerEvents).toBe("");
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("충돌 회피가 모든 카드를 숨기면 핵심 tier 카드를 실제 visible 상태로 복구한다", () => {
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getMockRect(this: HTMLElement) {
        const testId = this.dataset?.testid;
        if (testId === "topology-analysis-panel") {
          return {
            left: 0,
            top: 0,
            right: 400,
            bottom: 300,
            width: 400,
            height: 300,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          };
        }
        const slug = this.dataset?.slug;
        if (!slug) {
          return {
            left: 0,
            top: 0,
            right: 400,
            bottom: 300,
            width: 400,
            height: 300,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          };
        }
        return {
          left: 100,
          top: 80,
          right: 220,
          bottom: 124,
          width: 120,
          height: 44,
          x: 100,
          y: 80,
          toJSON: () => ({}),
        };
      });

    try {
      const { container } = render(
        <>
          <div data-testid="topology-analysis-panel" />
          <SigmaSkeletonCards
            sigma={stubSigma}
            graph={makeGraph()}
            cards={[...CARDS]}
            selectedSlug={null}
            onSelect={vi.fn()}
          />
        </>,
      );

      const layer = screen.getByTestId("sigma-skeleton-cards");
      const projectCard = screen
        .getByText("Atlas")
        .closest("[data-skeleton-card]") as HTMLElement;
      const domainCard = screen
        .getByText("Views")
        .closest("[data-skeleton-card]") as HTMLElement;

      expect(layer).toHaveAttribute("data-visibility-fallback", "true");
      expect(layer).toHaveAttribute("data-visibility-fallback-count", "2");
      expect(projectCard).not.toHaveAttribute("data-surface-hidden", "true");
      expect(domainCard).not.toHaveAttribute("data-surface-hidden", "true");
      expect(projectCard.style.visibility).toBe("visible");
      expect(domainCard.style.visibility).toBe("visible");
      expect(container.querySelectorAll('[data-skeleton-card][style*="opacity: 1"]')).toHaveLength(2);
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("fallback 은 viewport 밖 핵심 tier 카드를 다시 visible 로 살리지 않는다", () => {
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getMockRect(this: HTMLElement) {
        const testId = this.dataset?.testid;
        if (testId === "topology-analysis-panel") {
          return {
            left: 0,
            top: 0,
            right: 400,
            bottom: 300,
            width: 400,
            height: 300,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          };
        }
        const slug = this.dataset?.slug;
        if (!slug) {
          return {
            left: 0,
            top: 0,
            right: 400,
            bottom: 300,
            width: 400,
            height: 300,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          };
        }
        return {
          left: 540,
          top: -120,
          right: 660,
          bottom: -76,
          width: 120,
          height: 44,
          x: 540,
          y: -120,
          toJSON: () => ({}),
        };
      });

    try {
      render(
        <>
          <div data-testid="topology-analysis-panel" />
          <SigmaSkeletonCards
            sigma={stubSigma}
            graph={makeGraph()}
            cards={[...CARDS]}
            selectedSlug={null}
            onSelect={vi.fn()}
          />
        </>,
      );

      const layer = screen.getByTestId("sigma-skeleton-cards");
      const projectCard = screen
        .getByText("Atlas")
        .closest("[data-skeleton-card]") as HTMLElement;
      const domainCard = screen
        .getByText("Views")
        .closest("[data-skeleton-card]") as HTMLElement;

      expect(layer).toHaveAttribute("data-visibility-fallback", "true");
      expect(layer).toHaveAttribute("data-visibility-fallback-count", "0");
      expect(projectCard).toHaveAttribute("data-surface-hidden", "true");
      expect(domainCard).toHaveAttribute("data-surface-hidden", "true");
    } finally {
      rectSpy.mockRestore();
    }
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

  it("선택된 카드의 직접 연결 묶음을 클릭 focus hull 로 유지한다", () => {
    const graph = makeGraph();
    graph.addEdge("project:p", "domain:d1", {
      size: 1,
      color: "#aaa",
      kind: "contains",
      relationType: "contains",
      relationQuality: "strong",
      evidenceCount: 1,
    });
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const testId = this.getAttribute("data-testid");
        if (testId === "sigma-skeleton-cards") {
          return {
            left: 0,
            top: 0,
            right: 900,
            bottom: 700,
            width: 900,
            height: 700,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          };
        }
        if (this.dataset?.slug === "project:p") {
          return {
            left: 420,
            top: 310,
            right: 560,
            bottom: 360,
            width: 140,
            height: 50,
            x: 420,
            y: 310,
            toJSON: () => ({}),
          };
        }
        if (this.dataset?.slug === "domain:d1") {
          return {
            left: 590,
            top: 300,
            right: 710,
            bottom: 344,
            width: 120,
            height: 44,
            x: 590,
            y: 300,
            toJSON: () => ({}),
          };
        }
        return {
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      });
    try {
      const { container } = render(
        <SigmaSkeletonCards
          sigma={stubSigma}
          graph={graph}
          cards={[...CARDS]}
          selectedSlug="project:p"
          onSelect={vi.fn()}
        />,
      );

      const hull = container.querySelector("[data-drag-cluster-hull]");

      expect(hull).toHaveAttribute("data-visible", "true");
      expect(hull).toHaveAttribute("data-cluster-mode", "focus");
      expect(hull).toHaveAttribute("data-focus-stage", "click-focus");
      expect(hull).toHaveAttribute("data-focus-attention-label", "linked-focus");
      expect(hull).toHaveAttribute("data-drag-cluster-size", "2");
      expect(hull).toHaveAttribute("data-focus-cluster-size", "2");
      expect(hull).toHaveTextContent("linked focus");
      expect(hull).toHaveStyle({ opacity: "0.8" });
      expect(document.querySelector("[data-focus-cluster-connector]")).toBeInTheDocument();
      expect(document.querySelector("[data-focus-relation-label]")).toBeInTheDocument();
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("14-inch click focus hull 은 왼쪽 분석 패널과 겹치지 않게 밀려난다", () => {
    const graph = makeGraph();
    graph.addEdge("project:p", "domain:d1", {
      size: 1,
      color: "#aaa",
      kind: "contains",
      relationType: "contains",
      relationQuality: "strong",
      evidenceCount: 1,
    });
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const testId = this.getAttribute("data-testid");
        if (testId === "sigma-skeleton-cards") {
          return {
            left: 0,
            top: 0,
            right: 900,
            bottom: 700,
            width: 900,
            height: 700,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          };
        }
        if (testId === "topology-analysis-panel") {
          return {
            left: 0,
            top: 100,
            right: 300,
            bottom: 380,
            width: 300,
            height: 280,
            x: 0,
            y: 100,
            toJSON: () => ({}),
          };
        }
        if (this.dataset?.slug === "project:p") {
          return {
            left: 160,
            top: 310,
            right: 300,
            bottom: 360,
            width: 140,
            height: 50,
            x: 160,
            y: 310,
            toJSON: () => ({}),
          };
        }
        if (this.dataset?.slug === "domain:d1") {
          return {
            left: 360,
            top: 300,
            right: 480,
            bottom: 344,
            width: 120,
            height: 44,
            x: 360,
            y: 300,
            toJSON: () => ({}),
          };
        }
        return {
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      });
    try {
      const { container } = render(
        <>
          <div data-testid="topology-analysis-panel" />
          <SigmaSkeletonCards
            sigma={stubSigma}
            graph={graph}
            cards={[...CARDS]}
            selectedSlug="project:p"
            onSelect={vi.fn()}
          />
        </>,
      );

      const hull = container.querySelector("[data-drag-cluster-hull]") as HTMLElement;
      const transform = hull.style.transform;
      const match = /translate3d\(([-\d.]+)px, ([-\d.]+)px, 0\)/.exec(transform);

      expect(hull).toHaveAttribute("data-visible", "true");
      expect(match).not.toBeNull();
      expect(Number(match?.[2])).toBeGreaterThan(388);
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("선택 카드라도 fixed surface 와 겹치면 카드 대신 focus panel/popover 가 선택 맥락을 대표한다", async () => {
    const graph = makeGraph();
    graph.addEdge("project:p", "domain:d1", {
      size: 1,
      color: "#aaa",
      kind: "contains",
      relationType: "contains",
      relationQuality: "strong",
      evidenceCount: 1,
    });
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const testId = this.getAttribute("data-testid");
        if (testId === "sigma-skeleton-cards") {
          return {
            left: 0,
            top: 0,
            right: 900,
            bottom: 700,
            width: 900,
            height: 700,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          };
        }
        if (testId === "topology-node-popover") {
          return {
            left: 20,
            top: 10,
            right: 190,
            bottom: 95,
            width: 175,
            height: 75,
            x: 20,
            y: 10,
            toJSON: () => ({}),
          };
        }
        if (this.dataset?.slug === "project:p") {
          return {
            left: 40,
            top: 30,
            right: 180,
            bottom: 80,
            width: 140,
            height: 50,
            x: 40,
            y: 30,
            toJSON: () => ({}),
          };
        }
        if (this.dataset?.slug === "domain:d1") {
          return {
            left: 590,
            top: 300,
            right: 710,
            bottom: 344,
            width: 120,
            height: 44,
            x: 590,
            y: 300,
            toJSON: () => ({}),
          };
        }
        return {
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      });
    const offsetWidthSpy = vi
      .spyOn(HTMLElement.prototype, "offsetWidth", "get")
      .mockImplementation(function (this: HTMLElement) {
        if (this.dataset?.slug === "project:p") return 140;
        if (this.dataset?.slug === "domain:d1") return 120;
        return 0;
      });
    const offsetHeightSpy = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        if (this.dataset?.slug === "project:p") return 50;
        if (this.dataset?.slug === "domain:d1") return 44;
        return 0;
      });

    const fixedSurface = document.createElement("div");
    fixedSurface.dataset.testid = "topology-node-popover";
    fixedSurface.textContent = "Selected context";
    fixedSurface.style.display = "block";
    fixedSurface.style.height = "75px";
    fixedSurface.style.opacity = "1";
    fixedSurface.style.visibility = "visible";
    fixedSurface.style.width = "175px";
    document.body.append(fixedSurface);

    try {
      render(
        <SigmaSkeletonCards
          sigma={stubSigma}
          graph={graph}
          cards={[...CARDS]}
          selectedSlug="project:p"
          onSelect={vi.fn()}
        />,
      );

      const selectedCard = document.querySelector(
        '[data-skeleton-card][data-slug="project:p"]',
      );

      await waitFor(() => {
        expect(selectedCard).toHaveAttribute("data-surface-hidden", "true");
      });
      const hull = document.querySelector("[data-drag-cluster-hull]");
      expect(hull).toHaveAttribute("data-visible", "true");
      expect(hull).toHaveAttribute("data-cluster-mode", "focus");
      expect(hull).toHaveAttribute("data-focus-cluster-size", "2");
      expect(selectedCard).toHaveStyle({ visibility: "hidden" });
      expect(screen.getByText("Selected context")).toBeVisible();
    } finally {
      fixedSurface.remove();
      rectSpy.mockRestore();
      offsetWidthSpy.mockRestore();
      offsetHeightSpy.mockRestore();
    }
  });

  it("overview 커넥터 클릭이 relation selection data 를 전달한다", () => {
    const onRelationSelect = vi.fn();
    const graph = makeGraph();
    graph.addEdge("project:p", "domain:d1", {
      size: 1,
      color: "#aaa",
      kind: "contains",
      relationType: "contains",
      relationQuality: "strong",
      evidenceCount: 1,
    });
    const { container } = render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={graph}
        cards={[...CARDS]}
        selectedSlug={null}
        onRelationSelect={onRelationSelect}
      />,
    );
    const hitPath = container.querySelector(
      '[data-relation-hit-path="true"][data-overview-connector-from="project:p"]',
    );
    const visiblePath = container.querySelector(
      '[data-overview-connector-from="project:p"]:not([data-relation-hit-path])',
    );

    expect(hitPath).toBeInTheDocument();
    expect(hitPath).toHaveAttribute("data-relation-quality", "strong");
    expect(visiblePath).toHaveAttribute("data-relation-quality", "strong");
    expect(visiblePath).toHaveAttribute("stroke", "rgba(139,151,255,0.50)");
    expect(visiblePath).toHaveAttribute("stroke-width", "1.34");
    fireEvent.click(hitPath!);
    expect(onRelationSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "project:p",
        target: "domain:d1",
        sourceName: "Atlas",
        targetName: "Views",
        relationType: "contains",
        relationQuality: "strong",
        evidenceCount: 1,
      }),
    );
  });

  it("overview connector 는 약한 관계를 먼저 그리고 strong/source-backed 관계를 위에 올린다", () => {
    const graph = makeGraph();
    graph.addNode("domain:d2", {
      ...graph.getNodeAttributes("domain:d1"),
      x: 14,
      y: -4,
      label: "Agent Partner",
    });
    graph.addEdge("project:p", "domain:d1", {
      size: 1,
      color: "#aaa",
      kind: "contains",
      relationType: "contains",
      relationQuality: "weak",
      evidenceCount: 0,
    });
    graph.addEdge("project:p", "domain:d2", {
      size: 1,
      color: "#aaa",
      kind: "contains",
      relationType: "contains",
      relationQuality: "strong",
      evidenceCount: 2,
    });
    const { container } = render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={graph}
        cards={[
          ...CARDS,
          { id: "domain:d2", title: "Agent Partner", kind: "domain", tier: 1 as const },
        ]}
        selectedSlug={null}
      />,
    );
    const visiblePaths = Array.from(
      container.querySelectorAll(
        "[data-overview-connector-from]:not([data-relation-hit-path]):not([data-selected-relation-halo])",
      ),
    );

    expect(visiblePaths).toHaveLength(2);
    expect(visiblePaths[0]).toHaveAttribute("data-relation-quality", "weak");
    expect(visiblePaths[1]).toHaveAttribute("data-relation-quality", "strong");
    expect(visiblePaths[1]).toHaveAttribute("stroke-width", "1.34");
  });

  it("선택된 relation edge 는 visible connector 를 인디고로 강조한다", () => {
    const graph = makeGraph();
    const edgeId = graph.addEdge("project:p", "domain:d1", {
      size: 1,
      color: "#aaa",
      kind: "contains",
      relationType: "contains",
      relationQuality: "strong",
      evidenceCount: 1,
    });
    const { container } = render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={graph}
        cards={[...CARDS]}
        selectedSlug={null}
        selectedRelationEdgeId={edgeId}
      />,
    );
    const selectedPath = container.querySelector(
      '[data-selected-relation="true"]:not([data-relation-hit-path])',
    );
    const selectedHalo = container.querySelector(
      '[data-selected-relation-halo="true"]',
    );

    expect(selectedPath).toBeInTheDocument();
    expect(selectedPath).toHaveAttribute("stroke", "rgba(139,151,255,0.92)");
    expect(selectedPath).toHaveAttribute("stroke-width", "2.2");
    expect(selectedHalo).toBeInTheDocument();
    expect(selectedHalo).toHaveAttribute("stroke", "rgba(139,151,255,0.18)");
    expect(selectedHalo).toHaveAttribute("stroke-width", "7.2");
  });

  it("ego relation label badge 클릭도 relation selection data 를 전달한다", () => {
    const onRelationSelect = vi.fn();
    const graph = makeGraph();
    graph.addEdge("project:p", "domain:d1", {
      size: 1,
      color: "#aaa",
      kind: "contains",
      relationType: "contains",
      relationQuality: "strong",
      evidenceCount: 1,
    });
    const { container } = render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={graph}
        cards={[...CARDS]}
        selectedSlug="project:p"
        onRelationSelect={onRelationSelect}
      />,
    );
    const labelHit = container.querySelector('button[data-relation-label-hit="true"]');

    expect(labelHit).toBeInTheDocument();
    fireEvent.click(labelHit!);
    expect(onRelationSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "project:p",
        target: "domain:d1",
        relationType: "contains",
      }),
    );
  });

  it("ego relation label badge 에 relation quality dot 을 함께 표시한다", () => {
    const graph = makeGraph();
    graph.addEdge("project:p", "domain:d1", {
      size: 1,
      color: "#aaa",
      kind: "contains",
      relationType: "contains",
      relationQuality: "weak",
      evidenceCount: 0,
    });
    const { container } = render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={graph}
        cards={[...CARDS]}
        selectedSlug="project:p"
      />,
    );
    const labelHit = container.querySelector('button[data-relation-label-hit="true"]');
    const qualityDot = labelHit?.querySelector("[data-relation-quality-dot]");
    const evidenceGlyph = labelHit?.querySelector("[data-relation-evidence-glyph]");
    const svgLabel = container.querySelector('[data-connector-relation-label="true"]');
    const svgBadge = container.querySelector('[data-relation-label-bg^="ego:"]');

    expect(labelHit).toHaveAttribute("data-relation-quality", "weak");
    expect(labelHit).toHaveAttribute("data-relation-evidence-state", "needs-review");
    expect(labelHit).toHaveAttribute("aria-label", "contains relation · weak · needs review");
    expect(labelHit).toHaveAttribute("data-label-geometry-source", "html-hit-target");
    expect(labelHit?.className).toContain("inline-flex");
    expect(qualityDot).toBeInTheDocument();
    expect(qualityDot?.className).toContain("bg-amber-300");
    expect(evidenceGlyph).toHaveTextContent("!");
    expect(svgLabel).toHaveAttribute("opacity", "0");
    expect(svgLabel).toHaveAttribute("aria-hidden", "true");
    expect(svgBadge).toHaveAttribute("opacity", "0");
    expect(svgBadge).toHaveAttribute("pointer-events", "none");
  });

  it("source-backed relation label badge 는 근거 개수를 표시한다", () => {
    const graph = makeGraph();
    graph.addEdge("project:p", "domain:d1", {
      size: 1,
      color: "#aaa",
      kind: "contains",
      relationType: "contains",
      relationQuality: "strong",
      evidenceCount: 3,
      authored: true,
    });
    const { container } = render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={graph}
        cards={[...CARDS]}
        selectedSlug="project:p"
      />,
    );

    const labelHit = container.querySelector('button[data-relation-label-hit="true"]');
    const evidenceGlyph = labelHit?.querySelector("[data-relation-evidence-glyph]");

    expect(labelHit).toHaveAttribute("data-relation-evidence-state", "source-backed");
    expect(labelHit).toHaveAttribute("data-relation-evidence-count", "3");
    expect(labelHit).toHaveAttribute("aria-label", "contains relation · strong · 3 sources");
    expect(evidenceGlyph).toHaveTextContent("3");
  });

  it("선택된 source-backed relation label 은 agent handoff gate 를 지도 위에 표시한다", () => {
    const graph = makeGraph();
    const edgeId = graph.addEdge("project:p", "domain:d1", {
      size: 1,
      color: "#aaa",
      kind: "contains",
      relationType: "contains",
      relationQuality: "strong",
      evidenceCount: 2,
    });
    const { container } = render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={graph}
        cards={[...CARDS]}
        selectedSlug="project:p"
        selectedRelationEdgeId={edgeId}
      />,
    );

    const labelHit = container.querySelector('button[data-relation-label-hit="true"]');
    const gateChip = labelHit?.querySelector("[data-relation-label-agent-gate]");

    expect(labelHit).toHaveAttribute("data-selected-relation", "true");
    expect(labelHit).toHaveAttribute("data-agent-gate-kind", "handoff-ready");
    expect(labelHit).toHaveAttribute("data-primary-copy-action", "explain_relation");
    expect(labelHit).toHaveAttribute(
      "data-cli-fallback-command",
      "ontology-atlas explain 'project:p' 'domain:d1' [vault] --type 'contains'",
    );
    expect(labelHit).toHaveAttribute("data-relation-fact-route", "fact>evidence>gate>action");
    expect(labelHit).toHaveAttribute("data-relation-fact-route-quality", "strong");
    expect(labelHit).toHaveAttribute("data-relation-fact-route-evidence", "source-backed");
    expect(labelHit).toHaveAttribute("data-relation-fact-route-gate", "handoff-ready");
    expect(labelHit).toHaveAttribute("data-relation-fact-route-action", "explain_relation");
    expect(labelHit).toHaveAttribute("data-relation-label-agent-gate-visible", "true");
    expect(labelHit).toHaveAttribute(
      "aria-label",
      "contains relation · strong · 2 sources · MCP/CLI · explain relation",
    );
    expect(gateChip).toHaveAttribute("data-relation-label-agent-gate", "handoff-ready");
    expect(gateChip).toHaveAttribute("data-primary-copy-action", "explain_relation");
    expect(gateChip).toHaveTextContent("MCP/CLI");
    expect(labelHit?.querySelector("[data-relation-fact-route-rail]")).toHaveTextContent(
      "fact→src→MCP/CLI",
    );
  });

  it("선택된 weak relation label 은 먼저 relation_check 를 안내한다", () => {
    const graph = makeGraph();
    const edgeId = graph.addEdge("project:p", "domain:d1", {
      size: 1,
      color: "#aaa",
      kind: "contains",
      relationType: "contains",
      relationQuality: "weak",
      evidenceCount: 0,
    });
    const { container } = render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={graph}
        cards={[...CARDS]}
        selectedSlug="project:p"
        selectedRelationEdgeId={edgeId}
      />,
    );

    const labelHit = container.querySelector('button[data-relation-label-hit="true"]');
    const gateChip = labelHit?.querySelector("[data-relation-label-agent-gate]");

    expect(labelHit).toHaveAttribute("data-agent-gate-kind", "preflight-first");
    expect(labelHit).toHaveAttribute("data-primary-copy-action", "relation_check");
    expect(labelHit).toHaveAttribute(
      "data-cli-fallback-command",
      "ontology-atlas relation-check 'project:p' 'domain:d1' 'contains' [vault]",
    );
    expect(labelHit).toHaveAttribute("data-relation-fact-route", "fact>evidence>gate>action");
    expect(labelHit).toHaveAttribute("data-relation-fact-route-evidence", "needs-review");
    expect(labelHit).toHaveAttribute("data-relation-fact-route-gate", "preflight-first");
    expect(labelHit).toHaveAttribute("data-relation-fact-route-action", "relation_check");
    expect(labelHit).toHaveAttribute(
      "aria-label",
      "contains relation · weak · needs review · check · relation check",
    );
    expect(gateChip).toHaveTextContent("check");
    expect(labelHit?.querySelector("[data-relation-fact-route-rail]")).toHaveTextContent(
      "fact→review→check",
    );
  });

  it("드래그 중에는 relation label hit target 을 꺼서 카드 이동과 관계 선택이 충돌하지 않는다", async () => {
    const graph = makeGraph();
    graph.addEdge("project:p", "domain:d1", {
      size: 1,
      color: "#aaa",
      kind: "contains",
      relationType: "contains",
      relationQuality: "strong",
      evidenceCount: 1,
    });
    const { container } = render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={graph}
        cards={[...CARDS]}
        selectedSlug="project:p"
        onRelationSelect={vi.fn()}
      />,
    );
    const labelHit = container.querySelector(
      'button[data-relation-label-hit="true"]',
    ) as HTMLElement;
    const labelBadge = container.querySelector('[data-relation-label-bg^="ego:"]');
    const card = screen.getByText("Views").closest("[data-skeleton-card]")!;

    expect(labelHit).toHaveAttribute("data-drag-hit-disabled", "false");
    fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
    fireEvent.pointerMove(card, { clientX: 52, clientY: 30, pointerId: 1 });

    await waitFor(() => {
      expect(labelHit).toHaveAttribute("data-drag-hit-disabled", "true");
      expect(labelHit.style.pointerEvents).toBe("none");
      expect(labelBadge).toHaveAttribute("pointer-events", "none");
      expect(card).toHaveAttribute("data-drag-visibility-lock", "true");
      expect(card).toHaveStyle({ opacity: "1" });
    });
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
      x: 80,
      y: 5,
      label: "Cap",
    });
    graph.addEdge("domain:d1", "capability:c1", {
      size: 1,
      color: "#fff",
      kind: "contains",
      relationType: "contains",
      relationQuality: "strong",
      evidenceCount: 1,
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
      const connector = document.querySelector(
        '[data-connector="capability:c1"]:not([data-relation-hit-path])',
      );
      expect(connector).toBeInTheDocument();
      expect(connector).toHaveAttribute("data-relation-type", "contains");
      expect(connector).toHaveAttribute("data-relation-quality", "strong");
      expect(connector).toHaveAttribute("stroke", "rgba(139,151,255,0.50)");
      expect(connector).toHaveAttribute("data-connector-axis", "horizontal");
      expect(connector).toHaveAttribute("data-connector-clearance", "8");
      expect(connector?.getAttribute("d")).toContain("M 188 60");
      expect(connector?.getAttribute("d")).toContain("192 60");
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
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("2열 이상으로 접힌 선택 관계는 connector 와 label 을 같이 숨긴다", () => {
    const graph = makeGraph();
    for (let index = 0; index < 9; index += 1) {
      graph.addNode(`capability:c${index}`, {
        size: 5,
        color: "#888",
        borderColor: "#999",
        outerBorderColor: "rgba(0,0,0,0)",
        projectSlug: "",
        categoryId: "",
        isHub: false,
        ownerKey: "unassigned",
        x: 80,
        y: 5 + index,
        label: `Cap ${index}`,
      });
      graph.addEdge("domain:d1", `capability:c${index}`, {
        size: 1,
        color: "#fff",
        kind: "contains",
        relationType: "contains",
      });
    }
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
            ...Array.from({ length: 9 }, (_, index) => ({
              id: `capability:c${index}`,
              title: `Cap ${index}`,
              kind: "capability" as const,
              tier: 2 as const,
              dock: {
                parentId: "domain:d1",
                index: index === 0 ? 8 : index - 1,
                total: 9,
                side: "right" as const,
              },
            })),
          ]}
          selectedSlug="domain:d1"
          onSelect={vi.fn()}
        />,
      );

      const foldedConnector = document.querySelector(
        '[data-connector="capability:c0"]:not([data-relation-hit-path])',
      );
      const foldedLabel = document.querySelector(
        '[data-connector-relation-label][data-relation-label-to="capability:c0"]',
      );
      const foldedBadge = document.querySelector(
        '[data-relation-label-bg="ego:capability:c0→domain:d1"]',
      );

      expect(foldedConnector).toHaveAttribute("d", "");
      expect(foldedLabel).toHaveAttribute("opacity", "0");
      expect(foldedBadge).toHaveAttribute("opacity", "0");
    } finally {
      rectSpy.mockRestore();
    }
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

  it("드래그 중에는 hover 팝업을 새로 띄우지 않아 화면 깜빡임을 막는다", () => {
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

    const dragCard = screen.getByText("Views").closest("[data-skeleton-card]")!;
    const hoverTarget = screen
      .getByText("Disconnected")
      .closest("[data-skeleton-card]")!;

    fireEvent.pointerDown(dragCard, {
      clientX: 10,
      clientY: 10,
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerMove(dragCard, { clientX: 60, clientY: 40, pointerId: 1 });
    fireEvent.mouseEnter(hoverTarget);

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

  it("Path mode 에서는 카드 클릭을 일반 선택이 아니라 source/target 선택으로 처리한다", () => {
    const onSelect = vi.fn();
    const onPathSelectionChange = vi.fn();
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getMockRect(this: HTMLElement) {
        const slug = this.dataset?.slug;
        if (slug === "project:p") {
          return {
            left: 420,
            top: 220,
            right: 560,
            bottom: 260,
            width: 140,
            height: 40,
            x: 420,
            y: 220,
            toJSON: () => ({}),
          };
        }
        if (slug === "domain:d1") {
          return {
            left: 620,
            top: 220,
            right: 760,
            bottom: 260,
            width: 140,
            height: 40,
            x: 620,
            y: 220,
            toJSON: () => ({}),
          };
        }
        return {
          left: 0,
          top: 0,
          right: 960,
          bottom: 540,
          width: 960,
          height: 540,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      });
    try {
      const { rerender } = render(
        <SigmaSkeletonCards
          sigma={stubSigma}
          graph={makeGraph()}
          cards={[...CARDS]}
          selectedSlug={null}
          onSelect={onSelect}
          pathWorkflowActive
          pathSelection={{ sourceSlug: null, targetSlug: null }}
          onPathSelectionChange={onPathSelectionChange}
        />,
      );
      const sourceCard = screen.getByText("Atlas").closest("[data-skeleton-card]")!;

      fireEvent.click(sourceCard);
      expect(onSelect).not.toHaveBeenCalled();
      expect(onPathSelectionChange).toHaveBeenCalledWith({
        sourceSlug: "project:p",
        targetSlug: null,
      });

      rerender(
        <SigmaSkeletonCards
          sigma={stubSigma}
          graph={makeGraph()}
          cards={[...CARDS]}
          selectedSlug="project:p"
          onSelect={onSelect}
          pathWorkflowActive
          pathSelection={{ sourceSlug: "project:p", targetSlug: null }}
          onPathSelectionChange={onPathSelectionChange}
        />,
      );
      const rerenderedSourceCard = screen.getByText("Atlas").closest("[data-skeleton-card]")!;
      const targetCard = screen.getByText("Views").closest("[data-skeleton-card]")!;
      expect(rerenderedSourceCard).toHaveAttribute("data-path-role", "source");
      expect(screen.getByText("A")).toHaveAttribute("data-path-card-badge", "source");

      fireEvent.click(targetCard);
      expect(onPathSelectionChange).toHaveBeenLastCalledWith({
        sourceSlug: "project:p",
        targetSlug: "domain:d1",
      });
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("Path mode 에서도 카드 드래그 후 click 은 경로 선택을 발화하지 않는다", () => {
    const onPathSelectionChange = vi.fn();
    render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={makeGraph()}
        cards={[...CARDS]}
        selectedSlug={null}
        onSelect={vi.fn()}
        pathWorkflowActive
        pathSelection={{ sourceSlug: null, targetSlug: null }}
        onPathSelectionChange={onPathSelectionChange}
      />,
    );
    const card = screen.getByText("Views").closest("[data-skeleton-card]")!;

    fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
    fireEvent.pointerMove(card, { clientX: 60, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(card, { clientX: 60, clientY: 40, pointerId: 1 });
    fireEvent.click(card);

    expect(onPathSelectionChange).not.toHaveBeenCalled();
  });

  it("카드 드래그 pointer 이벤트는 Sigma canvas pan 으로 새지 않게 기본 동작과 전파를 막는다", () => {
    const parentPointerDown = vi.fn();
    const parentPointerMove = vi.fn();
    const parentPointerUp = vi.fn();
    render(
      <div
        onPointerDown={parentPointerDown}
        onPointerMove={parentPointerMove}
        onPointerUp={parentPointerUp}
      >
        <SigmaSkeletonCards
          sigma={stubSigma}
          graph={makeGraph()}
          cards={[...CARDS]}
          selectedSlug={null}
          onSelect={vi.fn()}
        />
      </div>,
    );
    const card = screen.getByText("Views").closest("[data-skeleton-card]")!;

    expect(
      fireEvent.pointerDown(card, {
        clientX: 10,
        clientY: 10,
        pointerId: 1,
        button: 0,
      }),
    ).toBe(false);
    expect(
      fireEvent.pointerMove(card, { clientX: 60, clientY: 40, pointerId: 1 }),
    ).toBe(false);
    expect(
      fireEvent.pointerUp(card, { clientX: 60, clientY: 40, pointerId: 1 }),
    ).toBe(false);
    expect(parentPointerDown).not.toHaveBeenCalled();
    expect(parentPointerMove).not.toHaveBeenCalled();
    expect(parentPointerUp).not.toHaveBeenCalled();
  });

  it("anchor 카드를 드래그하면 직접 연결된 context 카드까지 같은 delta 로 움직인다", () => {
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
    const layer = screen.getByTestId("sigma-skeleton-cards");
    fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
    expect(layer).toHaveAttribute("data-dragging-active", "false");
    expect(card).toHaveAttribute("data-drag-cluster", "true");
    expect(card).toHaveAttribute("data-dragging-active", "false");
    expect(card).toHaveStyle({ zIndex: "9" });
    expect(screen.getByText("Atlas").closest("[data-skeleton-card]")).toHaveAttribute(
      "data-drag-cluster",
      "true",
    );
    expect(screen.getByText("linked cards move together")).toBeInTheDocument();
    expect(screen.getByText("Disconnected").closest("[data-skeleton-card]")).toHaveAttribute(
      "data-drag-cluster",
      "false",
    );
    expect(document.querySelector("[data-drag-cluster-connector]")).toBeInTheDocument();
    expect(document.querySelector("[data-drag-relation-label]")).toBeInTheDocument();
    expect(document.querySelector("[data-drag-cluster-title]")).toHaveTextContent(
      "Views",
    );
    expect(document.querySelector("[data-drag-cluster-count]")).toHaveTextContent(
      "2 linked",
    );
    expect(
      document.querySelector('[data-relation-label-bg="drag:domain:d1→project:p"]'),
    ).toBeInTheDocument();
    fireEvent.pointerMove(card, { clientX: 60, clientY: 40, pointerId: 1 });
    expect(layer).toHaveAttribute("data-dragging-active", "true");
    expect(card).toHaveAttribute("data-dragging-active", "true");
    expect(document.querySelector("[data-drag-cluster-hull]")).toHaveAttribute(
      "data-drag-active",
      "true",
    );
    expect(screen.getByText("moving linked cards")).toBeInTheDocument();
    fireEvent.pointerUp(card, { clientX: 60, clientY: 40, pointerId: 1 });

    expect(graph.getNodeAttributes("domain:d1").x).toBeCloseTo(35);
    expect(graph.getNodeAttributes("domain:d1").y).toBeCloseTo(20);
    expect(graph.getNodeAttributes("project:p").x).toBeCloseTo(25);
    expect(graph.getNodeAttributes("project:p").y).toBeCloseTo(15);
    expect(graph.getNodeAttributes("domain:d2").x).toBeCloseTo(-20);
    expect(graph.getNodeAttributes("domain:d2").y).toBeCloseTo(-20);
    expect(card).toHaveAttribute("data-drag-cluster", "true");
    expect(layer).toHaveAttribute("data-dragging-active", "false");
    expect(document.querySelector("[data-drag-cluster-connector]")).toBeInTheDocument();
  });

  it("드래그 release 직후 linked group feedback 을 짧게 유지한 뒤 정리한다", () => {
    vi.useFakeTimers();
    const graph = makeGraph();
    graph.addEdge("project:p", "domain:d1", {
      size: 1,
      color: "#fff",
      kind: "contains",
      relationType: "contains",
    });
    try {
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
      const layer = screen.getByTestId("sigma-skeleton-cards");
      fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
      fireEvent.pointerMove(card, { clientX: 60, clientY: 40, pointerId: 1 });
      fireEvent.pointerUp(card, { clientX: 60, clientY: 40, pointerId: 1 });

      expect(card).toHaveAttribute("data-drag-cluster", "true");
      expect(layer).toHaveAttribute("data-dragging-active", "false");
      expect(screen.getByText("linked cards move together")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(520);
      });

      expect(card).toHaveAttribute("data-drag-cluster", "true");
      expect(document.querySelector("[data-drag-cluster-connector]")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(240);
      });

      expect(card).toHaveAttribute("data-drag-cluster", "false");
      expect(layer).toHaveAttribute("data-dragging-active", "false");
      expect(document.querySelector("[data-drag-cluster-connector]")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("제자리 클릭 release 는 linked group feedback 을 남기지 않는다", () => {
    const graph = makeGraph();
    graph.addEdge("project:p", "domain:d1", {
      size: 1,
      color: "#fff",
      kind: "contains",
      relationType: "contains",
    });
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
    const layer = screen.getByTestId("sigma-skeleton-cards");
    fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
    fireEvent.pointerUp(card, { clientX: 10, clientY: 10, pointerId: 1 });

    expect(card).toHaveAttribute("data-drag-cluster", "false");
    expect(layer).toHaveAttribute("data-dragging-active", "false");
    expect(document.querySelector("[data-drag-cluster-connector]")).toBeNull();
    expect(document.querySelector("[data-drag-relation-label]")).toBeNull();
  });

  it("project 드래그는 보이는 landmark 자식까지 함께 옮겨 branch 간 겹침을 막는다", () => {
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
      label: "Topology Inspection",
    });
    graph.addEdge("project:p", "domain:d1", {
      size: 1,
      color: "#fff",
      kind: "contains",
      relationType: "contains",
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
            title: "Topology Inspection",
            kind: "capability",
            tier: 2 as const,
          },
        ]}
        selectedSlug={null}
        onSelect={vi.fn()}
      />,
    );

    const projectCard = screen.getByText("Atlas").closest("[data-skeleton-card]")!;
    fireEvent.pointerDown(projectCard, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
    expect(screen.getByText("Views").closest("[data-skeleton-card]")).toHaveAttribute(
      "data-drag-cluster",
      "true",
    );
    expect(screen.getByText("Topology Inspection").closest("[data-skeleton-card]")).toHaveAttribute(
      "data-drag-cluster",
      "true",
    );

    fireEvent.pointerMove(projectCard, { clientX: 60, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(projectCard, { clientX: 60, clientY: 40, pointerId: 1 });

    expect(graph.getNodeAttributes("project:p").x).toBeCloseTo(25);
    expect(graph.getNodeAttributes("project:p").y).toBeCloseTo(15);
    expect(graph.getNodeAttributes("domain:d1").x).toBeCloseTo(35);
    expect(graph.getNodeAttributes("domain:d1").y).toBeCloseTo(20);
    expect(graph.getNodeAttributes("capability:c1").x).toBeCloseTo(55);
    expect(graph.getNodeAttributes("capability:c1").y).toBeCloseTo(20);
  });

  it("드래그 묶음은 고정 HUD 경계 앞에서 멈춰 패널 밑으로 들어가지 않는다", () => {
    const graph = makeGraph();
    graph.addEdge("project:p", "domain:d1", {
      size: 1,
      color: "#fff",
      kind: "contains",
      relationType: "contains",
    });
    const panel = document.createElement("div");
    panel.setAttribute("data-testid", "topology-analysis-panel");
    document.body.appendChild(panel);
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getMockRect(this: HTMLElement) {
        if (this.dataset?.testid === "topology-analysis-panel") {
          return {
            left: 380,
            top: 0,
            right: 800,
            bottom: 600,
            width: 420,
            height: 600,
            x: 380,
            y: 0,
            toJSON: () => ({}),
          };
        }
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
          cards={[...CARDS]}
          selectedSlug={null}
          onSelect={vi.fn()}
        />,
      );
      const card = screen.getByText("Views").closest("[data-skeleton-card]")!;
      fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
      fireEvent.pointerMove(card, { clientX: 270, clientY: 10, pointerId: 1 });
      fireEvent.pointerUp(card, { clientX: 270, clientY: 10, pointerId: 1 });

      expect(graph.getNodeAttributes("domain:d1").x).toBeLessThan(110);
      expect(graph.getNodeAttributes("domain:d1").x).toBeGreaterThan(80);
      expect(graph.getNodeAttributes("project:p").x).toBeCloseTo(84);
    } finally {
      rectSpy.mockRestore();
      panel.remove();
    }
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
    graph.addNode("domain:d3", {
      size: 5,
      color: "#888",
      borderColor: "#999",
      outerBorderColor: "rgba(0,0,0,0)",
      projectSlug: "",
      categoryId: "",
      isHub: false,
      ownerKey: "unassigned",
      x: 38,
      y: 50,
      label: "Second Collision Candidate",
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
            {
              id: "domain:d3",
              title: "Second Collision Candidate",
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
        "2",
      );
      expect(screen.getByText("Atlas").closest("[data-skeleton-card]")).toHaveAttribute(
        "data-drag-cluster",
        "true",
      );
      expect(
        screen.getByText("Collision Candidate").closest("[data-skeleton-card]"),
      ).toHaveAttribute("data-drag-pushed", "true");
      expect(
        screen.getByText("Second Collision Candidate").closest("[data-skeleton-card]"),
      ).toHaveAttribute("data-drag-pushed", "true");
      expect(graph.getNodeAttributes("domain:d1").x).toBeCloseTo(35);
      expect(graph.getNodeAttributes("project:p").x).toBeCloseTo(25);
      expect(graph.getNodeAttributes("domain:d2").y).not.toBeCloseTo(20);
      expect(graph.getNodeAttributes("domain:d3").y).not.toBeCloseTo(50);
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("도킹된 자식 카드를 드래그하면 잡은 카드 기준으로 연결 카드가 같이 움직인다", async () => {
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
        if (slug === "capability:c1") {
          return {
            left: 260,
            top: 40,
            right: 380,
            bottom: 80,
            width: 120,
            height: 40,
            x: 260,
            y: 40,
            toJSON: () => ({}),
          };
        }
        if (slug === "project:p") {
          return {
            left: 20,
            top: 220,
            right: 140,
            bottom: 260,
            width: 120,
            height: 40,
            x: 20,
            y: 220,
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
      await waitFor(() => expect(dockedCard).toHaveAttribute("data-drag-cluster", "true"));
      await waitFor(() =>
        expect(screen.getByText("Views").closest("[data-skeleton-card]")).toHaveAttribute(
          "data-drag-cluster",
          "true",
        ),
      );
      fireEvent.pointerMove(dockedCard, { clientX: 60, clientY: 40, pointerId: 1 });
      fireEvent.pointerUp(dockedCard, { clientX: 60, clientY: 40, pointerId: 1 });

      expect(graph.getNodeAttributes("domain:d1").x).toBeCloseTo(35);
      expect(graph.getNodeAttributes("domain:d1").y).toBeCloseTo(20);
      expect(graph.getNodeAttributes("capability:c1").x).toBeCloseTo(55);
      expect(graph.getNodeAttributes("capability:c1").y).toBeCloseTo(20);
      expect(graph.getNodeAttributes("project:p").x).toBeCloseTo(25);
      expect(graph.getNodeAttributes("project:p").y).toBeCloseTo(15);
    } finally {
      rectSpy.mockRestore();
    }
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
