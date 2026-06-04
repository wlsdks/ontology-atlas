import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  InsightsPageHeaderChrome,
  InsightsProofBandHeader,
} from "./OntologyInsightsPage";

vi.mock("@/shared/ui", () => ({
  EmptyState: ({ title }: { title: ReactNode }) => <div>{title}</div>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("OntologyInsightsPage compact chrome", () => {
  it("keeps the page explanation visible without turning the header into a card", () => {
    render(
      <InsightsPageHeaderChrome
        eyebrow="Ontology · Check"
        title="연결·검증"
        subtitle="온톨로지 그래프가 AI 에이전트가 읽고 검증할 수 있는 상태인지 확인합니다."
        infoLabel="연결·검증 화면 설명 보기"
        proofPoints={["로컬 그래프", "MCP + CLI handoff", "런타임 게이트"]}
      />,
    );

    expect(screen.getByRole("heading", { name: "연결·검증" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "연결·검증 화면 설명 보기" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "연결·검증 화면 설명 보기" }),
    ).not.toHaveTextContent("!");
    expect(
      screen.getByText("온톨로지 그래프가 AI 에이전트가 읽고 검증할 수 있는 상태인지 확인합니다."),
    ).toHaveClass("text-[color:var(--color-text-tertiary)]");
    expect(screen.getByRole("list", { name: "연결·검증" })).toHaveTextContent(
      "로컬 그래프",
    );
    expect(screen.getByRole("list", { name: "연결·검증" })).toHaveTextContent(
      "MCP + CLI handoff",
    );
    expect(screen.getByRole("list", { name: "연결·검증" })).toHaveTextContent(
      "런타임 게이트",
    );
  });

  it("keeps the proof band introduction visible and compact", () => {
    render(
      <InsightsProofBandHeader
        eyebrow="PROOF — AGENT 가 쓸 준비됐나"
        description="이 그래프를 AI agent 가 탐색할 준비가 됐는지 확인합니다."
        infoLabel="그래프 검증 설명 보기"
      />,
    );

    expect(screen.getByText("PROOF — AGENT 가 쓸 준비됐나")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "그래프 검증 설명 보기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "그래프 검증 설명 보기" })).not.toHaveTextContent("!");
    expect(
      screen.getByText("이 그래프를 AI agent 가 탐색할 준비가 됐는지 확인합니다."),
    ).toHaveClass("text-[color:var(--color-text-tertiary)]");
  });
});
