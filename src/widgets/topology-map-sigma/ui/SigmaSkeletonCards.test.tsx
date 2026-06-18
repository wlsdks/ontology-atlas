import {
  act,
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
  type RenderOptions,
} from "@testing-library/react";
import Graph from "graphology";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ONTOLOGY_KIND_TONE } from "@/entities/ontology-class";
import enMessages from "../../../../messages/en.json";
import type { SigmaEdgeAttrs, SigmaNodeAttrs } from "../lib/graph-build";
import { SigmaSkeletonCards } from "./SigmaSkeletonCards";

function I18nTestProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

function render(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return rtlRender(ui, { wrapper: I18nTestProvider, ...options });
}

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
    const countChip = screen.getByText("59");
    expect(countChip).toBeInTheDocument();
    expect(countChip).toHaveAttribute(
      "data-count-chip-contract",
      "tokenized-node-scale-signal",
    );
    expect(countChip).toHaveAttribute(
      "data-surface-token",
      "--topology-card-count-surface",
    );
    expect(countChip).toHaveAttribute(
      "data-border-token",
      "--topology-card-count-border",
    );
    const domainCard = screen.getByText("Views").closest("[data-skeleton-card]");
    expect(domainCard).toHaveAttribute(
      "data-card-readable-width-contract",
      "tier-token-preserves-title-lane",
    );
    expect(domainCard).toHaveAttribute(
      "data-card-max-width-token",
      "--topology-card-max-width-domain",
    );
    expect(screen.getByText("Views")).toHaveAttribute(
      "data-card-title-lane-contract",
      "title-shrinks-before-meta-chips",
    );
    expect(screen.getByText("Views")).toHaveAttribute("data-full-title", "Views");
    expect(domainCard).toHaveStyle({
      transform: "translate(-50%, -50%) translate3d(120px, 60px, 0)",
      maxWidth: "var(--topology-card-max-width-domain)",
    });
    const layer = screen.getByTestId("sigma-skeleton-cards");
    expect(layer.style.getPropertyValue("--topology-card-max-width-project")).toBe("224px");
    expect(layer.style.getPropertyValue("--topology-card-max-width-domain")).toBe("248px");
    expect(layer.style.getPropertyValue("--topology-card-max-width-capability")).toBe("312px");
    expect(layer.style.getPropertyValue("--topology-card-max-width-element")).toBe("224px");
    expect(layer.style.getPropertyValue("--topology-card-selected-focus-max-width")).toBe("360px");
    expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-drag-dom-index-contract",
      "drag-release-reuses-card-elements",
    );
    expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-connector-dom-index-contract",
      "reuse-card-index",
    );
    expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-connector-rect-cache-contract",
      "frame-local-card-rect-cache",
    );
    expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-connector-rect-cache-accounting",
      "reads-plus-hits",
    );
    expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-connector-rect-cache-read-count",
      expect.stringMatching(/^\d+$/),
    );
    expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-connector-rect-cache-hit-count",
      expect.stringMatching(/^\d+$/),
    );
    expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-dock-drag-snapshot-contract",
      "single-pass-card-rect-read",
    );
    expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-visibility-count-contract",
      "single-pass-unless-fallback",
    );
    expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-visibility-stats-report-contract",
      "dedupe-stable-counts",
    );
    expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-dom-write-dedupe-contract",
      "skip-unchanged-transform-and-path",
    );
    expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-fixed-surface-measure-contract",
      "single-pass-rect-read",
    );
    expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-relation-label-blocker-contract",
      "reuse-visible-card-rects",
    );
    expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-relation-label-blocker-source",
      "visibility-pass",
    );
    expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-relation-label-handoff-contract",
      "label-level-mcp-cli-fallback",
    );
    expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-selected-relation-label-handoff",
      "none",
    );
    expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-relation-label-query-contract",
      "indexed-once",
    );
    expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
      "data-path-endpoint-separation-contract",
      "source-target-min-gap",
    );
  });

  it("capability 카드 폭은 별도 토큰으로 제목 lane 을 더 넓게 보존한다", () => {
    const graph = makeGraph();
    graph.addNode("capability:c1", {
      ...graph.getNodeAttributes("domain:d1"),
      x: 30,
      y: 10,
      label: "Product Owner Operating System",
    });

    render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={graph}
        cards={[
          ...CARDS,
          {
            id: "capability:c1",
            title: "Product Owner Operating System",
            kind: "capability",
            tier: 2 as const,
            count: 1,
          },
        ]}
        selectedSlug={null}
        onSelect={vi.fn()}
      />,
    );

    const card = screen
      .getByText("Product Owner Operating System")
      .closest("[data-skeleton-card]");
    expect(card).toHaveAttribute(
      "data-card-max-width-token",
      "--topology-card-max-width-capability",
    );
    expect(card).toHaveStyle({
      maxWidth: "var(--topology-card-max-width-capability)",
    });
  });

  it("선택 카드에 직접 관계 요약 chip 을 붙여 edge label 을 읽기 전 맥락을 준다", () => {
    const graph = makeGraph();
    graph.addEdge("project:p", "domain:d1", {
      size: 1,
      color: "rgba(139,151,255,0.28)",
      kind: "contains",
      relationType: "contains",
      relationQuality: "strong",
      evidenceCount: 1,
      authored: true,
    });

    render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={graph}
        cards={[...CARDS]}
        selectedSlug="project:p"
        onSelect={vi.fn()}
      />,
    );

    const summary = screen.getByTestId("sigma-selected-card-relation-summary");
    expect(summary).toHaveAttribute(
      "data-relation-summary-contract",
      "selected-card-direct-facts",
    );
    expect(summary).toHaveAttribute(
      "data-relation-summary-surface-token",
      "--topology-relation-summary-surface",
    );
    expect(summary).toHaveAttribute(
      "data-relation-summary-border-token",
      "--topology-relation-summary-border",
    );
    expect(summary).toHaveAttribute(
      "data-relation-summary-text-token",
      "--topology-relation-summary-text",
    );
    expect(summary).toHaveAttribute("data-relation-count", "1");
    expect(summary).toHaveAttribute("data-relation-type-count", "1");
    expect(summary).toHaveAttribute(
      "data-relation-summary-readable-text",
      "1 fact · 1 type · inspect",
    );
    expect(summary).toHaveAttribute(
      "data-relation-summary-visible-contract",
      "primary-count-plus-inspect-action-visible-full-summary-accessible",
    );
    expect(summary).toHaveAttribute(
      "data-relation-summary-map-label-fallback",
      "selected-card-keeps-action-when-map-labels-collapse",
    );
    expect(summary).toHaveAttribute("data-relation-summary-visible-text", "1 fact · inspect");
    expect(summary).toHaveAttribute("aria-label", "1 fact · 1 type · inspect");
    expect(summary).toHaveAttribute("title", "1 fact · 1 type · inspect");
    expect(summary).toHaveTextContent("1 fact · inspect");
  });

  it("health repair target 을 카드 표면의 audit target 으로 표시한다", () => {
    render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={makeGraph()}
        cards={[...CARDS]}
        selectedSlug={null}
        healthRepairTarget={{ slug: "project:p", kind: "orphan" }}
        onSelect={vi.fn()}
      />,
    );

    const layer = screen.getByTestId("sigma-skeleton-cards");
    expect(layer).toHaveAttribute(
      "data-health-repair-audit-target-contract",
      "panel-target-card-highlight",
    );
    expect(layer).toHaveAttribute(
      "data-health-repair-audit-target-slug",
      "project:p",
    );
    expect(layer).toHaveAttribute("data-health-repair-audit-target-kind", "orphan");

    const auditTarget = screen.getByText("Atlas").closest("[data-skeleton-card]");
    expect(auditTarget).toHaveAttribute("data-health-repair-audit-target", "true");
    expect(auditTarget).toHaveAttribute(
      "data-card-max-width-token",
      "--topology-health-repair-card-max-width",
    );
    expect(auditTarget?.querySelector("[data-card-title]")).toHaveAttribute(
      "data-card-title-lane-contract",
      "health-repair-target-keeps-project-title-readable",
    );
    expect(auditTarget).toHaveAttribute(
      "data-health-repair-audit-contract",
      "panel-target-card-highlight",
    );
    expect(auditTarget).toHaveAttribute("data-health-repair-audit-kind", "orphan");
    expect(auditTarget).toHaveAttribute("data-health-repair-audit-badge", "repair");
    expect(auditTarget).toHaveAttribute(
      "data-health-repair-audit-badge-contract",
      "inline-card-state-label",
    );
    expect(screen.getByTestId("sigma-health-repair-audit-badge")).toHaveTextContent(
      "repair",
    );
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

  it("afterRender 배치 작업을 같은 frame 안에서 한 번으로 합친다", () => {
    vi.useFakeTimers();
    const handlers = new Set<() => void>();
    const graphToViewport = vi.fn(stubSigma.graphToViewport);
    const sigma = {
      ...stubSigma,
      graphToViewport,
      on: vi.fn((type: "afterRender", handler: () => void) => {
        if (type === "afterRender") handlers.add(handler);
      }),
      off: vi.fn((type: "afterRender", handler: () => void) => {
        if (type === "afterRender") handlers.delete(handler);
      }),
    };
    try {
      render(
        <SigmaSkeletonCards
          sigma={sigma}
          graph={makeGraph()}
          cards={[...CARDS]}
          selectedSlug={null}
          onSelect={vi.fn()}
        />,
      );
      const initialCalls = graphToViewport.mock.calls.length;
      const handler = [...handlers][0];
      expect(handler).toBeDefined();

      act(() => {
        handler?.();
        handler?.();
        handler?.();
      });
      expect(graphToViewport).toHaveBeenCalledTimes(initialCalls);

      act(() => {
        vi.advanceTimersByTime(16);
      });
      expect(graphToViewport.mock.calls.length).toBeLessThanOrEqual(
        initialCalls + CARDS.length,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("afterRender stable visibility stats 는 부모 갱신을 반복하지 않는다", () => {
    vi.useFakeTimers();
    const handlers = new Set<() => void>();
    const onVisibilityChange = vi.fn();
    const sigma = {
      ...stubSigma,
      on: vi.fn((type: "afterRender", handler: () => void) => {
        if (type === "afterRender") handlers.add(handler);
      }),
      off: vi.fn((type: "afterRender", handler: () => void) => {
        if (type === "afterRender") handlers.delete(handler);
      }),
    };
    try {
      render(
        <SigmaSkeletonCards
          sigma={sigma}
          graph={makeGraph()}
          cards={[...CARDS]}
          selectedSlug={null}
          onSelect={vi.fn()}
          onVisibilityChange={onVisibilityChange}
        />,
      );
      expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
        "data-visibility-stats-report-contract",
        "dedupe-stable-counts",
      );
      const initialCalls = onVisibilityChange.mock.calls.length;
      const initialReportCount = screen
        .getByTestId("sigma-skeleton-cards")
        .getAttribute("data-visibility-stats-report-count");
      const handler = [...handlers][0];
      expect(handler).toBeDefined();

      act(() => {
        handler?.();
        vi.advanceTimersByTime(16);
        handler?.();
        vi.advanceTimersByTime(16);
        handler?.();
        vi.advanceTimersByTime(16);
      });

      expect(onVisibilityChange).toHaveBeenCalledTimes(initialCalls);
      expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
        "data-visibility-stats-report-count",
        initialReportCount,
      );
      expect(
        Number(
          screen
            .getByTestId("sigma-skeleton-cards")
            .getAttribute("data-dom-write-skipped-count") ?? "0",
        ),
      ).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("afterRender hot path 에서 fixed surface rect 를 짧은 캐시 창 동안 재사용한다", () => {
    vi.useFakeTimers();
    const handlers = new Set<() => void>();
    const sigma = {
      ...stubSigma,
      on: vi.fn((type: "afterRender", handler: () => void) => {
        if (type === "afterRender") handlers.add(handler);
      }),
      off: vi.fn((type: "afterRender", handler: () => void) => {
        if (type === "afterRender") handlers.delete(handler);
      }),
    };
    const fixedPanel = document.createElement("aside");
    fixedPanel.dataset.testid = "topology-analysis-panel";
    fixedPanel.style.opacity = "1";
    document.body.appendChild(fixedPanel);
    let fixedPanelRectReads = 0;
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.dataset.testid === "topology-analysis-panel") {
          fixedPanelRectReads += 1;
          return {
            bottom: 420,
            height: 260,
            left: 16,
            right: 336,
            top: 160,
            width: 320,
            x: 16,
            y: 160,
            toJSON: () => ({}),
          } as DOMRect;
        }
        if (this.dataset.testid === "sigma-skeleton-cards") {
          return {
            bottom: 768,
            height: 768,
            left: 0,
            right: 1024,
            top: 0,
            width: 1024,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          } as DOMRect;
        }
        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

    try {
      render(
        <SigmaSkeletonCards
          sigma={sigma}
          graph={makeGraph()}
          cards={[...CARDS]}
          selectedSlug={null}
          onSelect={vi.fn()}
        />,
      );
      const initialFixedPanelRectReads = fixedPanelRectReads;
      const handler = [...handlers][0];
      expect(handler).toBeDefined();

      act(() => {
        handler?.();
        vi.advanceTimersByTime(16);
        handler?.();
        vi.advanceTimersByTime(16);
      });

      expect(fixedPanelRectReads).toBe(initialFixedPanelRectReads);
    } finally {
      rectSpy.mockRestore();
      fixedPanel.remove();
      vi.useRealTimers();
    }
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

  it("카드 표면이 kind × tier 정량 토큰으로 온톨로지 계층을 더 선명하게 표시한다", () => {
    render(
      <SigmaSkeletonCards
        sigma={stubSigma}
        graph={makeGraph()}
        cards={[...CARDS]}
        selectedSlug={null}
        onSelect={vi.fn()}
      />,
    );
    const projectCard = screen
      .getByText("Atlas")
      .closest("[data-skeleton-card]") as HTMLElement;
    const domainCard = screen
      .getByText("Views")
      .closest("[data-skeleton-card]") as HTMLElement;

    const expectAlpha = (kind: "project" | "domain", alpha: string) =>
      ONTOLOGY_KIND_TONE[kind].fill.replace(/,\s*[\d.]+\)$/, `, ${alpha})`);
    expect(projectCard.style.getPropertyValue("--card-border")).toBe(
      expectAlpha("project", "0.34"),
    );
    expect(domainCard.style.getPropertyValue("--card-border")).toBe(
      expectAlpha("domain", "0.28"),
    );
    // 틴트는 불투명 panel 베이스 위 레이어 — 반투명 bg 단독이면 뒤 엣지가 비친다.
    const projectTint = projectCard.querySelector("[data-kind-tint]");
    const domainTint = domainCard.querySelector("[data-kind-tint]");
    expect(projectTint).toHaveStyle({
      backgroundColor: expectAlpha("project", "0.16"),
    });
    expect(domainTint).toHaveStyle({
      backgroundColor: expectAlpha("domain", "0.13"),
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
    expect(mask).toHaveAttribute(
      "data-edge-mask-contract",
      "paint-only-does-not-expand-card-scroll-width",
    );
    expect(mask).toHaveClass("inset-0");
    expect(mask).toHaveStyle({
      boxShadow: "0 0 0 10px var(--color-canvas)",
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

  it("충돌 회피가 모든 카드를 숨기면 fixed surface 밖으로 핵심 tier 카드 하나를 복구한다", () => {
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
      expect(layer).toHaveAttribute(
        "data-visibility-fallback-surface-contract",
        "restore-clear-or-shifted-landmark",
      );
      expect(layer).toHaveAttribute("data-visibility-fallback-count", "1");
      expect(projectCard).not.toHaveAttribute("data-surface-hidden", "true");
      expect(domainCard).toHaveAttribute("data-surface-hidden", "true");
      expect(projectCard.style.visibility).toBe("visible");
      expect(domainCard.style.visibility).toBe("hidden");
      expect(container.querySelectorAll('[data-skeleton-card][style*="opacity: 1"]')).toHaveLength(1);
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
    const card = title.closest("[data-skeleton-card]");
    expect(card).toHaveAttribute(
      "data-card-max-width-token",
      "--topology-card-max-width-domain",
    );
    expect(card).toHaveStyle({
      maxWidth: "var(--topology-card-max-width-domain)",
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
      expect(hull).toHaveAttribute("data-focus-cluster-density", "quiet-outline");
      expect(hull).toHaveAttribute("data-focus-stage", "click-focus");
      expect(hull).toHaveAttribute("data-focus-attention-label", "linked-focus");
      expect(hull).toHaveAttribute(
        "data-focus-hull-border-token",
        "--topology-focus-hull-border",
      );
      expect(hull).toHaveAttribute(
        "data-focus-hull-surface-token",
        "--topology-focus-hull-surface",
      );
      expect(hull).toHaveAttribute(
        "data-focus-hull-shadow-token",
        "--topology-focus-hull-shadow",
      );
      expect(hull).toHaveAttribute(
        "data-focus-hull-quiet-border-token",
        "--topology-focus-hull-quiet-border",
      );
      expect(hull).toHaveAttribute(
        "data-focus-hull-quiet-surface-token",
        "--topology-focus-hull-quiet-surface",
      );
      expect(hull).toHaveAttribute(
        "data-focus-hull-quiet-shadow-token",
        "--topology-focus-hull-quiet-shadow",
      );
      expect(hull).toHaveAttribute(
        "data-focus-breathing-room-contract",
        "viewport-edge-clearance",
      );
      expect(hull).toHaveAttribute("data-focus-breathing-room-px", "16");
      expect(hull).toHaveAttribute(
        "data-focus-label-clearance-contract",
        "quiet-outline-does-not-slice-card-labels",
      );
      expect(hull).toHaveAttribute("data-focus-label-clearance-px", "34");
      expect(hull).toHaveAttribute("data-drag-cluster-size", "2");
      expect(hull).toHaveAttribute("data-focus-cluster-size", "2");
      expect(hull).toBeEmptyDOMElement();
      expect(document.querySelector("[data-drag-cluster-title]")).not.toBeInTheDocument();
      expect(document.querySelector("[data-drag-cluster-count]")).not.toBeInTheDocument();
      expect(hull).toHaveStyle({ opacity: "0.8" });
      expect(document.querySelector("[data-focus-cluster-connector]")).toBeInTheDocument();
      expect(document.querySelector("[data-focus-relation-label]")).not.toBeInTheDocument();
      expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
        "data-focus-relation-label-density-contract",
        "click-focus-uses-ego-label-only",
      );
      expect(screen.getByTestId("sigma-skeleton-cards")).toHaveAttribute(
        "data-focus-relation-label-source",
        "ego-relation-labels",
      );
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

  it("1280 compact focus rail 에서는 selected map anchor 를 숨기고 넓은 화면에서는 유지한다", async () => {
    const graph = makeGraph();
    const fixedPanel = document.createElement("aside");
    fixedPanel.dataset.testid = "topology-analysis-panel";
    fixedPanel.dataset.analysisMode = "focus";
    fixedPanel.dataset.selectedFocusRail = "true";
    fixedPanel.style.display = "block";
    fixedPanel.style.opacity = "1";
    fixedPanel.style.visibility = "visible";
    document.body.append(fixedPanel);

    let containerWidth = 1280;
    const focusSigma = {
      ...stubSigma,
      graphToViewport: ({ x, y }: { x: number; y: number }) => ({
        x: x === 10 ? 580 : 760,
        y: y === 5 ? 240 : 100,
      }),
    };
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getMockRect(this: HTMLElement) {
        if (this.dataset?.testid === "topology-analysis-panel") {
          return {
            bottom: 720,
            height: 624,
            left: 16,
            right: 336,
            top: 96,
            width: 320,
            x: 16,
            y: 96,
            toJSON: () => ({}),
          } as DOMRect;
        }
        if (this.dataset?.testid === "sigma-skeleton-cards") {
          return {
            bottom: 800,
            height: 800,
            left: 0,
            right: containerWidth,
            top: 0,
            width: containerWidth,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          } as DOMRect;
        }
        if (this.dataset?.slug === "domain:d1") {
          return {
            bottom: 260,
            height: 40,
            left: 520,
            right: 640,
            top: 220,
            width: 120,
            x: 520,
            y: 220,
            toJSON: () => ({}),
          } as DOMRect;
        }
        return {
          bottom: 120,
          height: 40,
          left: 700,
          right: 820,
          top: 80,
          width: 120,
          x: 700,
          y: 80,
          toJSON: () => ({}),
        } as DOMRect;
      });
    const offsetWidthSpy = vi
      .spyOn(HTMLElement.prototype, "offsetWidth", "get")
      .mockReturnValue(120);
    const offsetHeightSpy = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockReturnValue(40);

    try {
      const { rerender } = render(
        <SigmaSkeletonCards
          sigma={focusSigma}
          graph={graph}
          cards={[...CARDS]}
          selectedSlug="domain:d1"
          onSelect={vi.fn()}
        />,
      );

      const layer = screen.getByTestId("sigma-skeleton-cards");
      const selectedCard = screen.getByText("Views").closest("[data-skeleton-card]");
      await waitFor(() => {
        expect(layer).toHaveAttribute(
          "data-selected-focus-card-visibility-policy",
          "hide-selected-card",
        );
        expect(layer).toHaveAttribute(
          "data-selected-focus-card-hide-max-width-px",
          "1280",
        );
        expect(selectedCard).toHaveAttribute("data-surface-hidden", "true");
      });

      containerWidth = 1920;
      rerender(
        <SigmaSkeletonCards
          sigma={focusSigma}
          graph={graph}
          cards={[...CARDS]}
          selectedSlug="domain:d1"
          onSelect={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(layer).toHaveAttribute(
          "data-selected-focus-card-visibility-policy",
          "show-selected-card",
        );
        expect(selectedCard).not.toHaveAttribute("data-surface-hidden", "true");
      });
    } finally {
      fixedPanel.remove();
      rectSpy.mockRestore();
      offsetWidthSpy.mockRestore();
      offsetHeightSpy.mockRestore();
    }
  });

  it("entry 중인 selected relation card 는 opacity 가 낮아도 card collision surface 로 예약한다", async () => {
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
        if (testId === "sigma-selected-edge-card") {
          return {
            left: 30,
            top: 20,
            right: 190,
            bottom: 92,
            width: 160,
            height: 72,
            x: 30,
            y: 20,
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

    const selectedRelationCard = document.createElement("aside");
    selectedRelationCard.dataset.testid = "sigma-selected-edge-card";
    selectedRelationCard.style.display = "block";
    selectedRelationCard.style.height = "72px";
    selectedRelationCard.style.opacity = "0";
    selectedRelationCard.style.visibility = "visible";
    selectedRelationCard.style.width = "160px";
    document.body.append(selectedRelationCard);

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

      const projectCard = document.querySelector(
        '[data-skeleton-card][data-slug="project:p"]',
      );

      await waitFor(() => {
        expect(projectCard).toHaveAttribute("data-surface-hidden", "true");
      });
    } finally {
      selectedRelationCard.remove();
      rectSpy.mockRestore();
      offsetWidthSpy.mockRestore();
      offsetHeightSpy.mockRestore();
    }
  });

  it("path result banner 와 가까운 endpoint 카드는 Path 위치 표식으로 보존한다", async () => {
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
        if (testId === "topology-path-result-banner") {
          return {
            left: 520,
            top: 260,
            right: 780,
            bottom: 380,
            width: 260,
            height: 120,
            x: 520,
            y: 260,
            toJSON: () => ({}),
          };
        }
        if (this.dataset?.slug === "project:p") {
          return {
            left: 70,
            top: 120,
            right: 210,
            bottom: 170,
            width: 140,
            height: 50,
            x: 70,
            y: 120,
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

    const pathResultBanner = document.createElement("div");
    pathResultBanner.dataset.testid = "topology-path-result-banner";
    pathResultBanner.textContent = "Path result";
    pathResultBanner.style.display = "block";
    pathResultBanner.style.height = "120px";
    pathResultBanner.style.opacity = "1";
    pathResultBanner.style.visibility = "visible";
    pathResultBanner.style.width = "260px";
    document.body.append(pathResultBanner);

    try {
      render(
        <SigmaSkeletonCards
          sigma={stubSigma}
          graph={makeGraph()}
          cards={[...CARDS]}
          selectedSlug={null}
          onSelect={vi.fn()}
          pathWorkflowActive
          pathSelection={{ sourceSlug: "project:p", targetSlug: "domain:d1" }}
        />,
      );

      const visibleProjectCard = document.querySelector(
        '[data-skeleton-card][data-slug="project:p"]',
      );
      const targetDomainCard = document.querySelector(
        '[data-skeleton-card][data-slug="domain:d1"]',
      );

      await waitFor(() => {
        expect(targetDomainCard).not.toHaveAttribute("data-surface-hidden", "true");
      });
      expect(targetDomainCard).toHaveAttribute("data-path-role", "target");
      expect(targetDomainCard).toHaveAttribute(
        "data-path-role-contract",
        "target-anchor-visible",
      );
      expect(targetDomainCard).toHaveStyle({ visibility: "visible" });
      expect(visibleProjectCard).toHaveStyle({ visibility: "visible" });
      expect(screen.getByText("Path result")).toBeVisible();
    } finally {
      pathResultBanner.remove();
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
    const hierarchySpine = container.querySelector(
      '[data-overview-hierarchy-spine="contains"][data-overview-connector-from="project:p"]',
    );
    const visiblePath = container.querySelector(
      '[data-overview-connector-from="project:p"]:not([data-relation-hit-path]):not([data-overview-hierarchy-spine])',
    );

    expect(hitPath).toBeInTheDocument();
    expect(hitPath).toHaveAttribute("data-relation-quality", "strong");
    expect(hierarchySpine).toHaveAttribute(
      "data-overview-hierarchy-spine-contract",
      "contains-relation-reads-as-ontology-backbone",
    );
    expect(hierarchySpine).toHaveAttribute(
      "data-relation-spine-halo-token",
      "--topology-relation-spine-halo",
    );
    expect(hierarchySpine).toHaveAttribute(
      "stroke-width",
      "var(--topology-relation-spine-halo-width)",
    );
    expect(visiblePath).toHaveAttribute("data-relation-quality", "strong");
    expect(visiblePath).toHaveAttribute(
      "data-relation-stroke-token",
      "--topology-relation-stroke-strong",
    );
    expect(visiblePath).toHaveAttribute(
      "data-relation-stroke-width-token",
      "--topology-relation-stroke-strong-width",
    );
    expect(visiblePath).toHaveAttribute("stroke", "var(--topology-relation-stroke-strong)");
    expect(visiblePath).toHaveAttribute(
      "stroke-width",
      "var(--topology-relation-stroke-strong-width)",
    );
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
        "[data-overview-connector-from]:not([data-relation-hit-path]):not([data-selected-relation-halo]):not([data-overview-hierarchy-spine])",
      ),
    );
    const hierarchySpines = container.querySelectorAll("[data-overview-hierarchy-spine]");

    expect(visiblePaths).toHaveLength(2);
    expect(hierarchySpines).toHaveLength(2);
    expect(visiblePaths[0]).toHaveAttribute("data-relation-quality", "weak");
    expect(visiblePaths[1]).toHaveAttribute("data-relation-quality", "strong");
    expect(visiblePaths[1]).toHaveAttribute(
      "data-relation-stroke-width-token",
      "--topology-relation-stroke-strong-width",
    );
    expect(visiblePaths[1]).toHaveAttribute(
      "stroke-width",
      "var(--topology-relation-stroke-strong-width)",
    );
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
    expect(selectedPath).toHaveAttribute(
      "data-relation-stroke-token",
      "--topology-relation-stroke-selected",
    );
    expect(selectedPath).toHaveAttribute(
      "data-relation-stroke-width-token",
      "--topology-relation-stroke-selected-width",
    );
    expect(selectedPath).toHaveAttribute("stroke", "var(--topology-relation-stroke-selected)");
    expect(selectedPath).toHaveAttribute(
      "stroke-width",
      "var(--topology-relation-stroke-selected-width)",
    );
    expect(selectedHalo).toBeInTheDocument();
    expect(selectedHalo).toHaveAttribute(
      "data-selected-relation-halo-token",
      "--topology-relation-label-selected-surface",
    );
    expect(selectedHalo).toHaveAttribute(
      "data-relation-stroke-halo-width-token",
      "--topology-relation-stroke-selected-halo-width",
    );
    expect(selectedHalo).toHaveAttribute(
      "stroke",
      "var(--topology-relation-label-selected-surface)",
    );
    expect(selectedHalo).toHaveAttribute(
      "stroke-width",
      "var(--topology-relation-stroke-selected-halo-width)",
    );
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

  it("ego relation label hover 도 compact edge tooltip data 를 전달한다", () => {
    const onRelationHover = vi.fn();
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
        onRelationHover={onRelationHover}
      />,
    );
    const labelHit = container.querySelector('button[data-relation-label-hit="true"]');

    expect(labelHit).toBeInTheDocument();
    expect(labelHit).toHaveAttribute(
      "data-relation-label-hover-contract",
      "compact-edge-tooltip",
    );
    fireEvent.mouseEnter(labelHit!);
    expect(onRelationHover).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "project:p",
        target: "domain:d1",
        relationType: "contains",
        evidenceCount: 1,
        x: expect.any(Number),
        y: expect.any(Number),
      }),
    );
    fireEvent.mouseLeave(labelHit!);
    expect(onRelationHover).toHaveBeenLastCalledWith(null);
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
    const evidenceChip = labelHit?.querySelector("[data-relation-evidence-glyph]");
    const visibleBadge = labelHit?.querySelector("[data-relation-label-visible-badge]");
    const svgLabel = container.querySelector('[data-connector-relation-label="true"]');
    const svgBadge = container.querySelector('[data-relation-label-bg^="ego:"]');
    const connectorPath = container.querySelector(
      'path[data-connector][data-relation-quality="weak"][data-relation-stroke-contract="quality-token"]',
    );
    const skeletonLayer = container.querySelector('[data-testid="sigma-skeleton-cards"]');

    expect(labelHit).toHaveAttribute("data-relation-quality", "weak");
    expect(labelHit).toHaveAttribute("data-relation-evidence-state", "needs-review");
    expect(labelHit).toHaveAttribute(
      "aria-label",
      "contains relation · weak · needs review · check · relation check",
    );
    expect(labelHit).toHaveAttribute("data-agent-gate-kind", "preflight-first");
    expect(labelHit).toHaveAttribute("data-primary-copy-action", "relation_check");
    expect(labelHit).toHaveAttribute(
      "data-cli-fallback-command",
      "ontology-atlas relation-check 'project:p' 'domain:d1' 'contains' [vault]",
    );
    expect(labelHit).toHaveAttribute("data-relation-fact-route", "fact>evidence>gate>action");
    expect(labelHit).toHaveAttribute("data-relation-fact-route-quality", "weak");
    expect(labelHit).toHaveAttribute("data-relation-fact-route-evidence", "needs-review");
    expect(labelHit).toHaveAttribute("data-relation-fact-route-gate", "preflight-first");
    expect(labelHit).toHaveAttribute("data-relation-fact-route-action", "relation_check");
    expect(labelHit).toHaveAttribute(
      "data-relation-label-fact-segmentation",
      "type>evidence>gate",
    );
    expect(labelHit).toHaveAttribute("data-relation-label-agent-gate-visible", "true");
    expect(labelHit).toHaveAttribute("data-label-geometry-source", "html-hit-target");
    expect(labelHit?.getAttribute("data-relation-label-viewport-clamp-contract")).toMatch(
      /centered-within-viewport|compacted-to-viewport-edge/,
    );
    expect(labelHit?.getAttribute("data-relation-label-viewport-clamp-side")).toMatch(
      /left|right|none/,
    );
    expect(skeletonLayer).toHaveAttribute(
      "data-relation-label-geometry-contract",
      "frame-positioned-hit-targets",
    );
    expect(skeletonLayer).toHaveAttribute(
      "data-relation-label-geometry-source",
      "after-render-layout-pass",
    );
    expect(skeletonLayer).toHaveAttribute("data-relation-label-geometry-expected-count", "1");
    expect(skeletonLayer).toHaveAttribute("data-relation-label-geometry-ready-count", "1");
    expect(skeletonLayer).toHaveAttribute("data-relation-label-geometry-pending-count", "0");
    expect(labelHit).toHaveAttribute(
      "data-relation-label-card-clearance-token",
      "--topology-relation-label-card-clearance",
    );
    expect(labelHit).toHaveAttribute(
      "data-relation-label-token-contract",
      "hit-target-and-visible-badge-share-relation-label-tokens",
    );
    expect(labelHit).toHaveAttribute(
      "data-relation-label-pointer-contract",
      "html-hit-target-click-selects-relation",
    );
    expect(labelHit).toHaveAttribute("data-relation-label-visibility", "visible-clear");
    expect(labelHit).toHaveAttribute(
      "data-relation-label-surface-token",
      "--topology-relation-label-surface",
    );
    expect(labelHit).toHaveAttribute(
      "data-relation-label-border-token",
      "--topology-relation-label-border",
    );
    expect(labelHit).toHaveAttribute(
      "data-relation-label-shadow-token",
      "--topology-relation-label-shadow",
    );
    expect(labelHit).toHaveAttribute(
      "data-relation-label-focus-ring-token",
      "--topology-relation-label-focus-ring",
    );
    expect(labelHit?.className).toContain("pointer-events-auto");
    expect(labelHit?.className).toContain("data-[drag-hit-disabled=true]:pointer-events-none");
    expect(labelHit).toHaveStyle({ pointerEvents: "auto" });
    expect(labelHit).toHaveStyle({ visibility: "visible" });
    expect(labelHit?.className).toContain("inline-flex");
    expect(visibleBadge).toHaveAttribute(
      "data-relation-label-surface-token",
      "--topology-relation-label-surface",
    );
    expect(visibleBadge).toHaveAttribute(
      "data-relation-label-border-token",
      "--topology-relation-label-border",
    );
    expect(visibleBadge).toHaveAttribute(
      "data-relation-label-shadow-token",
      "--topology-relation-label-shadow",
    );
    expect(visibleBadge).toHaveAttribute(
      "data-relation-label-fact-segmentation",
      "type>evidence>gate",
    );
    expect(visibleBadge).toHaveAttribute(
      "data-relation-label-segment-gap-token",
      "--topology-relation-label-segment-gap",
    );
    expect(visibleBadge).toHaveAttribute(
      "data-relation-label-segment-divider-token",
      "--topology-relation-label-border",
    );
    expect(qualityDot).toBeInTheDocument();
    expect(qualityDot).toHaveAttribute("data-relation-label-segment", "quality");
    expect(qualityDot).toHaveAttribute(
      "data-dot-token",
      "--topology-relation-quality-weak-dot",
    );
    expect(qualityDot).toHaveAttribute(
      "data-glow-token",
      "--topology-relation-quality-weak-glow",
    );
    const gateChip = labelHit?.querySelector("[data-relation-label-agent-gate]");
    const typeText = labelHit?.querySelector("[data-relation-label-type-text]");
    expect(typeText).toHaveAttribute("data-relation-label-segment", "type");
    expect(typeText).toHaveAttribute(
      "data-segment-divider-token",
      "--topology-relation-label-border",
    );
    expect(typeText).toHaveClass("border-r");
    expect(gateChip).toHaveAttribute("data-relation-label-agent-gate", "preflight-first");
    expect(gateChip).toHaveAttribute("data-relation-label-segment", "gate");
    expect(gateChip).toHaveAttribute("data-primary-copy-action", "relation_check");
    expect(gateChip).toHaveAttribute("data-route-chip-text", "check");
    expect(gateChip).toHaveAttribute(
      "data-surface-token",
      "--topology-relation-gate-preflight-surface",
    );
    expect(gateChip).toHaveAttribute(
      "data-border-token",
      "--topology-relation-gate-preflight-border",
    );
    expect(gateChip).toHaveAttribute(
      "data-text-token",
      "--topology-relation-gate-preflight-text",
    );
    expect(qualityDot?.className).toContain(
      "bg-[color:var(--topology-relation-quality-weak-dot)]",
    );
    expect(evidenceChip).toHaveAttribute(
      "data-relation-evidence-chip-contract",
      "proof-state-token",
    );
    expect(evidenceChip).toHaveAttribute("data-relation-label-segment", "evidence");
    expect(evidenceChip).toHaveAttribute(
      "data-surface-token",
      "--topology-relation-evidence-chip-surface",
    );
    expect(evidenceChip).toHaveAttribute(
      "data-border-token",
      "--topology-relation-evidence-chip-border",
    );
    expect(evidenceChip).toHaveAttribute("data-relation-evidence-chip-text", "R");
    expect(evidenceChip).toHaveTextContent("R");
    expect(connectorPath).toHaveAttribute(
      "data-relation-stroke-token",
      "--topology-relation-stroke-weak",
    );
    expect(connectorPath).toHaveAttribute(
      "data-relation-stroke-width-token",
      "--topology-relation-stroke-weak-width",
    );
    expect(connectorPath).toHaveAttribute("stroke", "var(--topology-relation-stroke-weak)");
    expect(connectorPath).toHaveAttribute(
      "stroke-width",
      "var(--topology-relation-stroke-weak-width)",
    );
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
    const evidenceChip = labelHit?.querySelector("[data-relation-evidence-glyph]");

    expect(labelHit).toHaveAttribute("data-relation-evidence-state", "source-backed");
    expect(labelHit).toHaveAttribute("data-relation-evidence-count", "3");
    expect(labelHit).toHaveAttribute(
      "aria-label",
      "contains relation · strong · 3 sources · explain · explain relation",
    );
    expect(labelHit).toHaveAttribute("data-agent-gate-kind", "handoff-ready");
    expect(labelHit).toHaveAttribute("data-primary-copy-action", "explain_relation");
    expect(labelHit).toHaveAttribute(
      "data-cli-fallback-command",
      "ontology-atlas explain 'project:p' 'domain:d1' [vault] --type 'contains'",
    );
    expect(labelHit).toHaveAttribute("data-relation-label-agent-gate-visible", "true");
    expect(evidenceChip).toHaveAttribute(
      "data-relation-evidence-chip-contract",
      "proof-state-token",
    );
    expect(evidenceChip).toHaveAttribute(
      "data-text-token",
      "--topology-relation-evidence-chip-text",
    );
    expect(evidenceChip).toHaveAttribute("data-relation-evidence-chip-text", "S3");
    expect(evidenceChip).toHaveTextContent("S3");
    const gateChip = labelHit?.querySelector("[data-relation-label-agent-gate]");
    expect(gateChip).toHaveAttribute("data-relation-label-agent-gate", "handoff-ready");
    expect(gateChip).toHaveAttribute("data-route-chip-text", "explain");
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
    const visibleBadge = labelHit?.querySelector("[data-relation-label-visible-badge]");
    const selectedOverlay = container.querySelector("[data-selected-relation-overlay]");
    const selectedOverlayEvidenceChip = selectedOverlay?.querySelector(
      "[data-relation-evidence-chip-contract]",
    );
    const gateChip = labelHit?.querySelector("[data-relation-label-agent-gate]");
    const root = screen.getByTestId("sigma-skeleton-cards");
    const selectedCard = container.querySelector('[data-skeleton-card][data-selected="true"]');
    const selectedCardTitle = selectedCard?.querySelector("[data-card-title]");
    const selectedCountChip = selectedCard?.querySelector("[data-skeleton-card-count]");
    const selectedRelationSummary = selectedCard?.querySelector(
      "[data-relation-summary-contract]",
    );

    expect(selectedCard).toHaveAttribute(
      "data-card-selected-title-priority",
      "selected-title-before-subtree-count",
    );
    expect(selectedCard).toHaveAttribute(
      "data-card-max-width-token",
      "--topology-card-selected-focus-max-width",
    );
    expect(selectedCardTitle).toHaveAttribute(
      "data-card-title-lane-contract",
      "selected-title-keeps-current-focus-readable",
    );
    if (selectedCountChip) {
      expect(selectedCountChip).toHaveAttribute(
        "data-count-chip-visibility",
        "sr-only-selected-relation-summary",
      );
      expect(selectedCountChip).toHaveClass("sr-only");
    }
    expect(selectedRelationSummary).toHaveAttribute(
      "data-relation-summary-contract",
      "selected-card-direct-facts",
    );
    expect(labelHit).toHaveAttribute("data-selected-relation", "true");
    expect(labelHit).toHaveAttribute("data-relation-label-density", "focus-token");
    expect(visibleBadge).toHaveAttribute(
      "data-relation-label-selected-surface-token",
      "--topology-relation-label-selected-surface",
    );
    expect(visibleBadge).toHaveAttribute(
      "data-relation-label-selected-border-token",
      "--topology-relation-label-selected-border",
    );
    expect(visibleBadge).toHaveAttribute(
      "data-relation-label-selected-shadow-token",
      "--topology-relation-label-selected-shadow",
    );
    expect(selectedOverlay).toHaveAttribute(
      "data-relation-label-selected-surface-token",
      "--topology-relation-label-selected-surface",
    );
    expect(selectedOverlay).toHaveAttribute(
      "data-selected-relation-halo-token",
      "--topology-relation-label-selected-surface",
    );
    expect(selectedOverlay).toHaveAttribute(
      "data-relation-label-fact-segmentation",
      "type>evidence>gate",
    );
    expect(selectedOverlay).toHaveAttribute(
      "data-relation-label-segment-gap-token",
      "--topology-relation-label-segment-gap",
    );
    expect(selectedOverlay).toHaveAttribute(
      "data-relation-label-segment-divider-token",
      "--topology-relation-label-border",
    );
    expect(selectedOverlayEvidenceChip).toHaveAttribute(
      "data-relation-evidence-glyph",
      "source-backed",
    );
    expect(selectedOverlayEvidenceChip).toHaveAttribute(
      "data-surface-token",
      "--topology-relation-evidence-chip-surface",
    );
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
    expect(labelHit).toHaveAttribute(
      "data-relation-label-fact-segmentation",
      "type>evidence>gate",
    );
    expect(labelHit).toHaveAttribute("data-relation-label-agent-gate-visible", "true");
    expect(labelHit).toHaveAttribute(
      "aria-label",
      "contains relation · strong · 2 sources · explain · explain relation",
    );
    expect(gateChip).toHaveAttribute("data-relation-label-agent-gate", "handoff-ready");
    expect(gateChip).toHaveAttribute("data-primary-copy-action", "explain_relation");
    expect(gateChip).toHaveAttribute("data-route-chip-text", "explain");
    expect(gateChip).toHaveAttribute("data-relation-label-segment", "gate");
    const typeText = labelHit?.querySelector("[data-relation-label-type-text]");
    const selectedOverlayTypeText = selectedOverlay?.querySelector(
      "[data-relation-label-type-text]",
    );
    expect(typeText).toHaveAttribute(
      "data-relation-label-type-text-contract",
      "typed-fact-label-stays-readable",
    );
    expect(typeText).toHaveTextContent("contains");
    expect(typeText).toHaveClass("shrink-0");
    expect(typeText).toHaveAttribute("data-relation-label-segment", "type");
    expect(typeText).toHaveClass("border-r");
    expect(selectedOverlayTypeText).toHaveAttribute(
      "data-relation-label-type-text-contract",
      "typed-fact-label-stays-readable",
    );
    expect(selectedOverlayTypeText).toHaveTextContent("contains");
    expect(selectedOverlayTypeText).toHaveClass("shrink-0");
    expect(selectedOverlayTypeText).toHaveAttribute("data-relation-label-segment", "type");
    expect(selectedOverlayTypeText).toHaveClass("border-r");
    expect(selectedOverlayEvidenceChip).toHaveAttribute(
      "data-relation-label-segment",
      "evidence",
    );
    expect(gateChip).toHaveAttribute(
      "data-surface-token",
      "--topology-relation-gate-ready-surface",
    );
    expect(gateChip).toHaveAttribute(
      "data-border-token",
      "--topology-relation-gate-ready-border",
    );
    expect(gateChip).toHaveAttribute(
      "data-text-token",
      "--topology-relation-gate-ready-text",
    );
    expect(gateChip).toHaveTextContent("explain");
    expect(labelHit?.querySelector("[data-relation-fact-route-rail]")).toHaveClass("sr-only");
    expect(labelHit?.querySelector('[data-route-chip="fact"]')).toHaveAttribute("data-route-chip-text", "fact");
    expect(labelHit?.querySelector('[data-route-chip="evidence"]')).toHaveAttribute("data-route-chip-text", "src");
    expect(labelHit?.querySelector('[data-route-chip="gate"]')).toHaveAttribute("data-route-chip-text", "MCP/CLI");
    expect(labelHit?.querySelector('[data-route-chip="action"]')).toHaveAttribute("data-route-chip-text", "explain");
    expect(root).toHaveAttribute(
      "data-relation-label-handoff-contract",
      "label-level-mcp-cli-fallback",
    );
    expect(root).toHaveAttribute("data-selected-relation-label-handoff", "ready");
    expect(root).toHaveAttribute("data-selected-relation-label-gate", "handoff-ready");
    expect(root).toHaveAttribute(
      "data-selected-relation-label-primary-action",
      "explain_relation",
    );
    expect(root).toHaveAttribute(
      "data-selected-relation-label-cli-fallback",
      "ontology-atlas explain 'project:p' 'domain:d1' [vault] --type 'contains'",
    );
    expect(root).toHaveAttribute(
      "data-selected-relation-label-fact-route",
      "fact>evidence>gate>action",
    );
    expect(root).toHaveAttribute("data-selected-relation-label-quality", "strong");
    expect(root).toHaveAttribute("data-selected-relation-label-evidence", "source-backed");
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
    expect(gateChip).toHaveAttribute("data-route-chip-text", "check");
    expect(gateChip).toHaveAttribute(
      "data-surface-token",
      "--topology-relation-gate-preflight-surface",
    );
    expect(gateChip).toHaveAttribute(
      "data-border-token",
      "--topology-relation-gate-preflight-border",
    );
    expect(gateChip).toHaveAttribute(
      "data-text-token",
      "--topology-relation-gate-preflight-text",
    );
    expect(gateChip).toHaveTextContent("check");
    expect(labelHit?.querySelector("[data-relation-fact-route-rail]")).toHaveClass("sr-only");
    expect(labelHit?.querySelector('[data-route-chip="fact"]')).toHaveAttribute("data-route-chip-text", "fact");
    expect(labelHit?.querySelector('[data-route-chip="evidence"]')).toHaveAttribute("data-route-chip-text", "review");
    expect(labelHit?.querySelector('[data-route-chip="gate"]')).toHaveAttribute("data-route-chip-text", "check");
    expect(labelHit?.querySelector('[data-route-chip="action"]')).toHaveAttribute("data-route-chip-text", "check");
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

  it("선택 focus 의 dimmed context 카드는 지형 맥락을 읽을 수 있는 최소 opacity 를 유지한다", async () => {
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getMockRect(this: HTMLElement) {
        const slug = this.dataset?.slug;
        if (slug === "project:p") {
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
        }
        if (slug === "domain:d1") {
          return {
            left: 360,
            top: 220,
            right: 500,
            bottom: 268,
            width: 140,
            height: 48,
            x: 360,
            y: 220,
            toJSON: () => ({}),
          };
        }
        if (slug === "domain:d2") {
          return {
            left: 100,
            top: 320,
            right: 220,
            bottom: 364,
            width: 120,
            height: 44,
            x: 100,
            y: 320,
            toJSON: () => ({}),
          };
        }
        if (slug === "capability:c1") {
          return {
            left: 100,
            top: 440,
            right: 220,
            bottom: 480,
            width: 120,
            height: 40,
            x: 100,
            y: 440,
            toJSON: () => ({}),
          };
        }
        return {
          left: 0,
          top: 0,
          right: 1000,
          bottom: 700,
          width: 1000,
          height: 700,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      });
    const graph = makeGraph();
    try {
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
      graph.addNode("capability:c1", {
        size: 5,
        color: "#888",
        borderColor: "#999",
        outerBorderColor: "rgba(0,0,0,0)",
        projectSlug: "",
        categoryId: "",
        isHub: false,
        ownerKey: "unassigned",
        x: -20,
        y: -5,
        label: "Sync",
      });
      graph.addEdge("project:p", "domain:d1", { size: 1, color: "#fff" });
      render(
        <SigmaSkeletonCards
          sigma={stubSigma}
          graph={graph}
          cards={[
            ...CARDS,
            { id: "domain:d2", title: "Agent", kind: "domain", tier: 1 as const },
            { id: "capability:c1", title: "Sync", kind: "capability", tier: 2 as const },
          ]}
          selectedSlug="domain:d1"
          onSelect={vi.fn()}
        />,
      );

      const projectCard = screen.getByText("Atlas").closest("[data-skeleton-card]");
      const domainCard = screen.getByText("Agent").closest("[data-skeleton-card]");
      const capabilityCard = screen.getByText("Sync").closest("[data-skeleton-card]");
      const layer = screen.getByTestId("sigma-skeleton-cards");

      await waitFor(() => {
        expect(layer).toHaveAttribute("data-dim-opacity-contract", "readable-context-geography");
        expect(layer).toHaveAttribute("data-dim-anchor-opacity", "0.24");
        expect(layer).toHaveAttribute("data-dim-chip-opacity", "0.10");
        expect(projectCard).toHaveStyle({ opacity: "0.24" });
        expect(domainCard).toHaveStyle({ opacity: "0.24" });
        expect(capabilityCard).toHaveStyle({ opacity: "0.10" });
      });
    } finally {
      rectSpy.mockRestore();
    }
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
      expect(connector).toHaveAttribute(
        "data-relation-stroke-token",
        "--topology-relation-stroke-strong",
      );
      expect(connector).toHaveAttribute("stroke", "var(--topology-relation-stroke-strong)");
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

    expect(dragCard).toHaveAttribute("data-drag-glow-token", "--topology-card-drag-glow");
    expect(dragCard).toHaveAttribute(
      "data-drag-active-glow-token",
      "--topology-card-drag-active-glow",
    );
    expect(dragCard).toHaveAttribute(
      "data-drag-wash-token",
      "--topology-card-drag-active-wash",
    );
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
      expect(rerenderedSourceCard).toHaveAttribute(
        "data-path-role-contract",
        "source-anchor-visible",
      );
      expect(rerenderedSourceCard).toHaveAttribute("data-path-next-action", "pick-target");
      expect(rerenderedSourceCard).toHaveAttribute(
        "data-path-attention-layer",
        "focus-path-state",
      );
      expect(rerenderedSourceCard).toHaveAttribute(
        "data-path-endpoint-max-width-token",
        "--topology-path-endpoint-card-max-width",
      );
      expect(rerenderedSourceCard).toHaveStyle({
        maxWidth: "var(--topology-path-endpoint-card-max-width)",
      });
      const sourceBadge = screen.getByText("A");
      expect(sourceBadge).toHaveAttribute("data-path-card-badge", "source");
      expect(sourceBadge).toHaveAttribute(
        "data-path-card-badge-contract",
        "endpoint-role-token",
      );
      expect(sourceBadge).toHaveAttribute(
        "data-surface-token",
        "--topology-path-endpoint-surface",
      );
      expect(sourceBadge).toHaveAttribute(
        "data-border-token",
        "--topology-path-endpoint-border",
      );
      expect(sourceBadge).toHaveAttribute(
        "data-text-token",
        "--topology-path-endpoint-text",
      );

      fireEvent.click(targetCard);
      expect(onPathSelectionChange).toHaveBeenLastCalledWith({
        sourceSlug: "project:p",
        targetSlug: "domain:d1",
      });

      rerender(
        <SigmaSkeletonCards
          sigma={stubSigma}
          graph={makeGraph()}
          cards={[...CARDS]}
          selectedSlug="project:p"
          onSelect={onSelect}
          pathWorkflowActive
          pathSelection={{ sourceSlug: "project:p", targetSlug: "domain:d1" }}
          onPathSelectionChange={onPathSelectionChange}
        />,
      );
      const selectedTargetCard = screen.getByText("Views").closest("[data-skeleton-card]")!;
      expect(selectedTargetCard).toHaveAttribute("data-path-role", "target");
      expect(selectedTargetCard).toHaveAttribute(
        "data-path-endpoint-max-width-token",
        "--topology-path-endpoint-card-max-width",
      );
      expect(selectedTargetCard).toHaveStyle({
        maxWidth: "var(--topology-path-endpoint-card-max-width)",
      });
      expect(selectedTargetCard.querySelector("[data-card-title]")).toHaveAttribute(
        "data-path-endpoint-title-contract",
        "endpoint-title-gets-readable-width",
      );
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
    expect(document.querySelector("[data-drag-cluster-state-label]")).toHaveTextContent(
      "linked cards move together",
    );
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
      expect(document.querySelector("[data-drag-cluster-state-label]")).toHaveTextContent(
        "linked cards move together",
      );

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
