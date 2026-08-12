import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
  noDomainsAction: "조립대에서 도메인 만들기",
  kindGlyphCaption: "글리프 = 지도의 노드 셰이프 그대로",
  domainCapacityCaption: "왼쪽이 역량, 오른쪽이 요소",
  capabilityUnit: "역량",
  elementUnit: "요소",
} as unknown as OverviewTabLabels;

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
  labels: LABELS,
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
    expect(action).toHaveTextContent("조립대에서 도메인 만들기");
    expect(action).toHaveAttribute("href", "/ontology/studio/?mode=create");
  });

  it("빈 상태에서는 막대 읽는 법을 달지 않는다 — 없는 그림을 설명하는 글은 소음이다", () => {
    render(<OverviewTab {...BASE} domainRows={[]} />);
    expect(screen.queryByText(/왼쪽이 역량/)).not.toBeInTheDocument();
  });

  it("행이 있으면 캡션이 돌아오고 빈 상태 행동은 사라진다", () => {
    render(
      <OverviewTab
        {...BASE}
        domainRows={[
          {
            id: "domains/auth",
            title: "Auth",
            capabilityCount: 2,
            elementCount: 1,
            total: 3,
          },
        ]}
      />,
    );
    expect(screen.getByText(/왼쪽이 역량/)).toBeInTheDocument();
    expect(screen.queryByTestId("domain-capacity-empty-action")).not.toBeInTheDocument();
  });
});
