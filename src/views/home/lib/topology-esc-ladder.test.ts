import { describe, expect, it } from "vitest";
import {
  resolveTopologyEscLadderAction,
  type TopologyEscLadderInput,
} from "./topology-esc-ladder";

const BASE: TopologyEscLadderInput = {
  contextMenuOpen: false,
  tourOpen: false,
  createNodeOpen: false,
  bootstrapOpen: false,
  searchOpen: false,
  fullDetailOpen: false,
  selectedRelationActive: false,
  hasSelection: false,
  nodePopoverOpen: false,
  hasLocalGraphRoot: false,
};

describe("resolveTopologyEscLadderAction", () => {
  it("returns none when nothing is open", () => {
    expect(resolveTopologyEscLadderAction(BASE)).toBe("none");
  });

  it("S4: closes the realm first, above every other tier including the context menu", () => {
    expect(
      resolveTopologyEscLadderAction({
        ...BASE,
        realmActive: true,
        contextMenuOpen: true,
        createNodeOpen: true,
        fullDetailOpen: true,
        hasSelection: true,
        nodePopoverOpen: true,
      }),
    ).toBe("close-realm");
  });

  it("S4: when not in a realm the ladder is unchanged (no regression)", () => {
    expect(resolveTopologyEscLadderAction({ ...BASE, realmActive: false, hasSelection: true })).toBe("deselect");
  });

  it("R-1: closes the edge popover right after the realm, above the context menu and every other tier", () => {
    // The edge popover (role=dialog) must close on Escape, or focus falls to <body>.
    expect(
      resolveTopologyEscLadderAction({
        ...BASE,
        selectedEdgeActive: true,
        contextMenuOpen: true,
        createNodeOpen: true,
        fullDetailOpen: true,
        hasSelection: true,
        nodePopoverOpen: true,
      }),
    ).toBe("close-edge-popover");
  });

  it("R-1: the realm still wins over an open edge popover (realm is the top rung)", () => {
    expect(
      resolveTopologyEscLadderAction({ ...BASE, realmActive: true, selectedEdgeActive: true }),
    ).toBe("close-realm");
  });

  it("R-1: with no edge popover the ladder is unchanged (no regression)", () => {
    expect(
      resolveTopologyEscLadderAction({ ...BASE, selectedEdgeActive: false, contextMenuOpen: true }),
    ).toBe("close-context-menu");
  });

  it("closes the W2-B context menu first, above every other tier including the guided tour and create-node composer", () => {
    expect(
      resolveTopologyEscLadderAction({
        ...BASE,
        contextMenuOpen: true,
        tourOpen: true,
        createNodeOpen: true,
        fullDetailOpen: true,
        selectedRelationActive: true,
        hasSelection: true,
        hasLocalGraphRoot: true,
      }),
    ).toBe("close-context-menu");
  });

  it("closes the guided tour right after the context menu, above the create-node composer and everything below it", () => {
    expect(
      resolveTopologyEscLadderAction({
        ...BASE,
        tourOpen: true,
        createNodeOpen: true,
        fullDetailOpen: true,
        selectedRelationActive: true,
        hasSelection: true,
        hasLocalGraphRoot: true,
      }),
    ).toBe("close-tour");
  });

  it("the realm and edge popover still win over an open guided tour (they sit above the context menu too)", () => {
    expect(
      resolveTopologyEscLadderAction({ ...BASE, realmActive: true, tourOpen: true }),
    ).toBe("close-realm");
    expect(
      resolveTopologyEscLadderAction({ ...BASE, selectedEdgeActive: true, tourOpen: true }),
    ).toBe("close-edge-popover");
  });

  it("with the tour closed the ladder is unchanged (no regression)", () => {
    expect(
      resolveTopologyEscLadderAction({ ...BASE, tourOpen: false, createNodeOpen: true }),
    ).toBe("close-create-node");
  });

  it("closes the create-node composer above every other tier once the context menu and tour are closed", () => {
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

  it("returns none when the search/ontology palette is open, even with a selection and every other tier open — the palette's own Escape handler (Radix Dialog) owns this keypress, not the window ladder", () => {
    // Without this input the ladder also deselects on the keypress the palette handles, closing
    // two things.
    expect(
      resolveTopologyEscLadderAction({
        ...BASE,
        searchOpen: true,
        fullDetailOpen: true,
        selectedRelationActive: true,
        hasSelection: true,
        hasLocalGraphRoot: true,
      }),
    ).toBe("none");
  });

  it("the create-node composer still wins over an open search palette", () => {
    expect(
      resolveTopologyEscLadderAction({
        ...BASE,
        createNodeOpen: true,
        searchOpen: true,
      }),
    ).toBe("close-create-node");
  });

  it("a second Escape, after the palette has closed, deselects the surviving selection", () => {
    // Step 1: palette open + node selected — ladder does nothing, palette's
    // own handler closes it.
    const step1 = resolveTopologyEscLadderAction({
      ...BASE,
      searchOpen: true,
      hasSelection: true,
    });
    expect(step1).toBe("none");

    // Step 2: palette is now closed — the SAME selection survived step 1 and
    // deselects on this next keypress.
    const step2 = resolveTopologyEscLadderAction({
      ...BASE,
      searchOpen: false,
      hasSelection: true,
    });
    expect(step2).toBe("deselect");
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

  it("M-7: closes the node popover (keeping ego focus) before deselecting when the popover is open", () => {
    expect(
      resolveTopologyEscLadderAction({
        ...BASE,
        hasSelection: true,
        nodePopoverOpen: true,
        hasLocalGraphRoot: true,
      }),
    ).toBe("close-node-popover");
  });

  it("M-7: Escape#1 closes the popover, Escape#2 (popover now dismissed) deselects — two rungs, not one", () => {
    // Step 1: node clicked — popover + ego focus both up. First Escape closes
    // only the popover.
    const step1 = resolveTopologyEscLadderAction({
      ...BASE,
      hasSelection: true,
      nodePopoverOpen: true,
    });
    expect(step1).toBe("close-node-popover");

    // Step 2: popover dismissed (nodePopoverOpen now false) but the selection
    // (ego focus/dim) survived — the next Escape releases focus.
    const step2 = resolveTopologyEscLadderAction({
      ...BASE,
      hasSelection: true,
      nodePopoverOpen: false,
    });
    expect(step2).toBe("deselect");
  });

  it("M-7: a selection with no node popover (e.g. a project, or an already-dismissed popover) deselects in one press", () => {
    expect(
      resolveTopologyEscLadderAction({
        ...BASE,
        hasSelection: true,
        nodePopoverOpen: false,
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

/**
 * The bootstrap panel is a dialog too; the shortcut sheet promises Escape closes one surface at a
 * time.
 */
describe("bootstrap panel answers first as a blocking surface", () => {
  it("Escape closes it while open", () => {
    expect(
      resolveTopologyEscLadderAction({ ...BASE, bootstrapOpen: true }),
    ).toBe("close-bootstrap");
  });

  it("the panel wins even over a selection below", () => {
    expect(
      resolveTopologyEscLadderAction({
        ...BASE,
        bootstrapOpen: true,
        hasSelection: true,
        nodePopoverOpen: true,
      }),
    ).toBe("close-bootstrap");
  });

  it("lower rungs answer normally while it is closed", () => {
    expect(
      resolveTopologyEscLadderAction({ ...BASE, bootstrapOpen: false, hasSelection: true }),
    ).toBe("deselect");
  });
});
