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
    capabilities: ["주문 생성", "주문 취소", "주문 조회"],
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
  capabilitiesEmpty: "담긴 역량이 아직 없어요.",
};

function renderRows() {
  return render(<DomainCompositionRows domains={DOMAINS} labels={LABELS} />);
}

describe("DomainCompositionRows", () => {
  it("행은 접힌 채로 시작하고, 누르면 그 자리에서 역량 목록이 펼쳐진다", () => {
    renderRows();
    const [orders] = screen.getAllByTestId("project-detail-domain-row-toggle");

    expect(orders).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("주문 취소")).not.toBeInTheDocument();

    fireEvent.click(orders);

    expect(orders).toHaveAttribute("aria-expanded", "true");
    // 「상위 2개」가 아니라 전부 — 「역량 N개 더」라는 갈 곳 없는 수가 사라진다.
    expect(screen.getByText("주문 생성")).toBeInTheDocument();
    expect(screen.getByText("주문 취소")).toBeInTheDocument();
    expect(screen.getByText("주문 조회")).toBeInTheDocument();
  });

  it("펼친 행만 자기 disclosure 를 열고, 다른 행은 그대로 접혀 있다", () => {
    renderRows();
    const toggles = screen.getAllByTestId("project-detail-domain-row-toggle");
    fireEvent.click(toggles[0]);

    const boxes = screen.getAllByTestId("project-detail-domain-disclosure");
    expect(boxes[0]).toHaveAttribute("data-state", "open");
    expect(boxes[1]).toHaveAttribute("data-state", "closed");
    // 접힌 쪽은 탭 순서·스크린리더에서 빠진다(보이지 않는 것은 읽히지도 않는다).
    expect(boxes[1]).toHaveAttribute("inert");
  });

  it("aria-controls 가 실제로 그려진 disclosure 상자를 가리킨다", () => {
    renderRows();
    const [orders] = screen.getAllByTestId("project-detail-domain-row-toggle");
    const id = orders.getAttribute("aria-controls");
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)).not.toBeNull();
  });

  it("막대는 aria-hidden 이므로 수치가 행의 접근 이름에 실린다", () => {
    renderRows();
    expect(
      screen.getByRole("button", { name: /주문: 전체 14 · 역량 3 · 요소 11/ }),
    ).toBeInTheDocument();
  });

  it("지도로 가는 길은 펼친 안에 하나뿐 — 접힌 상태에는 없다", () => {
    renderRows();
    expect(screen.queryByTestId("project-detail-domain-map-link")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByTestId("project-detail-domain-row-toggle")[0]);

    const links = screen.getAllByTestId("project-detail-domain-map-link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/topology/?mode=focus&p=domain%3Aorders");
  });

  it("역량이 0인 도메인은 빈 목록 대신 그 사실을 말한다", () => {
    renderRows();
    fireEvent.click(screen.getAllByTestId("project-detail-domain-row-toggle")[1]);
    expect(screen.getByText("담긴 역량이 아직 없어요.")).toBeInTheDocument();
  });

  it("치수 규칙성 — 모든 행 헤더가 같은 클래스(=같은 높이)를 쓴다", () => {
    renderRows();
    const classes = new Set(
      screen.getAllByTestId("project-detail-domain-row-toggle").map((el) => el.className),
    );
    expect(classes.size).toBe(1);
  });
});
