import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
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

const messages = {
  topology: {
    empty: {
      kicker: "{count} projects",
      titleNoProjects: "프로젝트가 없습니다",
      titleNoDeps: "의존 관계가 아직 없습니다",
      bodyNoProjectsPicker: "vault 폴더를 선택하세요",
      bodyNoProjectsDownload: "데스크톱 앱을 받으세요",
      bodyNoDeps: "관계를 추가해 보세요",
      crossViewHint: "트리에서 전체 ontology 를 볼 수 있어요",
      ctaCreateNode: "첫 노드 만들기",
      ctaTree: "트리에서 보기",
      ctaBuilder: "빌더 열기",
      ctaOpenVaultPicker: "vault 열기",
      ctaOpenVaultDownload: "앱 다운로드",
    },
  },
};

function renderEmpty(projectCount: number) {
  return render(
    <NextIntlClientProvider locale="ko" messages={messages}>
      <TopologyEmptyState projectCount={projectCount} />
    </NextIntlClientProvider>,
  );
}

describe("TopologyEmptyState", () => {
  it("0 프로젝트일 때 세 개의 복구 CTA 를 모두 노출", () => {
    renderEmpty(0);
    expect(screen.getByText("트리에서 보기").closest("a")).toHaveAttribute(
      "href",
      expect.stringContaining("/ontology"),
    );
    expect(screen.getByText("빌더 열기").closest("a")).toHaveAttribute(
      "href",
      expect.stringContaining("/ontology/edit"),
    );
    // 세 번째 CTA(vault 열기 / 다운로드)도 링크로 존재
    expect(screen.getAllByRole("link")).toHaveLength(3);
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

  it("canCreateNode — '첫 노드 만들기' 1차 CTA 노출 + 클릭 시 onCreateNode (S6)", () => {
    const onCreateNode = vi.fn();
    render(
      <NextIntlClientProvider locale="ko" messages={messages}>
        <TopologyEmptyState projectCount={0} canCreateNode onCreateNode={onCreateNode} />
      </NextIntlClientProvider>,
    );
    const btn = screen.getByTestId("empty-create-node");
    expect(btn).toHaveTextContent("첫 노드 만들기");
    btn.click();
    expect(onCreateNode).toHaveBeenCalledTimes(1);
  });
});
