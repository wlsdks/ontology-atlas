import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { DomainCouplingCard, type DomainCouplingCardLabels } from "./DomainCouplingCard";
import type {
  DomainCouplingBoundaryRow,
  DomainCouplingGrid,
  DomainCouplingPairRow,
} from "../../lib/domain-coupling-rows";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const labels: DomainCouplingCardLabels = {
  title: "Domain coupling",
  countUnit: "cross relations",
  boundaryCountUnit: "domains",
  emptyTitle: "Not enough coupling data yet",
  emptyDescription: "Needs 2+ domains and a cross-domain relation.",
  emptyAction: "Connect concepts on the map",
  emptyActionHref: "/ontology/studio/",
  boundaryTitle: "Boundary pressure",
  boundarySelfLabel: "self",
  boundaryCrossLabel: "cross",
  boundaryCaption: "Higher cross % means a leakier domain boundary.",
  gridCaption: "Darker cells mean more relations.",
  gridSelectHint: "Pick a cell to see the actual connections.",
  gridTruncated: (shown, total) => `Top ${shown} of ${total} domains`,
  gridHiddenCross: (count) => `${count} cross links outside the grid`,
  gridCellAria: (from, to, count) => `${count} links from ${from} to ${to}`,
  gridSelfAria: (domain, count) => `${count} links inside ${domain}`,
};

const nodeLink = {
  href: (nodeId: string) => `/ontology/?node=${encodeURIComponent(nodeId)}`,
  ariaLabel: (title: string) => `${title} — view on the map`,
};

const pairs: DomainCouplingPairRow[] = [
  {
    fromId: "domain:auth",
    fromTitle: "Auth",
    toId: "domain:billing",
    toTitle: "Billing",
    count: 3,
    relationCounts: [{ type: "depends_on", count: 3 }],
    examples: [
      {
        id: "e1",
        fromId: "capability:login",
        fromTitle: "Login",
        toId: "capability:invoice",
        toTitle: "Invoice",
        type: "depends_on",
      },
    ],
  },
];

const grid: DomainCouplingGrid = {
  domains: [
    { id: "domain:auth", title: "Auth" },
    { id: "domain:billing", title: "Billing" },
  ],
  cells: [
    [2, 3],
    [0, 1],
  ],
  maxCross: 3,
  maxSelf: 2,
  totalDomainCount: 2,
  hiddenCrossEdgeCount: 0,
};

const boundaries: DomainCouplingBoundaryRow[] = [
  { id: "domain:auth", title: "Auth", selfEdges: 2, crossEdges: 3, crossRatio: 0.6 },
];

function renderCard(overrides: Partial<React.ComponentProps<typeof DomainCouplingCard>> = {}) {
  return render(
    <DomainCouplingCard
      domainCount={2}
      crossDomainEdgeCount={3}
      pairs={pairs}
      grid={grid}
      boundaries={boundaries}
      boundaryTotalCount={boundaries.length}
      isColdStart={false}
      edgeTypeLabel={(type) => type}
      nodeLink={nodeLink}
      labels={labels}
      {...overrides}
    />,
  );
}

describe("DomainCouplingCard", () => {
  it("도메인×도메인 히트그리드로 그린다 — 칸마다 숫자와 읽을 이름이 있다", () => {
    renderCard();

    expect(screen.getByTestId("domain-coupling-grid")).toBeInTheDocument();
    // It never speaks in colour alone — the cross count is in the aria name and in the cell's digit.
    expect(screen.getByLabelText("3 links from Auth to Billing")).toHaveTextContent("3");
    // The diagonal is not a crossing but a connection inside one domain.
    expect(screen.getByLabelText("2 links inside Auth")).toBeInTheDocument();
    // Boundary pressure — the self/cross ratio card renders alongside.
    expect(screen.getByText("Boundary pressure")).toBeInTheDocument();
    expect(screen.getByText(/self 2 · cross 3/)).toBeInTheDocument();
  });

  it("칸을 누르면 그 두 도메인을 잇는 실제 연결이 지도 딥링크로 펼쳐진다", () => {
    renderCard();

    // The space is held even before a selection, and it guides the next step.
    expect(screen.getByTestId("domain-coupling-selection")).toHaveTextContent(
      "Pick a cell to see the actual connections.",
    );
    expect(screen.queryByTestId("domain-coupling-pair")).toBeNull();

    fireEvent.click(screen.getByLabelText("3 links from Auth to Billing"));

    expect(screen.getByTestId("domain-coupling-pair")).toHaveTextContent("Auth");
    const links = screen.getAllByTestId("domain-coupling-example-link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/ontology/?node=capability%3Alogin");
    expect(links[1]).toHaveAttribute("href", "/ontology/?node=capability%3Ainvoice");

    // Pressing the same cell again collapses it — selection is a toggle.
    fireEvent.click(screen.getByLabelText("3 links from Auth to Billing"));
    expect(screen.queryByTestId("domain-coupling-pair")).toBeNull();
  });

  it("교차가 0인 칸은 누를 수 없다 — 펼칠 연결이 없기 때문", () => {
    renderCard();

    expect(screen.getAllByTestId("domain-coupling-cell")).toHaveLength(1);
    expect(screen.getByLabelText("0 links from Billing to Auth").tagName).toBe("SPAN");
  });

  it("도메인이 상한을 넘으면 절단과 격자 밖 교차 수를 함께 밝힌다", () => {
    renderCard({ grid: { ...grid, totalDomainCount: 9, hiddenCrossEdgeCount: 12 } });

    expect(screen.getByText(/Top 2 of 9 domains/)).toBeInTheDocument();
    expect(screen.getByText(/12 cross links outside the grid/)).toBeInTheDocument();
  });

  it("경계 압력 막대는 캡션이 읽으라고 한 값(교차 비중)을 그린다 — 총량이 아니다", () => {
    renderCard({
      boundaries: [
        // Total 4, share 100% — drawn by total this would be the shortest bar.
        { id: "domain:leaky", title: "Leaky", selfEdges: 0, crossEdges: 4, crossRatio: 1 },
        // Total 20, share 25% — drawn by total this would be the longest bar.
        { id: "domain:solid", title: "Solid", selfEdges: 15, crossEdges: 5, crossRatio: 0.25 },
      ],
      boundaryTotalCount: 2,
    });

    const bars = screen
      .getByLabelText("Boundary pressure")
      .querySelectorAll<HTMLElement>("span[aria-hidden] > span");
    expect(bars).toHaveLength(2);
    expect(bars[0].style.width).toBe("100%");
    expect(bars[1].style.width).toBe("25%");
  });

  it("경계 압력 목록이 잘리면 상세와 같은 절단 문구를 붙인다", () => {
    renderCard({ boundaryTotalCount: 9 });

    expect(screen.getByText(/Top 1 of 9 domains/)).toBeInTheDocument();
  });

  it("대각선 칸의 농도도 값에 반응한다 — 가장 큰 수가 가장 옅으면 캡션이 거짓이 된다", () => {
    renderCard({
      grid: {
        ...grid,
        // Diagonal: Auth 8 (the maximum), Billing 1. Cross: 3.
        cells: [
          [8, 3],
          [0, 1],
        ],
        maxSelf: 8,
      },
      boundaries,
    });

    const big = screen.getByLabelText("8 links inside Auth");
    const small = screen.getByLabelText("1 links inside Billing");
    // Within the neutral scale (a different channel from the cross indigo), a larger value is darker.
    expect(big.style.backgroundColor).toBe("var(--color-overlay-3)");
    expect(small.style.backgroundColor).toBe("var(--color-overlay-1)");
    // "A different scale" is also stated through a non-colour channel — a dashed border.
    expect(big.className).toContain("border-dashed");
    expect(screen.getByLabelText("3 links from Auth to Billing").className).not.toContain(
      "border-dashed",
    );
  });

  it("숫자를 실은 칸은 secondary 텍스트를 쓴다 — quaternary 는 대각선 최고 농도에서 AA 미달", () => {
    renderCard();

    expect(screen.getByLabelText("2 links inside Auth").className).toContain(
      "--color-text-secondary",
    );
  });

  it("콜드스타트 — 도메인 2개 미만이거나 교차가 없으면 격자 대신 빈 상태 (rank #10 계약)", () => {
    renderCard({
      domainCount: 1,
      crossDomainEdgeCount: 0,
      pairs: [],
      grid: { domains: [], cells: [], maxCross: 0, maxSelf: 0, totalDomainCount: 1, hiddenCrossEdgeCount: 0 },
      boundaries: [],
      isColdStart: true,
    });

    expect(screen.getByTestId("domain-coupling-empty")).toBeInTheDocument();
    expect(screen.getByText("Not enough coupling data yet")).toBeInTheDocument();
    expect(screen.queryByTestId("domain-coupling-grid")).toBeNull();
    // No empty rooms — the explanation comes with the next step, not alone.
    expect(screen.getByTestId("domain-coupling-empty-action")).toHaveAttribute(
      "href",
      "/ontology/studio/",
    );
  });
});

/**
 * **Every cell in the grid is the same size.**
 *
 * Only a clickable cell uses `controlClass({ shape: 'icon' })`, and that shape emits **hard
 * dimensions** (`w-7` = 28px). The height was overridden by `h-[var(--coupling-cell)]` but nothing
 * overrode the width, so it stayed 28 — and since clickability is **decided by the data** (only
 * when the value > 0 and a pair exists), one grid mixed 44×44 and 28×44: measured, 17 against 19 of
 * 36 cells (owner report 2026-08-09: *"어떤건 정사각형이고 어떤건 직사각형이고 그런 기준이
 * 있는건가? 아니면 그냥 디자인 오류인가..?"* — are some square and some rectangular by some rule,
 * or is it just a design error? It was the latter).
 *
 * A grid is **a promise that cells are the same size**, and once broken the reader reads size as
 * data. This test locks both branches to the same width rule at the class layer — the real pixels
 * are measured by `insights-boundary-cell.spec.ts`.
 */
describe("격자 칸 치수", () => {
  it("클릭 가능한 칸과 아닌 칸이 같은 폭 규칙을 쓴다", () => {
    const source = readFileSync(
      join(import.meta.dirname, "DomainCouplingCard.tsx"),
      "utf8",
    );
    const shared = source.match(/const shared = `([^`]+)`/)?.[1] ?? "";
    expect(shared, "shared 클래스를 못 찾았다 — 이 시험이 헛돈다").toContain("h-[var(--coupling-cell)]");
    expect(
      shared,
      "폭을 명시하지 않으면 `shape: 'icon'` 의 하드 치수(w-7)가 살아남아 칸이 직사각이 된다",
    ).toContain("w-[var(--coupling-cell)]");
  });
});
