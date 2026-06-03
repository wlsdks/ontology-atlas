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
      bodyNoProjectsPicker: "로컬 vault 를 열거나 저장·편집에서 첫 프로젝트를 만드세요.",
      bodyNoProjectsDownload: "macOS 앱에서 로컬 vault 를 열면 관계 지도가 준비됩니다.",
      bodyNoDeps: "프로젝트 사이 관계를 하나 추가하면 선이 그려집니다.",
      crossViewHint: "도메인·기능·요소 개념은 둘러보기와 저장·편집에서 확인하세요.",
      ctaCreateNode: "첫 노드 만들기",
      ctaTree: "개념 둘러보기",
      ctaBuilder: "저장·편집 열기",
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
  it("0 프로젝트일 때 복구 CTA 를 명확한 화면 이름으로 노출", () => {
    renderEmpty(0);
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
    renderEmpty(1);
    const hint = screen.getByText("도메인·기능·요소 개념은 둘러보기와 저장·편집에서 확인하세요.");
    expect(hint.className).not.toContain("rounded-md");
    expect(hint.className).not.toContain("border");
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
