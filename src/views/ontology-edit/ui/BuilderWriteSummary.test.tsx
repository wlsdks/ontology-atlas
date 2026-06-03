import type React from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import { BuilderWriteSummary } from "./OntologyEditPage";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

function renderSummary(
  props: Partial<React.ComponentProps<typeof BuilderWriteSummary>> = {},
) {
  render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <BuilderWriteSummary
        writable={false}
        restoringVault={false}
        vaultUnavailable={false}
        isDesktopRuntime={true}
        persistedNodes={69}
        persistedRelations={434}
        draftNodes={0}
        draftEdges={0}
        selectedProofNodeId={null}
        selectedProofSlug={null}
        pendingRelation={null}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("BuilderWriteSummary", () => {
  it("renders as a compact proof menu instead of always-visible numbered cards", () => {
    renderSummary();

    expect(screen.getByRole("list", { name: "저장·편집 상태" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "저장과 검증" })).toBeInTheDocument();
    expect(screen.getByText("문서함")).toBeInTheDocument();
    expect(screen.getByText("임시 변경")).toBeInTheDocument();
    expect(screen.getByText("저장 점검")).toBeInTheDocument();
    expect(screen.getByText("그래프 검증")).toBeInTheDocument();
    expect(screen.getByText("관계 저장은 관계 종류 추론, 사전 점검, 동기화 전달을 거칩니다.")).toBeInTheDocument();
    expect(screen.getByText("그래프 점검 14개")).toBeInTheDocument();

    expect(screen.queryByText("01")).not.toBeInTheDocument();
    expect(screen.queryByText("02")).not.toBeInTheDocument();
    expect(screen.queryByText("03")).not.toBeInTheDocument();
    expect(screen.queryByText("04")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("listitem").map((item) => item.getAttribute("aria-label")),
    ).toEqual([
      expect.not.stringMatching(/\b0[1-4]\b/),
      expect.not.stringMatching(/\b0[1-4]\b/),
      expect.not.stringMatching(/\b0[1-4]\b/),
      expect.not.stringMatching(/\b0[1-4]\b/),
    ]);
  });

  it("uses Korean relation and path terms for selected node proof copy", () => {
    renderSummary({
      selectedProofNodeId: "ontology/project",
      selectedProofSlug: "ontology/project",
    });

    expect(screen.getByText(/계획된 관계 스캔/)).toBeInTheDocument();
    expect(screen.getByText(/경로 계획/)).toBeInTheDocument();
    expect(screen.queryByText(/edge scan/)).not.toBeInTheDocument();
    expect(screen.queryByText(/path plan/)).not.toBeInTheDocument();
  });
});
