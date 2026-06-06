import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  buildInsightsReaderPresetHref,
  getInsightsTabDescriptionKey,
  getInsightsTabForReaderIntent,
  InsightsPageHeaderChrome,
  InsightsProofBandHeader,
  InsightsQuestionPresetStrip,
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
        eyebrow="온톨로지 · 질문과 근거"
        title="그래프에 묻고 근거로 확인"
        subtitle="허브, 경로, 영향, 소유권 질문을 같은 로컬 온톨로지에서 확인합니다."
        infoLabel="질문·근거 화면 설명 보기"
        proofPoints={["질문할 그래프", "MCP/CLI 재현", "근거 게이트"]}
      />,
    );

    expect(screen.getByRole("heading", { name: "그래프에 묻고 근거로 확인" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "질문·근거 화면 설명 보기" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "질문·근거 화면 설명 보기" }),
    ).not.toHaveTextContent("!");
    expect(
      screen.getByText("허브, 경로, 영향, 소유권 질문을 같은 로컬 온톨로지에서 확인합니다."),
    ).toHaveClass("text-[color:var(--color-text-tertiary)]");
    expect(screen.getByRole("list", { name: "그래프에 묻고 근거로 확인" })).toHaveTextContent(
      "질문할 그래프",
    );
    expect(screen.getByRole("list", { name: "그래프에 묻고 근거로 확인" })).toHaveTextContent(
      "MCP/CLI 재현",
    );
    expect(screen.getByRole("list", { name: "그래프에 묻고 근거로 확인" })).toHaveTextContent(
      "근거 게이트",
    );
  });

  it("keeps the proof band introduction visible and compact", () => {
    render(
      <InsightsProofBandHeader
        eyebrow="근거 게이트"
        description="이 그래프에서 나온 답을 agent나 사람이 믿어도 되는지 확인합니다."
        infoLabel="근거 게이트 설명 보기"
      />,
    );

    expect(screen.getByText("근거 게이트")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "근거 게이트 설명 보기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "근거 게이트 설명 보기" })).not.toHaveTextContent("!");
    expect(
      screen.getByText("이 그래프에서 나온 답을 agent나 사람이 믿어도 되는지 확인합니다."),
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

  it("shows stakeholder graph questions as quiet first-screen presets", () => {
    render(
      <InsightsQuestionPresetStrip
        ariaLabel="Role-based graph questions"
        eyebrow="Start with a question"
        title="Pick a role to ask the same graph for evidence."
        body="Planning, marketing, leadership, development, and agent work start from different questions."
        presets={[
          {
            reader: "Planning",
            question: "Vocabulary boundaries before scope",
            href: buildInsightsReaderPresetHref("planning"),
            selected: false,
          },
          {
            reader: "Marketing",
            question: "Capability evidence for claims",
            href: buildInsightsReaderPresetHref("marketing"),
            selected: true,
          },
        ]}
      />,
    );

    const strip = screen.getByTestId("insights-question-presets");
    expect(strip).toHaveAttribute("aria-label", "Role-based graph questions");
    expect(strip).toHaveClass("border-y");
    expect(strip).toHaveClass("hidden");
    expect(strip).toHaveClass("md:block");
    expect(strip).not.toHaveClass("rounded-lg");
    expect(strip).toHaveTextContent("Pick a role to ask the same graph for evidence.");
    expect(screen.getByRole("link", { name: /Planning/ })).toHaveAttribute(
      "href",
      "/ontology/insights/?reader=planning",
    );
    const selected = screen.getByRole("link", { name: /Marketing/ });
    expect(selected).toHaveAttribute("href", "/ontology/insights/?reader=marketing");
    expect(selected).toHaveAttribute("aria-current", "page");
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
