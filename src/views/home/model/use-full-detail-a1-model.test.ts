import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { UseFullDetailA1ModelArgs } from "./use-full-detail-a1-model";

/**
 * Locks the traversal count, not milliseconds: "closed means zero" holds on every machine, and
 * removing the `open` gate fails it.
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

// Stable references, as HomePage's real inputs are memoised.
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

  it("updates reader state without rebuilding unchanged graph facts", () => {
    const initial: UseFullDetailA1ModelArgs = {
      open: true, nodeFocus, selectedOntologyNode: selected, insight, changedSlugs,
      nodeBody: null, nodeEditTarget: null, vaultLoaded: false, onSaveExplanation,
      datasheet: null,
    };
    const { result, rerender } = renderHook(useFullDetailA1Model, { initialProps: initial });
    const save = vi.fn();
    rerender({
      ...initial,
      nodeBody: { slug: "capability-alpha", raw: "Updated body", body: "Updated body" },
      nodeEditTarget: { vaultSlug: "capability-alpha" },
      vaultLoaded: true,
      onSaveExplanation: save,
    });
    expect(result.current?.bodyMarkdown).toBe("Updated body");
    expect(result.current?.explanationEdit?.onSave).toBe(save);
    expect(groupsSpy).toHaveBeenCalledTimes(1);
    expect(reachSpy).toHaveBeenCalledTimes(1);
    expect(codeLocationsSpy).toHaveBeenCalledTimes(1);

    rerender({ ...initial, changedSlugs: new Set([selected.id]) });
    expect(result.current?.node.fresh).toBe(true);
    expect(groupsSpy).toHaveBeenCalledTimes(2);
    expect(reachSpy).toHaveBeenCalledTimes(1);
    expect(codeLocationsSpy).toHaveBeenCalledTimes(1);

    const nextNodes = [...nodes, node("element:new")];
    rerender({ ...initial, insight: { nodes: nextNodes, edges } });
    expect(result.current?.breadcrumb.totalConcepts).toBe(3);
    expect(reachSpy).toHaveBeenCalledTimes(2);
    expect(codeLocationsSpy).toHaveBeenCalledTimes(2);

    rerender({ ...initial, open: false });
    expect(result.current).toBeNull();
    expect(reachSpy).toHaveBeenCalledTimes(2);
    expect(codeLocationsSpy).toHaveBeenCalledTimes(2);
  });
});
