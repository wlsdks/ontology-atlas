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
        startStepsOpen: false,
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

/**
 * Owner, 2026-08-25: *"I don't like where the AI-agent-connect guide sits when the left INDEX panel
 * opens — from the user's side it is not actually centred. While that popup is up, INDEX should not
 * be openable at all; just close it."*
 *
 * The checklist centres itself in the map area, and opening INDEX shrinks that area — so the surface
 * asking for the person's attention drifted off the middle of the window while still claiming it.
 */
describe('시작 안내가 떠 있으면 INDEX 는 자리를 비운다', () => {
  const base = {
    baseState: 'expanded' as const,
    meaningEditorOpen: false,
    selectionActive: false,
    selectionManualExpand: false,
    graphEmpty: false,
    emptyManualExpand: false,
    agentDockOpen: false,
  };

  it('안내가 떠 있으면 접힌다 — 화면 가운데를 되돌려 준다', () => {
    expect(resolveContextualIndexState({ ...base, startStepsOpen: true })).toBe('collapsed');
  });

  it('안내가 없으면 평소대로 펼쳐진다', () => {
    expect(resolveContextualIndexState({ ...base, startStepsOpen: false })).toBe('expanded');
  });
});
