import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * Regression guard for "a closed full-detail card traversed the graph on every
 * click".
 *
 * Measured 2026-07-28 (isolated Chromium, dogfood vault): one node click ran
 * `buildConnections` 11 times, 9 of them for a full-detail card **not on
 * screen** — including a depth-3 BFS and a full edge scan per neighbour row.
 *
 * This test locks the **count**, not milliseconds: absolute ms differ per
 * machine and flake, while "closed means zero" is true on every machine.
 * Removing the `open` gate fails it immediately.
 */

const groupsSpy = vi.fn(() => ({
  contains: { rows: [], total: 0 },
  usedBy: { rows: [], total: 0 },
  dependsOn: { rows: [], total: 0 },
  belongsTo: { rows: [], total: 0 },
}));
const reachSpy = vi.fn(() => ({ byDepth: {}, maxDepth: 3 }));
const codeLocationsSpy = vi.fn(() => [] as string[]);

vi.mock("@/widgets/full-detail-a1", () => ({
  buildFullDetailGroups: (...args: unknown[]) => groupsSpy(...(args as [])),
  buildFullDetailReachModel: (...args: unknown[]) => reachSpy(...(args as [])),
}));

vi.mock("@/entities/knowledge-graph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/entities/knowledge-graph")>();
  return {
    ...actual,
    deriveCodeLocations: (...args: unknown[]) => codeLocationsSpy(...(args as [])),
  };
});

const { useFullDetailA1Model } = await import("./use-full-detail-a1-model");

const stamp = new Date(0);

function node(id: string, extra: Partial<KnowledgeGraphNode> = {}): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind: "capability",
    projectIds: [],
    evidenceIds: [`${id}-doc`],
    lastApprovedAt: stamp,
    lastApprovedBy: "test",
    ...extra,
  };
}

const selected = node("capability:alpha");
const nodes: KnowledgeGraphNode[] = [selected, node("project:p", { kind: "project", title: "P" })];
const edges: KnowledgeGraphEdge[] = [];

const nodeFocus = {
  title: "alpha",
  displayTitle: "alpha",
  kind: "capability",
  sourceSlug: "capability-alpha",
  ownDocumentSlug: "capability-alpha",
  mentionedInSlug: null,
} as never;

// Stable references: the hook's memo contract holds only when input identity is
// stable, and HomePage's real inputs are all useMemo/useCallback derivations.
const insight = { nodes, edges };
const changedSlugs: ReadonlySet<string> = new Set<string>();
const onSaveExplanation = () => undefined;

function render(open: boolean) {
  return renderHook(() =>
    useFullDetailA1Model({
      open,
      nodeFocus,
      selectedOntologyNode: selected,
      insight,
      changedSlugs,
      nodeBody: null,
      nodeEditTarget: null,
      vaultLoaded: false,
      onSaveExplanation,
      datasheet: null,
    }),
  );
}

describe("useFullDetailA1Model: a closed surface does not traverse the graph", () => {
  beforeEach(() => {
    groupsSpy.mockClear();
    reachSpy.mockClear();
    codeLocationsSpy.mockClear();
  });

  it("open=false gives a null model and zero graph traversals", () => {
    const { result } = render(false);
    expect(result.current).toBeNull();
    expect(groupsSpy).toHaveBeenCalledTimes(0);
    expect(reachSpy).toHaveBeenCalledTimes(0);
    expect(codeLocationsSpy).toHaveBeenCalledTimes(0);
  });

  it("open=true assembles the model from the same input with one traversal each", () => {
    const { result } = render(true);
    expect(result.current).not.toBeNull();
    expect(result.current?.node.id).toBe("capability:alpha");
    expect(result.current?.breadcrumb.projectTitle).toBe("P");
    expect(groupsSpy).toHaveBeenCalledTimes(1);
    expect(reachSpy).toHaveBeenCalledTimes(1);
    expect(codeLocationsSpy).toHaveBeenCalledTimes(1);
  });

  it("rerendering the same selection adds no traversal (memo contract)", () => {
    const { result, rerender } = render(true);
    rerender();
    rerender();
    expect(result.current).not.toBeNull();
    expect(groupsSpy).toHaveBeenCalledTimes(1);
    expect(reachSpy).toHaveBeenCalledTimes(1);
    expect(codeLocationsSpy).toHaveBeenCalledTimes(1);
  });
});
