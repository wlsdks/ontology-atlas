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
  emptyTitle: "Not enough coupling data yet",
  emptyDescription: "Needs 2+ domains and a cross-domain relation.",
  emptyAction: "Connect concepts in the workshop",
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

  it("콜드스타트 — 도메인 2개 미만이거나 교차가 없으면 격자 대신 빈 상태 (rank #10 계약)", () => {
    renderCard({
      domainCount: 1,
      crossDomainEdgeCount: 0,
      pairs: [],
      grid: { domains: [], cells: [], maxCross: 0, totalDomainCount: 1, hiddenCrossEdgeCount: 0 },
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
