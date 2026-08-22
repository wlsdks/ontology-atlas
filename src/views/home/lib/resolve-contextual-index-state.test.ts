import { describe, expect, it } from "vitest";
import { resolveContextualIndexState } from "./resolve-contextual-index-state";

const resting = {
  baseState: "expanded" as const,
  meaningEditorOpen: false,
  selectionActive: false,
  selectionManualExpand: false,
  graphEmpty: false,
  emptyManualExpand: false,
  agentDockOpen: false,
};

describe("resolveContextualIndexState", () => {
  it("temporarily collapses INDEX while the agent dock is open", () => {
    expect(
      resolveContextualIndexState({ ...resting, agentDockOpen: true }),
    ).toBe("collapsed");
  });

  it("restores the persisted expanded preference when the agent dock closes", () => {
    expect(resolveContextualIndexState(resting)).toBe("expanded");
  });

  it("never expands a persisted collapsed preference", () => {
    expect(
      resolveContextualIndexState({
        ...resting,
        baseState: "collapsed",
        agentDockOpen: false,
      }),
    ).toBe("collapsed");
  });

  it("preserves the existing selection, empty-graph, and editor demotions", () => {
    expect(
      resolveContextualIndexState({ ...resting, meaningEditorOpen: true }),
    ).toBe("collapsed");
    expect(
      resolveContextualIndexState({ ...resting, selectionActive: true }),
    ).toBe("collapsed");
    expect(
      resolveContextualIndexState({
        ...resting,
        selectionActive: true,
        selectionManualExpand: true,
      }),
    ).toBe("expanded");
    expect(
      resolveContextualIndexState({ ...resting, graphEmpty: true }),
    ).toBe("collapsed");
    expect(
      resolveContextualIndexState({
        ...resting,
        graphEmpty: true,
        emptyManualExpand: true,
      }),
    ).toBe("expanded");
  });
});
