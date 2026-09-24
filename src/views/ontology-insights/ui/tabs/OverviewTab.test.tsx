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
  kindRows: [
    { kind: "capability", count: 3 },
    { kind: "element", count: 1 },
    { kind: "project", count: 1 },
  ],
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
 * content** (census 2026-08-12: of the board's then-five tabs this was the only one with zero pressable
 * controls, and its empty state is the most common first screen — a freshly created vault has no
 * domains).
 */
describe("OverviewTab — 도메인 용량", () => {
  it("종류 스택은 조각 사이를 패널 틈으로 가르고, 테두리로 빈 트랙을 흉내 내지 않는다", () => {
    render(<OverviewTab {...BASE} domainRows={[AUTH_ROW]} />);
    const stack = screen.getByTestId("insights-kind-stack");
    expect(stack).toHaveClass("gap-0.5");
    expect(stack.className).not.toContain("border");
    expect(screen.getAllByTestId("insights-kind-stack-segment")).toHaveLength(3);
  });

  // The key names each kind once, with its share. A second bar per kind for the same share
  // was the row that left the blank band beside the domain card (review, 2026-09-25).
  // The census tile above the tab bar prints every count; the key says only the share it adds
  // (review, 2026-09-25, round 5: the same counts stood ~250px apart in one viewport).
  it("종류는 한 줄 키로 이름·비율을 말하고, 수는 인구 타일에 맡긴다", () => {
    render(<OverviewTab {...BASE} domainRows={[AUTH_ROW]} />);
    const key = screen.getByTestId("insights-kind-key");
    expect(key.querySelectorAll("li")).toHaveLength(3);
    const first = key.querySelector("li")!;
    expect(first).toHaveAttribute("data-share-count", "3");
    const visible = [...first.querySelectorAll("span")].filter((el) => !el.classList.contains("sr-only")).map((el) => el.textContent).join("");
    expect(visible).toBe("capability60%");
  });

  it("도메인 행의 내역은 이름 아래에 있어 막대 바로 옆에 합계가 선다", () => {
    render(<OverviewTab {...BASE} domainRows={[AUTH_ROW]} />);
    expect(screen.getByTestId("domain-capacity-bar-tail")).toHaveTextContent(/^3$/);
    expect(screen.getByTestId("domain-capacity-bar-breakdown")).toHaveTextContent("역량 2 · 요소 1");
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
   * value layer's `row` carries a vertical inset (`py-1.5`) and a flex layout (`flex w-full`); the
   * layout must be emptied because the bar inside has its own, and the inset is replaced by the
   * board's one list inset (`py-3`, `insights-list.ts`) so every row carries the same one — this
   * assertion stops the value layer's values reappearing in the merged result. jsdom does not compute layout, so what is
   * measured is the classes, and that is all this layer can measure deterministically.
   */
  it("링크가 행마다 같은 목록 인셋을 쓴다 — 배치는 막대의 것", () => {
    render(<OverviewTab {...BASE} domainRows={[AUTH_ROW]} />);
    const classes = screen.getByTestId("insights-domain-row-link").className.split(/\s+/);
    expect(classes).toContain("py-3");
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
