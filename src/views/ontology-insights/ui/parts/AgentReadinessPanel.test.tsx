import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../../messages/ko.json";
import { AgentReadinessPanel } from "./AgentReadinessPanel";
import { buildAgentReadinessSummary } from "@/shared/lib/ontology-tree";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/entities/knowledge-graph";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href.startsWith("/") ? `/ko${href}` : href} {...props}>
      {children}
    </a>
  ),
}));

function node(id: string, kind: string): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "t",
  };
}

function edge(from: string, to: string): KnowledgeGraphEdge {
  return {
    id: `${from}-${to}`,
    from,
    to,
    type: "relates",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "t",
  };
}

function renderPanel(summary: ReturnType<typeof buildAgentReadinessSummary>) {
  return rtlRender(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <AgentReadinessPanel
        summary={summary}
        status={summary.status}
        score={summary.score}
        meaningfulNodes={summary.meaningfulNodes}
        relationCount={summary.relationCount}
        orphanCount={summary.orphanCount}
        unknownNodes={summary.unknownNodes}
        hubCount={summary.hubCount}
        averageDegree={summary.averageDegree}
        actionKeys={summary.actionKeys}
      />
    </NextIntlClientProvider>,
  );
}

describe("AgentReadinessPanel — CLI fallback 명령 silent cap 없음", () => {
  it("첫 화면에서 Claude Code/Codex handoff와 CLI 대체 복사를 먼저 노출한다", () => {
    const nodes = [node("a", "capability"), node("b", "capability"), node("c", "domain")];
    const edges = [edge("a", "b"), edge("c", "a")];
    const summary = buildAgentReadinessSummary(nodes, edges, { orphans: [] });

    renderPanel(summary);

    expect(screen.getByText("에이전트 세션 시작")).toBeInTheDocument();
    expect(
      screen.getByText(/Claude Code나 Codex에는 준비도 프롬프트를 먼저/),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "수리 프롬프트 복사" })[0]).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "CLI 점검 복사" })[0]).toBeInTheDocument();
    expect(screen.getByText("개발 repo 직접 검증")).toBeInTheDocument();
    expect(screen.getByText(/docs\/ontology 폴더를 문서함으로 열고/)).toBeInTheDocument();
    expect(screen.getByText("pnpm vault:validate")).toBeInTheDocument();
    expect(screen.getByText("pnpm dogfood:graph-db")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "개발 검증 복사" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "문서함 열기" })).toHaveAttribute(
      "href",
      "/ko/docs/?intent=local&dogfood=1",
    );
  });

  it("issue-specific 명령(baseline 8 뒤)도 표시 — orphans 있으면 find_orphans CLI 노출", () => {
    // orphans 존재 → actionKeys 에 linkOrphans → find_orphans 명령이 baseline 8개
    // 뒤(index ≥8)에 append 된다. 그런데 copy 버튼은 *전체* 를 복사하므로, 표시도
    // 전체여야 일관 (display ≠ copy 는 silent cap — iter 13 원칙 위반).
    const nodes = [
      node("a", "capability"),
      node("b", "capability"),
      node("c", "capability"),
      node("orphan", "element"),
    ];
    const edges = [edge("a", "b")];
    const summary = buildAgentReadinessSummary(nodes, edges, {
      orphans: [node("orphan", "element")],
    });
    // 테스트 전제: orphans 가 linkOrphans actionKey 를 만들어야 유효
    expect(summary.actionKeys).toContain("linkOrphans");

    renderPanel(summary);

    // baseline 8개 뒤에 오는 issue-specific 명령이 잘리지 않고 표시되어야 한다.
    expect(screen.getByText(/ontology-atlas orphans/)).toBeInTheDocument();
  });
});
