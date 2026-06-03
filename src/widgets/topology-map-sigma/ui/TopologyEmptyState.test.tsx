import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import { TopologyEmptyState } from "./TopologyEmptyState";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

function renderEmpty(projectCount: number, reason?: "no-projects" | "no-relations") {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <TopologyEmptyState projectCount={projectCount} reason={reason} />
    </NextIntlClientProvider>,
  );
}

describe("TopologyEmptyState", () => {
  it("0 프로젝트일 때 복구 CTA 를 명확한 화면 이름으로 노출", () => {
    renderEmpty(0);
    expect(
      screen.getByRole("status", { name: /관계 지도에 그릴 프로젝트가 없습니다/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("개념 둘러보기").closest("a")).toHaveAttribute(
      "href",
      expect.stringContaining("/ontology"),
    );
    expect(screen.getByText("저장·편집 열기").closest("a")).toHaveAttribute(
      "href",
      expect.stringContaining("/ontology/edit"),
    );
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("보조 힌트는 별도 안내 박스로 강조하지 않는다", () => {
    renderEmpty(1, "no-relations");
    const hint = screen.getByText(
      "전체 온톨로지 노드 문서와 변경점은 개념 둘러보기·저장·편집에서 이어서 확인할 수 있습니다.",
    );
    expect(hint.className).not.toContain("rounded-md");
    expect(hint.className).not.toContain("border");
  });

  it("reason 이 no-projects 면 projectCount 가 있어도 빈 프로젝트 안내를 우선한다", () => {
    renderEmpty(1, "no-projects");
    expect(
      screen.getByRole("status", { name: /관계 지도에 그릴 프로젝트가 없습니다/ }),
    ).toBeInTheDocument();
  });

  it("한국어 빈 상태는 topology 내부 용어 대신 관계 지도 상태를 설명한다", () => {
    renderEmpty(0);
    const panel = screen.getByRole("status");
    expect(panel).toHaveTextContent("관계 지도 · 프로젝트 0개");
    expect(panel).toHaveTextContent("관계 지도에 그릴 프로젝트가 없습니다");
    expect(panel).not.toHaveTextContent("TOPOLOGY");
    expect(panel).not.toHaveTextContent("토폴로지");
  });

  it("빈 상태 패널은 큰 카드 대신 작은 상태 패널로 렌더", () => {
    renderEmpty(0);
    const panel = screen.getByRole("status");
    expect(panel.className).toContain("rounded-lg");
    expect(panel.className).not.toContain("rounded-2xl");
    expect(panel.className).not.toContain("p-8");
  });

  it("모든 복구 CTA 는 키보드 focus 링을 가진다 (focus-visible, WCAG 2.4.7)", () => {
    renderEmpty(0);
    // 키보드 사용자가 어떤 복구 액션에 focus 했는지 보이지 않던 회귀 가드.
    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toContain("focus-visible:ring-2");
      expect(link.className).toContain("focus-visible:outline-none");
    }
  });

  it("기본(canCreateNode 미지정) — 노드 생성 CTA 없음", () => {
    renderEmpty(0);
    expect(screen.queryByTestId("empty-create-node")).not.toBeInTheDocument();
  });

  it("canCreateNode — '개념 만들기' 1차 CTA 노출 + 클릭 시 onCreateNode (S6)", () => {
    const onCreateNode = vi.fn();
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <TopologyEmptyState projectCount={0} canCreateNode onCreateNode={onCreateNode} />
      </NextIntlClientProvider>,
    );
    const btn = screen.getByTestId("empty-create-node");
    expect(btn).toHaveTextContent("개념 만들기");
    btn.click();
    expect(onCreateNode).toHaveBeenCalledTimes(1);
  });
});
