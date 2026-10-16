import { describe, expect, it } from "vitest";
import { resolveContextualIndexState } from "./resolve-contextual-index-state";

const resting = {
  baseState: "expanded" as const,
  meaningEditorOpen: false,
  selectionActive: false,
  selectionManualExpand: false,
  selectionKeepsIndex: false,
  graphEmpty: false,
  emptyManualExpand: false,
  agentDockOpen: false,
  startStepsOpen: false,
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

  it("folds for a selection outside wide Flat, and keeps INDEX for a selection on wide Flat", () => {
    expect(resolveContextualIndexState({ ...resting, selectionActive: true })).toBe("collapsed");
    expect(
      resolveContextualIndexState({ ...resting, selectionActive: true, selectionManualExpand: true }),
    ).toBe("expanded");
    expect(
      resolveContextualIndexState({ ...resting, selectionActive: true, selectionKeepsIndex: true }),
    ).toBe("expanded");
  });

  it("keeps the empty-graph and editor demotions", () => {
    expect(
      resolveContextualIndexState({ ...resting, meaningEditorOpen: true }),
    ).toBe("collapsed");
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
