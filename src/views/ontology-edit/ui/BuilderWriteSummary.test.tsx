import type React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import {
  BuilderWriteSummary,
  formatBuilderDraftAgentPacket,
} from "./OntologyEditPage";

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
    expect(screen.getByRole("list", { name: "저장·편집 상태" })).toHaveClass(
      "lg:grid-cols-2",
    );
    expect(screen.getByRole("heading", { name: "저장 상태" })).toBeInTheDocument();
    expect(screen.getByText("다음")).toBeInTheDocument();
    expect(
      screen.getByText("쓰기 가능한 vault를 선택하면 저장 액션이 활성화됩니다."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("저장 연결, 임시 변경, 관계 저장 점검, 그래프 검증이 필요할 때만 엽니다."),
    ).not.toBeInTheDocument();
    expect(screen.getByText("저장 연결")).toBeInTheDocument();
    expect(screen.getByText("임시 변경")).toBeInTheDocument();
    expect(screen.getByText("저장 점검")).toBeInTheDocument();
    expect(screen.getByText("그래프 검증")).toBeInTheDocument();
    expect(screen.getByText("샘플 읽기 전용")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: /쓰기 가능한 vault 선택/ })).toBeInTheDocument();
    expect(screen.queryByText("문서함")).not.toBeInTheDocument();
    expect(screen.getByText("새 개념과 관계는 각 저장 액션이 vault 마크다운을 쓰기 전까지 메모리에만 있습니다.")).toBeInTheDocument();
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

  it("draft가 있으면 저장 상태 상단에 다음 행동을 먼저 보여준다", () => {
    const onOpenDraft = vi.fn();
    renderSummary({
      draftNodes: 1,
      draftEdges: 1,
      draftPreviews: [
        {
          id: "ephemeral-domain-1",
          kind: "domain",
          kindLabel: "도메인",
          title: "Access Control",
          path: "domains/access-control.md",
          needsName: false,
        },
      ],
      onOpenDraft,
    });

    expect(
      screen.getByText(
        "저장 경로가 준비됐습니다. 개념 1개 · 관계 1개를 저장하거나 Agent에 넘기세요.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "저장할 임시 개념 미리보기" }),
    ).toBeInTheDocument();
    expect(screen.getByText("도메인 · Access Control")).toBeInTheDocument();
    expect(screen.getByText("domains/access-control.md")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "저장 준비된 임시 개념 1개의 Agent packet 복사",
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "임시 개념 상세 열기" }));
    expect(onOpenDraft).toHaveBeenCalledTimes(1);
  });

  it("draft preview 가 많으면 앞의 세 개만 보여주고 나머지 개수를 접는다", () => {
    renderSummary({
      draftNodes: 4,
      draftEdges: 0,
      draftPreviews: [
        {
          id: "n1",
          kind: "domain",
          kindLabel: "도메인",
          title: "One",
          path: "domains/one.md",
          needsName: false,
        },
        {
          id: "n2",
          kind: "capability",
          kindLabel: "역량",
          title: "Two",
          path: "capabilities/two.md",
          needsName: false,
        },
        {
          id: "n3",
          kind: "element",
          kindLabel: "요소",
          title: "Three",
          path: "elements/three.md",
          needsName: false,
        },
        {
          id: "n4",
          kind: "element",
          kindLabel: "요소",
          title: "Four",
          path: "elements/four.md",
          needsName: false,
        },
      ],
    });

    expect(screen.getByText("도메인 · One")).toBeInTheDocument();
    expect(screen.getByText("역량 · Two")).toBeInTheDocument();
    expect(screen.getByText("요소 · Three")).toBeInTheDocument();
    expect(screen.queryByText("요소 · Four")).not.toBeInTheDocument();
    expect(screen.getByText("외 1개 임시 개념")).toBeInTheDocument();
  });

  it("이름이 없는 draft 는 next step 에서 이름 입력을 먼저 요구한다", () => {
    renderSummary({
      draftNodes: 1,
      draftEdges: 0,
      draftPreviews: [
        {
          id: "n1",
          kind: "domain",
          kindLabel: "도메인",
          title: "(이름 필요)",
          path: "이름 입력 후 경로 생성",
          needsName: true,
        },
      ],
    });

    expect(
      screen.getByText("먼저 이름을 정하고 저장할 개념 1개 · 관계 0개를 확인하세요."),
    ).toBeInTheDocument();
  });

  it("관계 사전 점검이 대기 중이면 next step 을 관계 검토로 바꾼다", () => {
    renderSummary({
      pendingRelation: {
        sourceSlug: "domains/views",
        targetSlug: "capabilities/builder-canvas-polish",
        sourceKind: "domain",
        targetKind: "capability",
        inferredKey: "capabilities",
      },
    });

    expect(
      screen.getByText(
        "domains/views → capabilities/builder-canvas-polish 관계를 쓰기 전에 사전 점검하세요.",
      ),
    ).toBeInTheDocument();
  });

  it("formats draft agent packet as MCP add_concepts args", () => {
    expect(
      formatBuilderDraftAgentPacket([
        {
          id: "n1",
          kind: "domain",
          kindLabel: "도메인",
          title: "Access Control",
          path: "domains/access-control.md",
          needsName: false,
        },
      ]),
    ).toContain('"concepts": [');
    expect(
      formatBuilderDraftAgentPacket([
        {
          id: "n1",
          kind: "domain",
          kindLabel: "도메인",
          title: "Access Control",
          path: "domains/access-control.md",
          needsName: false,
        },
      ]),
    ).toContain('"slug": "domains/access-control"');
  });

  it("keeps the proof link focused when only the graph node id is available", () => {
    renderSummary({
      selectedProofNodeId: "project:oh-my-ontology",
      selectedProofSlug: null,
    });

    expect(screen.getByRole("link", { name: /선택 개념 검증 열기/ })).toHaveAttribute(
      "href",
      "/ontology/insights/?node=project%3Aoh-my-ontology",
    );
  });
});
