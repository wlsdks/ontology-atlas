import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { HeroHeader } from "./HeroHeader";

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

vi.mock("next/image", () => ({
  default: ({ alt, priority, ...props }: { alt: string; priority?: boolean; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} data-priority={priority ? "true" : undefined} {...props} />
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const messages: Record<string, string> = {
      collapseLeft: "좌측 패널 접기",
      defaultTitleTopology: "지형도",
      defaultEyebrow: "워크스페이스",
      summaryDefault: "기본 설명",
      findProject: "프로젝트 찾기",
      findOtherProject: "다른 프로젝트 찾기",
      projectsList: "프로젝트 목록",
      docsVault: "문서함",
      docsVaultAriaLabel: "문서함 열기",
      ontology: "온톨로지",
      ontologyAriaLabel: "온톨로지 열기",
    };
    return (key: string) => messages[key] ?? key;
  },
}));

vi.mock("@/shared/ui", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe("HeroHeader", () => {
  it("shows the summary by default", () => {
    render(
      <HeroHeader
        onOpenSearch={() => {}}
        title="지형도"
        eyebrow="1 프로젝트"
        description="노드를 클릭해 상세를 열어 볼 수 있어요."
      />,
    );

    expect(screen.getByText("노드를 클릭해 상세를 열어 볼 수 있어요.")).toBeInTheDocument();
  });

  it("can hide the summary for compact topology chrome", () => {
    render(
      <HeroHeader
        onOpenSearch={() => {}}
        title="지형도"
        eyebrow="1 프로젝트"
        description="노드를 클릭해 상세를 열어 볼 수 있어요."
        showSummary={false}
      />,
    );

    expect(
      screen.queryByText("노드를 클릭해 상세를 열어 볼 수 있어요."),
    ).not.toBeInTheDocument();
  });
});
