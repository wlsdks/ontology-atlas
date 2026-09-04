import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { buildOntologyNodeHref } from "@/entities/knowledge-graph";
import { OverviewTab, type OverviewTabLabels } from "./OverviewTab";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const LABELS = {
  concepts: "개념",
  relations: "관계",
  health: "건강",
  orphan: "외톨이 개념",
  cycle: "서로 얽힌 고리",
  membershipLabel: "도메인에 담김",
  densityGloss: "개념 1개당 평균 연결",
  evidenceLinked: "근거 연결",
  islands: "따로 떨어진 무리",
  kindCensusTitle: "종류 분포",
  domainCapacityTitle: "도메인 용량",
  noDomains: "도메인 노드가 아직 없습니다.",
  noDomainsBody: "도메인은 역량들을 묶는 영역이에요.",
  noDomainsAction: "지도에서 도메인 만들기",
  kindGlyphCaption: "글리프 = 지도의 노드 셰이프 그대로",
  domainCapacityCaption: "왼쪽이 역량, 오른쪽이 요소",
  capabilityUnit: "역량",
  elementUnit: "요소",
} as unknown as OverviewTabLabels;

/** The same contract the page supplies — the address is the real builder, and the name carries the row's figures. */
const DOMAIN_LINK = {
  href: (nodeId: string) => buildOntologyNodeHref(nodeId, { via: "insights:composition" }),
  ariaLabel: (row: { title: string; total: number; capabilityCount: number; elementCount: number }) =>
    `${row.title} ${row.total} · 역량 ${row.capabilityCount} · 요소 ${row.elementCount}: 지도에서 보기`,
};

const BASE = {
  totalNodes: 5,
  totalEdges: 4,
  health: {
    edgesPerConcept: 0.8,
    orphanCount: 0,
    cycleCount: 0,
    domainMembershipPct: 0,
    evidenceLinkedPct: 100,
  },
  islandCount: 0,
  kindRows: [
    { kind: "capability", count: 3 },
    { kind: "element", count: 1 },
    { kind: "project", count: 1 },
  ],
  edgeTypeSummary: [],
  edgeTypeTotal: 0,
  onSeeAllRelations: () => {},
  kindLabel: (kind: string) => kind,
  domainLink: DOMAIN_LINK,
  labels: LABELS,
};

const AUTH_ROW = {
  id: "domain:auth",
  title: "Auth",
  capabilityCount: 2,
  elementCount: 1,
  total: 3,
};

/**
 * **The "composition" tab's domain capacity — the empty and filled states never state each other's
 * content** (census 2026-08-12: this was the only one of the five tabs with zero pressable
 * controls, and its empty state is the most common first screen — a freshly created vault has no
 * domains).
 */
describe("OverviewTab — 도메인 용량", () => {
  it("종류 스택은 낮은 인접 색 대비를 1px 구조 seam으로 나눈다", () => {
    render(<OverviewTab {...BASE} domainRows={[AUTH_ROW]} />);
    const stack = screen.getByTestId("insights-kind-stack");
    expect(stack).toHaveClass("gap-px");
    expect(stack).toHaveClass("bg-[color:var(--color-divider)]");
    expect(screen.getAllByTestId("insights-kind-stack-segment")).toHaveLength(3);
  });

  it("도메인이 없으면 만들 길을 내민다 — 「없습니다」로 끝나는 것은 다음 단계가 없음이다", () => {
    render(<OverviewTab {...BASE} domainRows={[]} />);
    const action = screen.getByTestId("domain-capacity-empty-action");
    expect(action).toHaveTextContent("지도에서 도메인 만들기");
    expect(action).toHaveAttribute("href", "/topology/?workbench=create");
  });

  it("빈 상태에서는 막대 읽는 법을 달지 않는다 — 없는 그림을 설명하는 글은 소음이다", () => {
    render(<OverviewTab {...BASE} domainRows={[]} />);
    expect(screen.queryByText(/왼쪽이 역량/)).not.toBeInTheDocument();
  });

  it("행이 있으면 캡션이 돌아오고 빈 상태 행동은 사라진다", () => {
    render(<OverviewTab {...BASE} domainRows={[AUTH_ROW]} />);
    expect(screen.getByText(/왼쪽이 역량/)).toBeInTheDocument();
    expect(screen.queryByTestId("domain-capacity-empty-action")).not.toBeInTheDocument();
  });

  /**
   * Is the row a door to the map? That this card drew six rows with **nothing pressable** was the
   * finding of the 2026-08-12 census. Same grammar as the hub rows on the "connections" tab.
   */
  it("도메인 행이 그 도메인의 지도 주소로 간다", () => {
    render(
      <OverviewTab
        {...BASE}
        domainRows={[AUTH_ROW, { id: "domain:billing", title: "Billing", capabilityCount: 1, elementCount: 4, total: 5 }]}
      />,
    );
    const rows = screen.getAllByTestId("insights-domain-row-link");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute(
      "href",
      buildOntologyNodeHref("domain:auth", { via: "insights:composition" }),
    );
    expect(rows[1]).toHaveAttribute(
      "href",
      buildOntologyNodeHref("domain:billing", { via: "insights:composition" }),
    );
  });

  /**
   * The bar and the key are `aria-hidden`, so the three numbers visible on screen (total,
   * capabilities, elements) must be carried in the link name — otherwise only the name survives for
   * a screen reader.
   */
  it("링크 이름이 그 행의 수치를 싣는다", () => {
    render(<OverviewTab {...BASE} domainRows={[AUTH_ROW]} />);
    expect(screen.getByTestId("insights-domain-row-link")).toHaveAttribute(
      "aria-label",
      "Auth 3 · 역량 2 · 요소 1: 지도에서 보기",
    );
  });

  /**
   * **The wrapping link does not change the row's dimensions.** The six rows of this card must share
   * one height for boundary positions to be compared side by side (dimensional regularity). The
   * value layer's `row` carries a vertical inset (`py-1.5`) and a flex layout (`flex w-full`), and
   * since the bar inside already has its own layout, both must be emptied — this assertion stops
   * those three values reappearing in the merged result. jsdom does not compute layout, so what is
   * measured is the classes, and that is all this layer can measure deterministically.
   */
  it("링크가 행 높이를 늘리지 않는다 — 세로 인셋 0 · 배치는 막대의 것", () => {
    render(<OverviewTab {...BASE} domainRows={[AUTH_ROW]} />);
    const classes = screen.getByTestId("insights-domain-row-link").className.split(/\s+/);
    expect(classes).toContain("py-0");
    expect(classes).toContain("block");
    expect(classes).toContain("w-auto");
    expect(classes).not.toContain("py-1.5");
    expect(classes).not.toContain("flex");
    expect(classes).not.toContain("w-full");
    // Horizontally it is the same offset pair as the hub rows — only the inset extends outward while the axis stays.
    expect(classes).toContain("-mx-1.5");
    expect(classes).toContain("px-1.5");
    expect(classes).not.toContain("px-2");
    // Emptying the layout must still leave what the value layer gives — the focus ring (indigo
    // rather than the OS blue) and the finger floor. Without those it is the same as a hand-written link.
    expect(classes).toContain("focus-visible:ring-2");
    expect(classes).toContain("atlas-touch-floor");
  });

  it("빈 상태에는 링크가 없다 — 갈 곳 없는 행을 지어내지 않는다", () => {
    render(<OverviewTab {...BASE} domainRows={[]} />);
    expect(screen.queryByTestId("insights-domain-row-link")).not.toBeInTheDocument();
  });
});
