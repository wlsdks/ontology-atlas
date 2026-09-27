import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { DomainCompositionRows } from "./DomainCompositionRows";
import type { DomainCompositionRow } from "../model/domain-composition";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const DOMAINS: DomainCompositionRow[] = [
  {
    id: "domain:orders",
    title: "주문",
    capabilityCount: 3,
    elementCount: 11,
    total: 14,
    capabilities: [
      { id: "capability:order-create", title: "주문 생성" },
      { id: "capability:order-cancel", title: "주문 취소" },
      { id: "capability:order-view", title: "주문 조회" },
    ],
  },
  {
    id: "domain:inventory",
    title: "재고",
    capabilityCount: 0,
    elementCount: 4,
    total: 4,
    capabilities: [],
  },
];

const LABELS = {
  capabilityUnit: "역량",
  elementUnit: "요소",
  legendCaption: "막대 읽는 법.",
  overlapNote: "행의 합이 위보다 클 수 있어요.",
  rowToggleAria: (row: DomainCompositionRow) =>
    `${row.title}: 전체 ${row.total} · 역량 ${row.capabilityCount} · 요소 ${row.elementCount} — 담긴 역량 보기`,
  mapLinkLabel: "지도에서 이 도메인 열기",
  capabilityLinkAria: (title: string) => `지도에서 ${title} 열기`,
  capabilitiesEmpty: "담긴 역량이 아직 없어요.",
};

function renderRows() {
  return render(<DomainCompositionRows domains={DOMAINS} labels={LABELS} />);
}

describe("DomainCompositionRows", () => {
  it("starts rows collapsed and expands the capability list in place on click", () => {
    renderRows();
    const [orders] = screen.getAllByTestId("project-detail-domain-row-toggle");

    expect(orders).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("주문 취소")).not.toBeInTheDocument();

    fireEvent.click(orders);

    expect(orders).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("주문 생성")).toBeInTheDocument();
    expect(screen.getByText("주문 취소")).toBeInTheDocument();
    expect(screen.getByText("주문 조회")).toBeInTheDocument();
  });

  it("opens only the clicked row's disclosure and leaves the others collapsed", () => {
    renderRows();
    const toggles = screen.getAllByTestId("project-detail-domain-row-toggle");
    fireEvent.click(toggles[0]);

    const boxes = screen.getAllByTestId("project-detail-domain-disclosure");
    expect(boxes[0]).toHaveAttribute("data-state", "open");
    expect(boxes[1]).toHaveAttribute("data-state", "closed");
    expect(boxes[1]).toHaveAttribute("inert");
  });

  it("points aria-controls at the rendered disclosure box", () => {
    renderRows();
    const [orders] = screen.getAllByTestId("project-detail-domain-row-toggle");
    const id = orders.getAttribute("aria-controls");
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)).not.toBeNull();
  });

  it("carries the counts in the row's accessible name because the bar is aria-hidden", () => {
    renderRows();
    expect(
      screen.getByRole("button", { name: /주문: 전체 14 · 역량 3 · 요소 11/ }),
    ).toBeInTheDocument();
  });

  it("shows one domain map link only inside an expanded row", () => {
    renderRows();
    expect(screen.queryByTestId("project-detail-domain-map-link")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByTestId("project-detail-domain-row-toggle")[0]);

    const links = screen.getAllByTestId("project-detail-domain-map-link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/topology/?mode=focus&p=domain%3Aorders");
  });

  it("links each expanded capability name to its map node", () => {
    renderRows();
    fireEvent.click(screen.getAllByTestId("project-detail-domain-row-toggle")[0]);

    const capabilityLinks = screen.getAllByTestId("project-detail-capability-link");
    expect(capabilityLinks).toHaveLength(3);
    expect(capabilityLinks[0]).toHaveAttribute(
      "href",
      "/topology/?mode=focus&p=capability%3Aorder-create",
    );
    expect(capabilityLinks[0]).toHaveAccessibleName("지도에서 주문 생성 열기");
    expect(capabilityLinks[0]).toHaveTextContent("주문 생성");
  });

  it("states that a domain has no capabilities instead of an empty list", () => {
    renderRows();
    fireEvent.click(screen.getAllByTestId("project-detail-domain-row-toggle")[1]);
    expect(screen.getByText("담긴 역량이 아직 없어요.")).toBeInTheDocument();
  });

  it("gives every row header the same class and therefore the same height", () => {
    renderRows();
    const classes = new Set(
      screen.getAllByTestId("project-detail-domain-row-toggle").map((el) => el.className),
    );
    expect(classes.size).toBe(1);
  });
});
