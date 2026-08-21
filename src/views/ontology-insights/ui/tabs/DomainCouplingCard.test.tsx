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
    // 색만으로 말하지 않는다 — 교차 수를 aria 이름으로도, 칸 안 숫자로도.
    expect(screen.getByLabelText("3 links from Auth to Billing")).toHaveTextContent("3");
    // 대각선은 교차가 아니라 같은 도메인 안쪽 연결이다.
    expect(screen.getByLabelText("2 links inside Auth")).toBeInTheDocument();
    // 경계 압력 — self/cross 비율 카드도 함께 렌더.
    expect(screen.getByText("Boundary pressure")).toBeInTheDocument();
    expect(screen.getByText(/self 2 · cross 3/)).toBeInTheDocument();
  });

  it("칸을 누르면 그 두 도메인을 잇는 실제 연결이 지도 딥링크로 펼쳐진다", () => {
    renderCard();

    // 선택 전에도 자리는 잡혀 있고, 다음 한 걸음을 안내한다.
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

    // 같은 칸을 다시 누르면 접힌다 — 선택은 토글이다.
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
        // 총량 4 · 비중 100% — 총량으로 그리면 가장 짧은 막대가 된다.
        { id: "domain:leaky", title: "Leaky", selfEdges: 0, crossEdges: 4, crossRatio: 1 },
        // 총량 20 · 비중 25% — 총량으로 그리면 가장 긴 막대가 된다.
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
        // 대각선: Auth 8 (최대) · Billing 1. 교차: 3.
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
    // 무채색 척도(교차의 인디고와 다른 채널) 안에서 큰 값이 더 진하다.
    expect(big.style.backgroundColor).toBe("var(--color-overlay-3)");
    expect(small.style.backgroundColor).toBe("var(--color-overlay-1)");
    // "다른 척도" 는 색이 아닌 채널로도 말한다 — 파선 테두리.
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
    // 빈 방 금지 — 설명만 두지 않고 다음 한 걸음을 함께 준다.
    expect(screen.getByTestId("domain-coupling-empty-action")).toHaveAttribute(
      "href",
      "/ontology/studio/",
    );
  });
});

/**
 * **격자의 칸은 전부 같은 크기다.**
 *
 * 클릭 가능한 칸만 `controlClass({ shape: 'icon' })` 을 쓰는데 그 모양은 **하드
 * 치수**(`w-7` = 28px)를 낸다. 높이는 `h-[var(--coupling-cell)]` 이 덮었지만 폭은
 * 덮는 것이 없어서 28로 남았고, 클릭 가능 여부는 **데이터가 정하므로**(값>0 이고
 * 짝이 있을 때만) 같은 격자에 44×44 와 28×44 가 섞였다 — 실측 36칸 중 17 대 19
 * (2026-08-09 소유자 지적: *"어떤건 정사각형이고 어떤건 직사각형이고 그런 기준이
 * 있는건가? 아니면 그냥 디자인 오류인가..?"* — 후자였다).
 *
 * 격자는 **칸이 같은 크기라는 약속**이고, 그게 깨지면 읽는 사람은 크기를 데이터로
 * 읽는다. 이 시험은 두 갈래가 같은 폭 규칙을 쓰는지 클래스 층에서 잠근다 —
 * 실제 픽셀은 `insights-boundary-cell.spec.ts` 가 잰다.
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
