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

/** 페이지가 내리는 것과 같은 계약 — 주소는 실제 빌더, 이름은 행의 수치를 싣는다. */
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
 * **「구성」 탭의 도메인 용량 — 빈 상태와 채워진 상태가 서로의 것을 말하지 않는다**
 * (2026-08-12 census: 이 탭은 다섯 탭 중 유일하게 누를 수 있는 것이 0개였고,
 * 빈 상태가 가장 흔한 첫 화면이다 — 갓 만든 볼트는 도메인이 없다).
 */
describe("OverviewTab — 도메인 용량", () => {
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
   * 행이 지도로 가는 문인가 — 이 카드가 여섯 행을 그려 놓고 **아무것도 누를 수
   * 없던** 것이 2026-08-12 census 의 지적이다. 「연결」 탭 허브 행과 같은 문법.
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
   * 막대·열쇠가 `aria-hidden` 이라, 화면에 보이는 세 수(합계 · 역량 · 요소)가
   * 링크 이름에 실려야 한다 — 실리지 않으면 스크린리더에서는 이름만 남는다.
   */
  it("링크 이름이 그 행의 수치를 싣는다", () => {
    render(<OverviewTab {...BASE} domainRows={[AUTH_ROW]} />);
    expect(screen.getByTestId("insights-domain-row-link")).toHaveAttribute(
      "aria-label",
      "Auth 3 · 역량 2 · 요소 1: 지도에서 보기",
    );
  });

  /**
   * **감싼 링크는 행의 치수를 바꾸지 않는다.** 이 카드의 여섯 행은 높이가
   * 같아야 경계 자리를 나란히 비교할 수 있다(치수 규칙성). 값 층의 `row` 는
   * 세로 인셋(`py-1.5`)과 flex 배치(`flex w-full`)를 싣는데, 안쪽 막대가 자기
   * 배치를 이미 갖고 있으므로 둘 다 비워야 한다 — 이 단언이 그 세 값이 병합
   * 결과에 되살아나는 것을 막는다. jsdom 은 레이아웃을 계산하지 않으니 재는
   * 것은 클래스이고, 그것이 이 층에서 결정론적으로 잴 수 있는 전부다.
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
    // 좌우는 허브 행과 같은 상쇄쌍 — 인셋만 밖으로 나가고 축은 그대로다.
    expect(classes).toContain("-mx-1.5");
    expect(classes).toContain("px-1.5");
    expect(classes).not.toContain("px-2");
    // 배치를 비워도 값 층이 주는 나머지는 남아야 한다 — 초점 링(OS 하늘색이
    // 아니라 인디고)과 손가락 바닥. 이 둘이 없으면 손으로 쓴 링크와 같다.
    expect(classes).toContain("focus-visible:ring-2");
    expect(classes).toContain("atlas-touch-floor");
  });

  it("빈 상태에는 링크가 없다 — 갈 곳 없는 행을 지어내지 않는다", () => {
    render(<OverviewTab {...BASE} domainRows={[]} />);
    expect(screen.queryByTestId("insights-domain-row-link")).not.toBeInTheDocument();
  });
});
