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

/** The page's contract: the real address builder, and a name carrying the row's figures. */
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
 * The composition tab's domain capacity: the empty and filled states never state each other's content, and a fresh
 * vault with no domains is the most common first screen.
 */
describe("OverviewTab domain capacity", () => {
  it("separates kind stack segments with panel gaps and no border track", () => {
    render(<OverviewTab {...BASE} domainRows={[AUTH_ROW]} />);
    const stack = screen.getByTestId("insights-kind-stack");
    expect(stack).toHaveClass("gap-0.5");
    expect(stack.className).not.toContain("border");
    expect(screen.getAllByTestId("insights-kind-stack-segment")).toHaveLength(3);
  });

  // The key names each kind once with its share; the census strip prints the counts.
  it("states kind names and shares in a one-line key and leaves counts to the tiles", () => {
    render(<OverviewTab {...BASE} domainRows={[AUTH_ROW]} />);
    const key = screen.getByTestId("insights-kind-key");
    expect(key.querySelectorAll("li")).toHaveLength(3);
    const first = key.querySelector("li")!;
    expect(first).toHaveAttribute("data-share-count", "3");
    const visible = [...first.querySelectorAll("span")].filter((el) => !el.classList.contains("sr-only")).map((el) => el.textContent).join("");
    expect(visible).toBe("capability60%");
  });

  it("puts the domain breakdown under the name so the total sits beside the bar", () => {
    render(<OverviewTab {...BASE} domainRows={[AUTH_ROW]} />);
    expect(screen.getByTestId("domain-capacity-bar-tail")).toHaveTextContent(/^3$/);
    expect(screen.getByTestId("domain-capacity-bar-breakdown")).toHaveTextContent("역량 2 · 요소 1");
  });

  it("offers a way to create a domain when there is none", () => {
    render(<OverviewTab {...BASE} domainRows={[]} />);
    const action = screen.getByTestId("domain-capacity-empty-action");
    expect(action).toHaveTextContent("지도에서 도메인 만들기");
    expect(action).toHaveAttribute("href", "/topology/?workbench=create");
  });

  it("omits the bar caption in the empty state", () => {
    render(<OverviewTab {...BASE} domainRows={[]} />);
    expect(screen.queryByText(/왼쪽이 역량/)).not.toBeInTheDocument();
  });

  it("restores the caption and drops the empty action when rows exist", () => {
    render(<OverviewTab {...BASE} domainRows={[AUTH_ROW]} />);
    expect(screen.getByText(/왼쪽이 역량/)).toBeInTheDocument();
    expect(screen.queryByTestId("domain-capacity-empty-action")).not.toBeInTheDocument();
  });

  /** Each domain row is a door to the map, in the connections tab's hub-row grammar. */
  it("links a domain row to its map address", () => {
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

  /** The bar and key are `aria-hidden`, so the link name carries the three on-screen numbers. */
  it("includes the row figures in the link name", () => {
    render(<OverviewTab {...BASE} domainRows={[AUTH_ROW]} />);
    expect(screen.getByTestId("insights-domain-row-link")).toHaveAttribute(
      "aria-label",
      "Auth 3 · 역량 2 · 요소 1: 지도에서 보기",
    );
  });

  /**
   * The wrapping link keeps rows at one height: the value layer's `flex` layout and `py-1.5` inset are replaced by the
   * board's list inset (`py-3`, `insights-list.ts`). jsdom computes no layout, so this checks the classes.
   */
  it("uses the same list inset on every row link", () => {
    render(<OverviewTab {...BASE} domainRows={[AUTH_ROW]} />);
    const classes = screen.getByTestId("insights-domain-row-link").className.split(/\s+/);
    expect(classes).toContain("py-3");
    expect(classes).toContain("block");
    expect(classes).toContain("w-auto");
    expect(classes).not.toContain("py-1.5");
    expect(classes).not.toContain("flex");
    expect(classes).not.toContain("w-full");
    // The hub rows' offset pair: only the hover inset extends outward while the axis stays.
    expect(classes).toContain("-mx-1.5");
    expect(classes).toContain("px-1.5");
    expect(classes).not.toContain("px-2");
    // Emptying the layout keeps the value layer's focus ring and finger floor.
    expect(classes).toContain("focus-visible:ring-2");
    expect(classes).toContain("atlas-touch-floor");
  });

  it("renders no link in the empty state", () => {
    render(<OverviewTab {...BASE} domainRows={[]} />);
    expect(screen.queryByTestId("insights-domain-row-link")).not.toBeInTheDocument();
  });
});
