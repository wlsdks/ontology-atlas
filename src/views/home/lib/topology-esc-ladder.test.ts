import { describe, expect, it } from "vitest";
import {
  resolveTopologyEscLadderAction,
  type TopologyEscLadderInput,
} from "./topology-esc-ladder";

const BASE: TopologyEscLadderInput = {
  createNodeOpen: false,
  fullDetailOpen: false,
  selectedRelationActive: false,
  hasSelection: false,
  hasLocalGraphRoot: false,
};

describe("resolveTopologyEscLadderAction", () => {
  it("returns none when nothing is open", () => {
    expect(resolveTopologyEscLadderAction(BASE)).toBe("none");
  });

  it("closes the create-node composer first, above every other tier", () => {
    expect(
      resolveTopologyEscLadderAction({
        ...BASE,
        createNodeOpen: true,
        fullDetailOpen: true,
        selectedRelationActive: true,
        hasSelection: true,
        hasLocalGraphRoot: true,
      }),
    ).toBe("close-create-node");
  });

  it("closes the full-detail drawer before the relation lens or deselecting", () => {
    expect(
      resolveTopologyEscLadderAction({
        ...BASE,
        fullDetailOpen: true,
        selectedRelationActive: true,
        hasSelection: true,
        hasLocalGraphRoot: true,
      }),
    ).toBe("close-full-detail");
  });

  it("closes the relation lens before deselecting", () => {
    expect(
      resolveTopologyEscLadderAction({
        ...BASE,
        selectedRelationActive: true,
        hasSelection: true,
        hasLocalGraphRoot: true,
      }),
    ).toBe("close-relation-lens");
  });

  it("deselects the node before popping the local-graph breadcrumb", () => {
    expect(
      resolveTopologyEscLadderAction({
        ...BASE,
        hasSelection: true,
        hasLocalGraphRoot: true,
      }),
    ).toBe("deselect");
  });

  it("pops one level of the local-graph breadcrumb when nothing else is open", () => {
    expect(
      resolveTopologyEscLadderAction({
        ...BASE,
        hasLocalGraphRoot: true,
      }),
    ).toBe("pop-local-graph");
  });

  it("resolves one step at a time — closing a tier reveals the next on a later call", () => {
    // Step 1: full detail is open on top of a selection — closes full detail only.
    const step1 = resolveTopologyEscLadderAction({
      ...BASE,
      fullDetailOpen: true,
      hasSelection: true,
    });
    expect(step1).toBe("close-full-detail");

    // Step 2: full detail is now closed — the same selection deselects next.
    const step2 = resolveTopologyEscLadderAction({
      ...BASE,
      hasSelection: true,
    });
    expect(step2).toBe("deselect");

    // Step 3: nothing selected anymore — local graph pops next.
    const step3 = resolveTopologyEscLadderAction({
      ...BASE,
      hasLocalGraphRoot: true,
    });
    expect(step3).toBe("pop-local-graph");
  });
});
