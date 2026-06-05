import { describe, expect, it, vi } from "vitest";
import { fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../../messages/ko.json";
import { OntologyChangePanel } from "./OntologyChangePanel";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { OntologyChangeset } from "@/shared/lib/ontology-tree";

function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const node = (id: string, title: string): KnowledgeGraphNode => ({
  id,
  title,
  kind: "capability",
  projectIds: [],
  evidenceIds: [],
  lastApprovedAt: new Date("2026-05-29T00:00:00Z"),
  lastApprovedBy: "test",
});

function changeset(over: Partial<OntologyChangeset> = {}): OntologyChangeset {
  const addedNodes = over.addedNodes ?? [];
  const changedNodes = over.changedNodes ?? [];
  const removedNodes = over.removedNodes ?? [];
  return {
    addedNodes,
    removedNodes,
    changedNodes,
    addedEdges: over.addedEdges ?? [],
    removedEdges: over.removedEdges ?? [],
    total: over.total ?? addedNodes.length + changedNodes.length + removedNodes.length,
    touchedNodeIds: over.touchedNodeIds ?? new Set([...addedNodes, ...changedNodes]),
    removedNodeKinds: over.removedNodeKinds ?? new Map(),
  };
}

const baseProps = {
  nodeById: new Map<string, KnowledgeGraphNode>([["capability:a", node("capability:a", "A")]]),
  onMarkBaseline: () => {},
  onClearBaseline: () => {},
  onSelectNode: () => {},
  onAcknowledgeNode: () => {},
  changesOnly: false,
  onToggleChangesOnly: () => {},
};

describe("OntologyChangePanel — changes-only toggle (B2)", () => {
  it("baseline 없음 — mark CTA 만, 토글 없음", () => {
    render(
      <OntologyChangePanel {...baseProps} changeset={changeset()} hasBaseline={false} />,
    );
    expect(screen.getByTestId("ontology-change-panel")).toHaveAttribute("data-density", "compact");
    expect(screen.getByTestId("mark-baseline")).toBeInTheDocument();
    expect(screen.queryByTestId("changes-only-toggle")).not.toBeInTheDocument();
  });

  it("baseline 이후 변경이 없으면 compact row 로 유지하고 agent handoff 는 숨긴다", () => {
    render(
      <OntologyChangePanel {...baseProps} changeset={changeset()} hasBaseline />,
    );
    expect(screen.getByTestId("ontology-change-panel")).toHaveAttribute("data-density", "compact");
    expect(screen.getByTestId("change-summary")).toHaveTextContent("기준 이후 변경 없음");
    expect(screen.queryByTestId("copy-change-agent-handoff")).not.toBeInTheDocument();
  });

  it("baseline 있고 added|changed 있음 — 토글 노출", () => {
    render(
      <OntologyChangePanel
        {...baseProps}
        changeset={changeset({ addedNodes: ["capability:a"] })}
        hasBaseline
      />,
    );
    expect(screen.getByTestId("ontology-change-panel")).toHaveAttribute("data-density", "review");
    expect(screen.getByTestId("changes-only-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("change-panel-actions")).toBeInTheDocument();
    expect(screen.getByTestId("change-panel-chip-scroll")).toBeInTheDocument();
  });

  it("removed 만 있고 added|changed 없음 — 토글 숨김 (트리 필터 대상 없음)", () => {
    render(
      <OntologyChangePanel
        {...baseProps}
        changeset={changeset({ removedNodes: ["capability:gone"], touchedNodeIds: new Set() })}
        hasBaseline
      />,
    );
    expect(screen.queryByTestId("changes-only-toggle")).not.toBeInTheDocument();
  });

  it("토글 클릭 → onToggleChangesOnly 호출, aria-pressed 가 changesOnly 반영", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <OntologyChangePanel
        {...baseProps}
        changeset={changeset({ changedNodes: ["capability:a"] })}
        hasBaseline
        changesOnly={false}
        onToggleChangesOnly={onToggle}
      />,
    );
    const toggle = screen.getByTestId("changes-only-toggle");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <OntologyChangePanel
          {...baseProps}
          changeset={changeset({ changedNodes: ["capability:a"] })}
          hasBaseline
          changesOnly
          onToggleChangesOnly={onToggle}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("changes-only-toggle")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("OntologyChangePanel — chip 에 kind 라벨 (A/B 리뷰 triage)", () => {
  it("added 칩에 노드 kind 라벨(i18n) 노출 — capability → 역량", () => {
    render(
      <OntologyChangePanel
        {...baseProps}
        changeset={changeset({ addedNodes: ["capability:a"] })}
        hasBaseline
      />,
    );
    expect(screen.getByTestId("ontology-change-panel")).toHaveTextContent("역량");
  });

  it("removed 칩은 노드가 그래프에 없어도 removedNodeKinds 의 kind 라벨 노출 — domain → 도메인", () => {
    render(
      <OntologyChangePanel
        {...baseProps}
        changeset={changeset({
          removedNodes: ["domain:gone"],
          removedNodeKinds: new Map([["domain:gone", "domain"]]),
          touchedNodeIds: new Set(),
        })}
        hasBaseline
      />,
    );
    expect(screen.getByTestId("ontology-change-panel")).toHaveTextContent("도메인");
  });
});

describe("OntologyChangePanel — per-node review (Self-Drawing Diff #1)", () => {
  it("각 칩에 ✓ '리뷰함' 버튼이 있고 클릭 시 onAcknowledgeNode(id) 호출", () => {
    const onAck = vi.fn();
    render(
      <OntologyChangePanel
        {...baseProps}
        changeset={changeset({ addedNodes: ["capability:a"] })}
        hasBaseline
        onAcknowledgeNode={onAck}
      />,
    );
    const ack = screen.getByTestId("ack-added-capability:a");
    fireEvent.click(ack);
    expect(onAck).toHaveBeenCalledWith("capability:a");
  });

  it("removed 칩에도 ✓ 가 있어 삭제를 승인할 수 있다", () => {
    const onAck = vi.fn();
    render(
      <OntologyChangePanel
        {...baseProps}
        changeset={changeset({
          removedNodes: ["domain:gone"],
          removedNodeKinds: new Map([["domain:gone", "domain"]]),
          touchedNodeIds: new Set(),
        })}
        hasBaseline
        onAcknowledgeNode={onAck}
      />,
    );
    fireEvent.click(screen.getByTestId("ack-removed-domain:gone"));
    expect(onAck).toHaveBeenCalledWith("domain:gone");
  });
});

describe("OntologyChangePanel — blast-radius badge (Self-Drawing Diff #2)", () => {
  it("changed 칩에 의존자 수(>0)를 노출 — 영향 배지", () => {
    render(
      <OntologyChangePanel
        {...baseProps}
        changeset={changeset({ changedNodes: ["capability:a"] })}
        hasBaseline
        dependentsByNode={new Map([["capability:a", 7]])}
      />,
    );
    const panel = screen.getByTestId("ontology-change-panel");
    expect(panel).toHaveTextContent("7");
    // aria-label 에 의존 영향 문구
    expect(screen.getByLabelText(/7개 개념이 이걸 의존/)).toBeInTheDocument();
  });

  it("의존자 0 이면 배지 없음(노이즈 회피)", () => {
    render(
      <OntologyChangePanel
        {...baseProps}
        changeset={changeset({ addedNodes: ["capability:a"] })}
        hasBaseline
        dependentsByNode={new Map([["capability:a", 0]])}
      />,
    );
    expect(screen.queryByLabelText(/의존/)).not.toBeInTheDocument();
  });
});

describe("OntologyChangePanel — agent handoff copy", () => {
  it("변경점 요약과 MCP 점검 순서를 Claude Code/Codex용 handoff 로 복사한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(
      <OntologyChangePanel
        {...baseProps}
        changeset={changeset({
          addedNodes: ["capability:a"],
          changedNodes: ["capability:b"],
          removedNodes: ["domain:gone"],
          addedEdges: ["capability:a\u0001element:x\u0001contains"],
          removedEdges: ["domain:gone\u0001capability:y\u0001contains"],
          touchedNodeIds: new Set(["capability:a", "capability:b"]),
          removedNodeKinds: new Map([["domain:gone", "domain"]]),
        })}
        nodeById={
          new Map<string, KnowledgeGraphNode>([
            ["capability:a", node("capability:a", "A")],
            ["capability:b", node("capability:b", "B")],
          ])
        }
        hasBaseline
        dependentsByNode={new Map([["capability:b", 3]])}
      />,
    );

    fireEvent.click(screen.getByTestId("copy-change-agent-handoff"));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain("Ontology Atlas ontology change handoff");
    expect(copied).toContain("Nodes: +1 / ~1 / -1");
    expect(copied).toContain("Edges: +1 / -1");
    expect(copied).toContain("query_ontology({ operation: \"node_profile\", slug: \"capability:a\"");
    expect(copied).toContain("query_ontology({ operation: \"blast_radius\", slug: \"capability:b\"");
    expect(copied).toContain("Post-change sync gate:");
    expect(copied).toContain("health");
  });
});

describe("OntologyChangePanel — chip truncation (no silent cap)", () => {
  it("24개 초과 변경은 '+N 더' 로 잘림을 명시한다", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `capability:n${i}`);
    const nodeById = new Map<string, KnowledgeGraphNode>(
      ids.map((id, i) => [id, node(id, `Node ${i}`)]),
    );
    render(
      <OntologyChangePanel
        {...baseProps}
        nodeById={nodeById}
        changeset={changeset({ addedNodes: ids })}
        hasBaseline
      />,
    );
    // 30개 중 24개만 칩으로, 나머지 6개는 "+6" 표시.
    const more = screen.getByTestId("change-more-added");
    expect(more).toHaveTextContent("6");
  });

  it("24개 이하면 잘림 표시 없음", () => {
    const ids = Array.from({ length: 5 }, (_, i) => `capability:n${i}`);
    const nodeById = new Map<string, KnowledgeGraphNode>(
      ids.map((id, i) => [id, node(id, `Node ${i}`)]),
    );
    render(
      <OntologyChangePanel
        {...baseProps}
        nodeById={nodeById}
        changeset={changeset({ addedNodes: ids })}
        hasBaseline
      />,
    );
    expect(screen.queryByTestId("change-more-added")).not.toBeInTheDocument();
  });
});
