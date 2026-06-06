import { useState } from "react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import {
  BuilderCanvasEntryRail,
  BuilderCommandStrip,
  BuilderDetailsDraftCallout,
  BuilderReaderIntentStrip,
  formatBuilderActiveFocusLabel,
  formatBuilderAnchorDegreeBadge,
  resolveBuilderHeaderActionLabel,
  resolveBuilderCommandStripState,
} from "./OntologyEditPage";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const anchors = [
  {
    id: "ontology/project",
    label: "ontology-atlas",
    kind: "project",
    degree: 6,
  },
  {
    id: "ontology/capabilities/mcp-server",
    label: "MCP Server",
    kind: "capability",
    degree: 4,
  },
];

function RailHarness() {
  const [expanded, setExpanded] = useState(false);
  return (
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <BuilderCanvasEntryRail
        anchors={anchors}
        nodeCount={64}
        relationCount={363}
        selectedAnchorId="ontology/project"
        expanded={expanded}
        onToggleExpanded={() => setExpanded((open) => !open)}
        onFocusAnchor={() => {}}
        onOpenAnchors={() => {}}
      />
    </NextIntlClientProvider>
  );
}

describe("BuilderCanvasEntryRail", () => {
  it("저장 개념 선택 창의 연결 수 badge 를 locale label 로 만든다", () => {
    expect(formatBuilderAnchorDegreeBadge("연결", 6)).toBe("연결 6");
    expect(formatBuilderAnchorDegreeBadge("connections", 4)).toBe("connections 4");
  });

  it("접힌 rail 의 기준 개념 slug 를 차분한 visible label 로 만든다", () => {
    expect(formatBuilderActiveFocusLabel("기준", "ontology/project")).toBe(
      "기준 ontology/project",
    );
    expect(formatBuilderActiveFocusLabel("focus", "ontology/project")).toBe(
      "focus ontology/project",
    );
  });

  it("기본 상태에서는 캔버스 위 저장 개념 목록을 compact 버튼으로 접는다", () => {
    render(<RailHarness />);

    expect(screen.getByRole("button", { name: /저장된 개념/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: /저장된 개념/ })).toHaveAttribute(
      "aria-label",
      "접힌 저장된 개념 목록 · 개념 64 · 참조 363 · 활성 기준 개념 slug ontology/project",
    );
    expect(screen.getByRole("button", { name: /저장된 개념/ })).toHaveAttribute(
      "title",
      "연결이 많은 저장된 개념입니다. 그리기 전에 기준 개념을 고르면 포커스, 정보 패널, 검증 링크가 같은 slug 를 유지합니다.",
    );
    expect(
      screen.getByRole("region", {
        name: "접힌 저장된 개념 목록 · 개념 64 · 참조 363",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("기준 ontology/project")).toBeInTheDocument();
    expect(screen.queryByText("기준 개념 먼저")).toBeNull();
  });

  it("사용자가 열 때만 전체 저장 개념 목록을 보여준다", () => {
    render(<RailHarness />);

    fireEvent.click(screen.getByRole("button", { name: /저장된 개념/ }));

    expect(screen.getByRole("region", { name: /저장된 개념 목록/ })).toBeInTheDocument();
    expect(screen.getByText("기준 개념 먼저")).toBeInTheDocument();
    const focusedAnchor = screen.getByRole("button", { name: /프로젝트/ });
    expect(focusedAnchor).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(focusedAnchor).not.toHaveAttribute(
      "aria-label",
      expect.stringContaining(", project,"),
    );
    expect(focusedAnchor).not.toHaveAttribute(
      "title",
      expect.stringContaining("project 저장 개념"),
    );
  });
});

describe("BuilderCommandStrip", () => {
  it("상태별 다음 액션을 draft보다 relation preflight와 선택 상태 우선으로 고른다", () => {
    expect(
      resolveBuilderCommandStripState({
        draftNodes: 0,
        draftEdges: 0,
        hasSelection: false,
        hasPendingRelation: false,
      }),
    ).toBe("empty");
    expect(
      resolveBuilderCommandStripState({
        draftNodes: 1,
        draftEdges: 0,
        hasSelection: false,
        hasPendingRelation: false,
      }),
    ).toBe("draft");
    expect(
      resolveBuilderCommandStripState({
        draftNodes: 1,
        draftEdges: 1,
        hasSelection: true,
        hasPendingRelation: false,
        selectedKind: "domain",
        selectedEphemeral: true,
      }),
    ).toBe("draft");
    expect(
      resolveBuilderCommandStripState({
        draftNodes: 1,
        draftEdges: 1,
        hasSelection: true,
        hasPendingRelation: false,
        selectedKind: "project",
      }),
    ).toBe("selectedProject");
    expect(
      resolveBuilderCommandStripState({
        draftNodes: 1,
        draftEdges: 1,
        hasSelection: true,
        hasPendingRelation: false,
        selectedKind: "domain",
      }),
    ).toBe("selectedDomain");
    expect(
      resolveBuilderCommandStripState({
        draftNodes: 1,
        draftEdges: 1,
        hasSelection: true,
        hasPendingRelation: false,
        selectedKind: "capability",
      }),
    ).toBe("selectedCapability");
    expect(
      resolveBuilderCommandStripState({
        draftNodes: 1,
        draftEdges: 1,
        hasSelection: true,
        hasPendingRelation: false,
        selectedKind: "element",
      }),
    ).toBe("selected");
    expect(
      resolveBuilderCommandStripState({
        draftNodes: 1,
        draftEdges: 1,
        hasSelection: true,
        hasPendingRelation: true,
      }),
    ).toBe("relationReview");
  });

  it("기본 root project 선택 상태에서는 바로 하위 도메인을 추가할 수 있게 안내한다", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <BuilderCommandStrip
          state="selectedProject"
          draftNodes={0}
          draftEdges={0}
          selectedTitle="ontology-atlas"
          onPrimaryAction={() => {}}
          onSecondaryAction={() => {}}
          secondaryHref="/ontology/insights/?node=ontology-atlas"
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("ontology-atlas 확장 중")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /도메인 추가/ })).toHaveAttribute(
      "aria-label",
      "도메인 추가",
    );
    expect(screen.getByRole("button", { name: /도메인 추가/ })).toHaveAttribute(
      "title",
      "도메인 추가",
    );
    expect(screen.getByRole("button", { name: /도메인 추가/ })).toHaveTextContent(
      "도메인 추가",
    );
    expect(screen.getByRole("button", { name: /도메인 추가/ }).className).toContain(
      "h-8",
    );
    expect(screen.getByRole("link", { name: /검증 열기/ })).toHaveAttribute(
      "href",
      "/ontology/insights/?node=ontology-atlas",
    );
    expect(screen.getByRole("link", { name: /검증 열기/ })).toHaveAttribute(
      "aria-label",
      "ontology-atlas 검증 열기",
    );
    expect(screen.getByRole("link", { name: /검증 열기/ })).toHaveAttribute(
      "title",
      "ontology-atlas 검증 열기",
    );
    expect(screen.getByRole("link", { name: /검증 열기/ })).toHaveTextContent(
      "검증 열기",
    );
    expect(screen.getByRole("link", { name: /검증 열기/ }).className).toContain("h-8");
    expect(screen.getByRole("link", { name: /검증 열기/ }).className).toContain(
      "rgba(94,106,210,0.10)",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("임시 개념과 관계가 생기면 캔버스 stage 상태를 live status 로 알린다", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <BuilderCommandStrip
          state="draft"
          draftNodes={1}
          draftEdges={1}
          selectedTitle={null}
          onPrimaryAction={() => {}}
          onSecondaryAction={() => {}}
        />
      </NextIntlClientProvider>,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("캔버스 준비됨 · 개념 1 · 관계 1");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveClass("motion-safe:animate-[atlasStatusIn_180ms_ease-out]");
  });

  it("선택된 개념의 다음 편집과 검증 액션을 compact strip 으로 보여준다", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <BuilderCommandStrip
          state="selected"
          draftNodes={0}
          draftEdges={0}
          selectedTitle="Builder Canvas Polish"
          onPrimaryAction={() => {}}
          onSecondaryAction={() => {}}
          secondaryHref="/ontology/insights/?node=capabilities%2Fbuilder-canvas-polish"
        />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByRole("region", { name: "저장·편집 다음 액션" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Builder Canvas Polish 작업 중")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /상세/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /검증 열기/ })).toHaveAttribute(
      "href",
      "/ontology/insights/?node=capabilities%2Fbuilder-canvas-polish",
    );
  });
});

describe("BuilderReaderIntentStrip", () => {
  it("keeps reader context visible on the write surface without adding a nested card", () => {
    render(
      <BuilderReaderIntentStrip
        label="Developer reader intent"
        title="Trace capability to implementation evidence"
        body="Focus the capability, add the implementing element, then copy the sync gate."
        actionLabel="Back to Browse"
        actionHref="/ontology/"
      />,
    );

    const strip = screen.getByTestId("builder-reader-intent");
    expect(strip).toHaveAttribute("aria-label", "Developer reader intent");
    expect(strip).toHaveClass("border-y");
    expect(strip).not.toHaveClass("rounded-lg");
    expect(strip).toHaveTextContent("Trace capability to implementation evidence");
    expect(screen.getByRole("link", { name: "Back to Browse" })).toHaveAttribute(
      "href",
      "/ontology/",
    );
  });
});

describe("BuilderDetailsDraftCallout", () => {
  it("상세 창 안에서도 임시 작업과 저장 상태 진입을 보여준다", () => {
    const onOpenWriteSummary = vi.fn();

    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <BuilderDetailsDraftCallout
          draftNodes={1}
          draftEdges={1}
          onOpenWriteSummary={onOpenWriteSummary}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("캔버스 준비됨 · 개념 1 · 관계 1")).toBeInTheDocument();
    expect(
      screen.getByText("이름을 정한 뒤 저장·에이전트 전달에서 md 내보내기와 그래프 검증을 이어갑니다."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "저장·에이전트 전달" }));
    expect(
      screen.getByRole("button", { name: "저장·에이전트 전달" }).className,
    ).toContain("h-8");
    expect(onOpenWriteSummary).toHaveBeenCalledTimes(1);
  });

  it("임시 작업이 없으면 상세 창 callout 을 숨긴다", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <BuilderDetailsDraftCallout
          draftNodes={0}
          draftEdges={0}
          onOpenWriteSummary={() => {}}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByText(/캔버스 준비됨/)).not.toBeInTheDocument();
  });
});

describe("resolveBuilderHeaderActionLabel", () => {
  it("상단 접힌 도구 버튼의 짧은 텍스트에 설명 label 과 tooltip 을 붙인다", () => {
    expect(
      resolveBuilderHeaderActionLabel({
        label: "배치 보기",
        hint: "캔버스 보기와 정렬 옵션 열기",
      }),
    ).toEqual({
      ariaLabel: "배치 보기 · 캔버스 보기와 정렬 옵션 열기",
      title: "캔버스 보기와 정렬 옵션 열기",
    });
    expect(
      resolveBuilderHeaderActionLabel({
        label: "저장 상태",
        hint: "저장 상태와 검증 흐름",
      }),
    ).toEqual({
      ariaLabel: "저장 상태 · 저장 상태와 검증 흐름",
      title: "저장 상태와 검증 흐름",
    });
  });
});
