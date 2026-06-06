import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  getInsightsTabDescriptionKey,
  getInsightsTabForReaderIntent,
  InsightsPageHeaderChrome,
  InsightsProofBandHeader,
  InsightsReaderIntentStrip,
  InsightsSessionProofStrip,
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
  it("maps stakeholder reader intents to the first useful insights tab", () => {
    expect(getInsightsTabForReaderIntent("planning")).toBe("collaboration");
    expect(getInsightsTabForReaderIntent("marketing")).toBe("collaboration");
    expect(getInsightsTabForReaderIntent("leadership")).toBe("collaboration");
    expect(getInsightsTabForReaderIntent("agent")).toBe("agent");
    expect(getInsightsTabForReaderIntent("developer")).toBe("proof");
    expect(getInsightsTabForReaderIntent(null)).toBe("proof");
  });

  it("maps each top-level tab to a short purpose line so hidden information groups stay understandable", () => {
    expect(getInsightsTabDescriptionKey("proof")).toBe("surfaceTabProofDesc");
    expect(getInsightsTabDescriptionKey("collaboration")).toBe(
      "surfaceTabCollaborationDesc",
    );
    expect(getInsightsTabDescriptionKey("agent")).toBe("surfaceTabAgentDesc");
    expect(getInsightsTabDescriptionKey("census")).toBe("surfaceTabCensusDesc");
  });

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

  it("shows reader intent as a quiet first-action strip instead of another dashboard card", () => {
    render(
      <InsightsReaderIntentStrip
        label="Marketing reader intent"
        title="Ground claims in verified capabilities"
        body="Use capability rows and copied graph handoffs before campaign copy."
        actionLabel="Review evidence"
        actionHref="/ontology/insights/?reader=marketing"
      />,
    );

    const strip = screen.getByTestId("insights-reader-intent");
    expect(strip).toHaveAttribute("aria-label", "Marketing reader intent");
    expect(strip).toHaveClass("border-y");
    expect(strip).not.toHaveClass("rounded-lg");
    expect(strip).toHaveTextContent("Ground claims in verified capabilities");
    expect(screen.getByRole("link", { name: "Review evidence" })).toHaveAttribute(
      "href",
      "/ontology/insights/?reader=marketing",
    );
  });

  it("separates direct MCP proof from CLI fallback proof and stale tool cache hints", () => {
    render(
      <InsightsSessionProofStrip
        title="현재 agent 세션 proof 계약"
        copyLabel="세션 증명 복사"
        copiedLabel="복사됨"
        copyText="query_ontology({&quot;operation&quot;:&quot;agent_brief&quot;})"
        items={[
          {
            title: "직접 MCP 증명",
            body: "tools/list 24개, index_project, query_ontology가 보여야 합니다.",
            tone: "direct",
          },
          {
            title: "CLI fallback 증명",
            body: "mcp-verify는 로컬 서버와 vault 상태만 검증합니다.",
            tone: "fallback",
          },
          {
            title: "캐시 불일치",
            body: "23개로 남으면 agent reload 또는 cached MCP tools 갱신.",
            tone: "ready",
          },
        ]}
      />,
    );

    const strip = screen.getByTestId("insights-session-proof-strip");
    expect(strip).toHaveAttribute("aria-label", "현재 agent 세션 proof 계약");
    expect(strip).toHaveTextContent("현재 agent 세션 proof 계약");
    expect(screen.getByRole("button", { name: "세션 증명 복사" })).toBeInTheDocument();
    expect(strip).toHaveTextContent("직접 MCP 증명");
    expect(strip).toHaveTextContent("tools/list 24개");
    expect(strip).toHaveTextContent("CLI fallback 증명");
    expect(strip).toHaveTextContent("로컬 서버와 vault 상태만");
    expect(strip).toHaveTextContent("캐시 불일치");
    expect(strip).toHaveTextContent("cached MCP tools");
  });
});
