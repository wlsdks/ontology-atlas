import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { ImpactRankingCard, type ImpactRankingLabels } from "./ImpactRankingCard";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const labels: ImpactRankingLabels = {
  title: "Widest ripple when changed",
  caption: "Number = concepts to re-check.",
  directLabel: "direct",
  transitiveLabel: "indirect",
  empty: "Nothing ripples yet",
  emptyHint: "Connect relations in the workshop.",
  truncated: (shown, total) => `Top ${shown} / ${total} total`,
};

const nodeLink = {
  href: (nodeId: string) => `/ontology/?node=${encodeURIComponent(nodeId)}`,
  ariaLabel: ({ title, direct, total }: { title: string; direct: number; total: number }) =>
    `${title} — ${direct} direct, ${total} including indirect`,
};

const rows = [
  { id: "element:token", title: "Token", kind: "element", direct: 3, total: 9 },
  { id: "capability:login", title: "Login", kind: "capability", direct: 1, total: 2 },
];

describe("ImpactRankingCard", () => {
  it("행마다 지도 딥링크와 두 수를 함께 읽어준다", () => {
    render(
      <ImpactRankingCard
        rows={rows}
        rankedCount={2}
        kindLabel={(kind) => kind}
        nodeLink={nodeLink}
        labels={labels}
      />,
    );

    const links = screen.getAllByTestId("insights-impact-row-link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/ontology/?node=element%3Atoken");
    // 막대는 aria-hidden 이라 링크 이름이 유일한 접근 경로다 — 여기서 수가
    // 빠지면 스크린리더 사용자에겐 카드가 제목 목록으로만 남는다.
    expect(links[0]).toHaveAttribute("aria-label", "Token — 3 direct, 9 including indirect");
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("표시 행보다 순위가 많으면 절단 문구를 각주에 붙인다", () => {
    const { container } = render(
      <ImpactRankingCard
        rows={rows}
        rankedCount={40}
        kindLabel={(kind) => kind}
        nodeLink={nodeLink}
        labels={labels}
      />,
    );

    const footers = [...container.querySelectorAll("p")].map((p) => p.textContent);
    expect(footers).toContain("Top 2 / 40 total · Number = concepts to re-check.");
  });

  it("절단이 없으면 각주는 설명 한 줄만 — 같은 수치를 두 번 쓰지 않는다", () => {
    const { container } = render(
      <ImpactRankingCard
        rows={rows}
        rankedCount={2}
        kindLabel={(kind) => kind}
        nodeLink={nodeLink}
        labels={labels}
      />,
    );

    const footers = [...container.querySelectorAll("p")].map((p) => p.textContent);
    expect(footers).toContain("Number = concepts to re-check.");
  });

  it("빈 볼트에서도 머리만 남지 않고 다음 한 걸음을 안내한다", () => {
    render(
      <ImpactRankingCard
        rows={[]}
        rankedCount={0}
        kindLabel={(kind) => kind}
        nodeLink={nodeLink}
        labels={labels}
      />,
    );

    expect(screen.getByText("Nothing ripples yet")).toBeInTheDocument();
    expect(screen.getByText("Connect relations in the workshop.")).toBeInTheDocument();
    expect(screen.queryByTestId("insights-impact-row-link")).toBeNull();
  });

  it("빈 상태에서도 두 세그먼트의 뜻은 머리에 남는다", () => {
    render(
      <ImpactRankingCard
        rows={[]}
        rankedCount={0}
        kindLabel={(kind) => kind}
        nodeLink={nodeLink}
        labels={labels}
      />,
    );

    expect(screen.getByText("direct")).toBeInTheDocument();
    expect(screen.getByText("indirect")).toBeInTheDocument();
  });

  it("두 칸으로 접히므로 둘째 칸의 첫 행도 구분선을 지운다", () => {
    render(
      <ImpactRankingCard
        rows={rows}
        rankedCount={2}
        kindLabel={(kind) => kind}
        nodeLink={nodeLink}
        labels={labels}
      />,
    );

    const links = screen.getAllByTestId("insights-impact-row-link");
    // 1행은 항상 칸의 머리, 2행은 넓은 화면에서만 둘째 칸의 머리다 —
    // 이 두 리셋이 빠지면 각 칸 위에 잘린 표처럼 선이 하나 뜬다.
    expect(links[0].className).toContain("border-t-0");
    expect(links[1].className).toContain("lg:border-t-0");
  });
});
