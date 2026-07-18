import { NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import type { KnowledgeGraphNode, KnowledgeGraphEdge } from "@/entities/knowledge-graph";
import type { OntologyEgoNeighbor, OntologyEgoSubgraph } from "@/shared/lib/ontology-tree";
import { EGO_DENSE_GROUPING_DEFAULT_PER_KIND_CAP } from "../lib/dense-grouping";
import { OntologyEgoGraph } from "./OntologyEgoGraph";

function node(overrides: Partial<KnowledgeGraphNode> = {}): KnowledgeGraphNode {
  return {
    id: "element:x",
    title: "X",
    kind: "element",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
    ...overrides,
  };
}

function edge(overrides: Partial<KnowledgeGraphEdge> & { id: string }): KnowledgeGraphEdge {
  return {
    from: "center",
    to: "neighbor",
    type: "related_to",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
    ...overrides,
  };
}

function neighbor(
  overrides: Partial<OntologyEgoNeighbor> & { hop: 1 | 2; neighborId: string },
): OntologyEgoNeighbor {
  return {
    node: node({ id: overrides.neighborId }),
    edge: edge({ id: `edge:${overrides.neighborId}`, to: overrides.neighborId }),
    direction: "outgoing",
    ...overrides,
  };
}

function ringOfKind(count: number, hop: 1 | 2, kind: string, idPrefix: string) {
  return Array.from({ length: count }, (_, i) => {
    const id = `${kind}:${idPrefix}-${i}`;
    return neighbor({ hop, neighborId: id, node: node({ id, kind, title: id }) });
  });
}

function renderEgoGraph(
  neighbors: OntologyEgoNeighbor[],
  props: Partial<Parameters<typeof OntologyEgoGraph>[0]> = {},
) {
  const ego: OntologyEgoSubgraph = { centerId: "center", neighbors };
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <OntologyEgoGraph
        ego={ego}
        centerNode={node({ id: "center", title: "Center" })}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("OntologyEgoGraph — dense-scale rendering", () => {
  it("regression: a small ego (<12 neighbors) draws and labels every neighbor as before", () => {
    const neighbors = [
      ...ringOfKind(4, 1, "element", "e"),
      ...ringOfKind(2, 2, "capability", "c"),
    ];
    renderEgoGraph(neighbors);

    const shownNodes = document.querySelectorAll('[data-neighbor-index]');
    expect(shownNodes).toHaveLength(6);
    for (const el of Array.from(shownNodes)) {
      expect(el.getAttribute("data-label-shown")).toBe("true");
    }
    expect(screen.queryByRole("button", { name: /\+/ })).not.toBeInTheDocument();
  });

  it("caps a dense single-kind ring to the per-kind cap and shows a '+N' overflow chip instead of a giant dot ring", () => {
    const neighbors = ringOfKind(34, 1, "element", "e");
    renderEgoGraph(neighbors);

    const shownNodes = document.querySelectorAll('[data-neighbor-index]');
    expect(shownNodes).toHaveLength(EGO_DENSE_GROUPING_DEFAULT_PER_KIND_CAP);

    const remainder = 34 - EGO_DENSE_GROUPING_DEFAULT_PER_KIND_CAP;
    expect(
      screen.getByRole("button", { name: `Element +${remainder}` }),
    ).toBeInTheDocument();
  });

  it("never draws a 194-dot ring — 2-hop dense breakdown caps drawn nodes across kinds", () => {
    const hop1 = ringOfKind(34, 1, "element", "e1");
    const hop2 = [
      ...ringOfKind(120, 2, "element", "e2"),
      ...ringOfKind(74, 2, "capability", "c2"),
    ];
    renderEgoGraph([...hop1, ...hop2]);

    const shownNodes = document.querySelectorAll('[data-neighbor-index]');
    // capped: 8 (hop1 element) + 8 (hop2 element) + 8 (hop2 capability) = 24, never 34+194=228.
    expect(shownNodes.length).toBe(EGO_DENSE_GROUPING_DEFAULT_PER_KIND_CAP * 3);
    expect(shownNodes.length).toBeLessThan(30);
  });

  it("invokes onOverflowClick when an overflow chip is activated", () => {
    const onOverflowClick = vi.fn();
    const neighbors = ringOfKind(20, 1, "element", "e");
    renderEgoGraph(neighbors, { onOverflowClick });

    const chip = screen.getByRole("button", { name: "Element +12" });
    fireEvent.click(chip);
    expect(onOverflowClick).toHaveBeenCalledTimes(1);
  });
});

describe("OntologyEgoGraph — preserved strengths", () => {
  it("keeps neighbors keyboard-operable (Tab focus + Enter selects)", () => {
    const onSelectNeighbor = vi.fn();
    const target = node({ id: "element:target", title: "Target" });
    renderEgoGraph(
      [neighbor({ hop: 1, neighborId: "element:target", node: target })],
      { onSelectNeighbor },
    );

    const button = screen.getByRole("button", { name: /Target/ });
    fireEvent.keyDown(button, { key: "Enter" });
    expect(onSelectNeighbor).toHaveBeenCalledWith(target);
  });

  it("keeps a native <title> tooltip on every neighbor for hover/focus identification", () => {
    const target = node({ id: "element:target", title: "Target" });
    renderEgoGraph([neighbor({ hop: 1, neighborId: "element:target", node: target })]);

    const group = document.querySelector('[data-neighbor-index="0"]')!;
    expect(within(group as HTMLElement).getByText(/Target \(/)).toBeInTheDocument();
  });

  it("keeps the ego graph as an accessible <svg role=img>", () => {
    renderEgoGraph(ringOfKind(2, 1, "element", "e"));
    expect(screen.getByRole("img")).toBeInTheDocument();
  });
});
