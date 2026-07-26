import { fireEvent, render, screen } from "@testing-library/react";
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
  evidenceShow: (count) => `Show ${count} names without a document`,
  evidenceHide: "Hide names without a document",
  evidenceCaption: "The number here is not risk.",
  evidenceTruncated: (shown, total) => `Top ${shown} / ${total} without a document`,
  evidenceBadge: "No document",
  evidenceBadgeHint: "Another document wrote this name down.",
};

const nodeLink = {
  href: (nodeId: string) => `/ontology/?node=${encodeURIComponent(nodeId)}`,
  ariaLabel: ({ title, direct, total }: { title: string; direct: number; total: number }) =>
    `${title} — ${direct} direct, ${total} including indirect`,
  evidenceAriaLabel: ({ title, total }: { title: string; total: number }) =>
    `${title} — ${total} concepts wrote this name down`,
};

const rows = [
  { id: "element:token", title: "Token", kind: "element", direct: 3, total: 9, evidenceOnly: false },
  {
    id: "capability:login",
    title: "Login",
    kind: "capability",
    direct: 1,
    total: 2,
    evidenceOnly: false,
  },
];

const evidenceRows = [
  {
    id: "element:integration-test",
    title: "Integration Test",
    kind: "element",
    direct: 2,
    total: 15,
    evidenceOnly: true,
    ref: "mcp/src/integration.test.mjs",
  },
];

describe("ImpactRankingCard", () => {
  it("행마다 지도 딥링크와 두 수를 함께 읽어준다", () => {
    render(
      <ImpactRankingCard
        rows={rows}
        evidenceRows={[]}
        evidenceRankedCount={0}
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
        evidenceRows={[]}
        evidenceRankedCount={0}
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
        evidenceRows={[]}
        evidenceRankedCount={0}
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
        evidenceRows={[]}
        evidenceRankedCount={0}
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
        evidenceRows={[]}
        evidenceRankedCount={0}
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
        evidenceRows={[]}
        evidenceRankedCount={0}
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

  describe("근거 계층", () => {
    const renderWithEvidence = () =>
      render(
        <ImpactRankingCard
          rows={rows}
          rankedCount={2}
          evidenceRows={evidenceRows}
          evidenceRankedCount={193}
          kindLabel={(kind) => kind}
          nodeLink={nodeLink}
          labels={labels}
        />,
      );

    it("문서 없는 개념은 기본 목록에 없고 접힌 계층에만 있다", () => {
      renderWithEvidence();

      // 이 카드의 존재 이유 — 위험도를 묻는 자리의 상위가 테스트 파일 이름으로
      // 차지 않는다. 규모는 토글 라벨이 그대로 말하므로 숨긴 게 아니다.
      expect(screen.queryByText("Integration Test")).toBeNull();
      expect(
        screen.getByRole("button", { name: "Show 193 names without a document" }),
      ).toHaveAttribute("aria-expanded", "false");
    });

    it("펼치면 같은 수를 위험도가 아니라 인용 수로 읽어 준다", () => {
      renderWithEvidence();

      fireEvent.click(screen.getByTestId("insights-impact-evidence-toggle"));

      const row = screen.getByTestId("insights-impact-evidence-row-link");
      expect(row).toHaveAttribute(
        "aria-label",
        "Integration Test — 15 concepts wrote this name down",
      );
      // 같은 15가 개념 계층에서는 "다시 확인할 곳"이었다 — 계층별 캡션이
      // 갈리지 않으면 이 카드는 테스트를 위험으로 부른다.
      expect(screen.getByText(/The number here is not risk/)).toBeInTheDocument();
    });

    it("펼친 행은 무채색 배지와 참조 원문으로 어느 파일인지 밝힌다", () => {
      renderWithEvidence();
      fireEvent.click(screen.getByTestId("insights-impact-evidence-toggle"));

      const badge = screen.getByTestId("evidence-only-badge");
      expect(badge).toHaveTextContent("No document");
      // 앰버 확장 금지(헌장) — 이 배지는 한 화면에 수십 개가 뜬다.
      expect(badge.className).toContain("--color-text-quaternary");
      expect(badge.className).not.toContain("amber");
      // 「Integration Test」는 서로 다른 두 파일이 같은 이름으로 줄어든다 —
      // 참조 원문이 없으면 어느 쪽인지 화면이 답하지 못한다.
      expect(screen.getByText("mcp/src/integration.test.mjs")).toBeInTheDocument();
    });

    it("근거가 없는 볼트에서는 토글 자체가 없다", () => {
      render(
        <ImpactRankingCard
          rows={rows}
          rankedCount={2}
          evidenceRows={[]}
          evidenceRankedCount={0}
          kindLabel={(kind) => kind}
          nodeLink={nodeLink}
          labels={labels}
        />,
      );

      expect(screen.queryByTestId("insights-impact-evidence-toggle")).toBeNull();
    });
  });
});
