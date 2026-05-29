import { describe, expect, it, vi } from "vitest";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
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
  };
}

const baseProps = {
  nodeById: new Map<string, KnowledgeGraphNode>([["capability:a", node("capability:a", "A")]]),
  onMarkBaseline: () => {},
  onClearBaseline: () => {},
  onSelectNode: () => {},
  changesOnly: false,
  onToggleChangesOnly: () => {},
};

describe("OntologyChangePanel — changes-only toggle (B2)", () => {
  it("baseline 없음 — mark CTA 만, 토글 없음", () => {
    render(
      <OntologyChangePanel {...baseProps} changeset={changeset()} hasBaseline={false} />,
    );
    expect(screen.getByTestId("mark-baseline")).toBeInTheDocument();
    expect(screen.queryByTestId("changes-only-toggle")).not.toBeInTheDocument();
  });

  it("baseline 있고 added|changed 있음 — 토글 노출", () => {
    render(
      <OntologyChangePanel
        {...baseProps}
        changeset={changeset({ addedNodes: ["capability:a"] })}
        hasBaseline
      />,
    );
    expect(screen.getByTestId("changes-only-toggle")).toBeInTheDocument();
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
