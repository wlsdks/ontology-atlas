import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGuidedTour } from "./use-guided-tour";
import { GUIDED_TOUR_STATUS_KEY } from "./tour-storage";
import type { TourAnchor } from "./tour-steps";

const TEST_KEY = "guided-tour:v1:test";

afterEach(() => {
  window.localStorage.removeItem(TEST_KEY);
  window.localStorage.removeItem(GUIDED_TOUR_STATUS_KEY);
});

function setup(hasSelection = false) {
  return renderHook(
    ({ hasSelection: sel }: { hasSelection: boolean }) =>
      useGuidedTour({
        hasSelection: sel,
        canResolveAnchor: () => true,
        storageKey: TEST_KEY,
      }),
    { initialProps: { hasSelection } },
  );
}

describe("useGuidedTour", () => {
  it("starts closed, and start() opens on the welcome step", () => {
    const { result } = setup();
    expect(result.current.open).toBe(false);

    act(() => result.current.start());
    expect(result.current.open).toBe(true);
    expect(result.current.step?.id).toBe("welcome");
    expect(result.current.stepIndex).toBe(0);
  });

  it("advance() moves forward through the linear steps", () => {
    const { result } = setup();
    act(() => result.current.start());
    act(() => result.current.advance());
    expect(result.current.step?.id).toBe("nodes");
    act(() => result.current.advance());
    expect(result.current.step?.id).toBe("relations");
  });

  it("back() moves backward and is a no-op at the first step", () => {
    const { result } = setup();
    act(() => result.current.start());
    act(() => result.current.advance());
    expect(result.current.step?.id).toBe("nodes");
    act(() => result.current.back());
    expect(result.current.step?.id).toBe("welcome");
    act(() => result.current.back());
    expect(result.current.step?.id).toBe("welcome");
  });

  it("skip() ends the tour and records 'skipped'", () => {
    const { result } = setup();
    act(() => result.current.start());
    act(() => result.current.skip());
    expect(result.current.open).toBe(false);
    expect(window.localStorage.getItem(TEST_KEY)).toBe("skipped");
  });

  // While anchor resolvability fluctuates, the denominator stays the persona's fixed journey,
  // so "5/5" is never followed by "5/6".
  it("keeps the display denominator (personaSteps) fixed while anchor resolvability fluctuates", () => {
    let resolvable = true;
    const { result, rerender } = renderHook(
      ({ hasSelection: sel }: { hasSelection: boolean }) =>
        useGuidedTour({
          hasSelection: sel,
          canResolveAnchor: () => resolvable,
          storageKey: TEST_KEY,
        }),
      { initialProps: { hasSelection: false } },
    );
    act(() => result.current.start());
    expect(result.current.personaSteps).toHaveLength(7);
    expect(result.current.personaStepIndex).toBe(0);

    resolvable = false;
    rerender({ hasSelection: true });
    expect(result.current.visibleSteps.length).toBeLessThan(7);
    expect(result.current.personaSteps).toHaveLength(7);

    // Only the dev branch makes it 8.
    resolvable = true;
    rerender({ hasSelection: true });
    act(() => result.current.chooseDevBranch());
    expect(result.current.personaSteps).toHaveLength(8);
    expect(result.current.step?.id).toBe("agent");
    expect(result.current.personaStepIndex).toBe(7);
  });

  // On the datasheet step the open panel hides later anchors, but `advance()` closes it and
  // moves on, so [done] must not come from the `visibleSteps` length.
  it("does not treat the datasheet step as final even at the end of the list", () => {
    // Only the datasheet anchor resolves; later anchors are hidden.
    const canResolveAnchor = (anchor: TourAnchor) =>
      anchor === null ||
      anchor.type === "canvas-node" ||
      anchor.value === "map-detail-panel";
    const { result } = renderHook(() =>
      useGuidedTour({
        hasSelection: true,
        canResolveAnchor,
        storageKey: TEST_KEY,
        onLeaveDatasheet: () => {},
      }),
    );
    act(() => result.current.start());
    act(() => result.current.advance()); // welcome -> nodes
    act(() => result.current.advance()); // nodes -> relations
    act(() => result.current.advance()); // relations -> try-click
    act(() => result.current.advance()); // try-click -> datasheet
    expect(result.current.step?.id).toBe("datasheet");
    expect(result.current.stepIndex).toBe(result.current.visibleSteps.length - 1);
    expect(result.current.isFinalStep).toBe(false);
  });

  it("sets isFinalStep only on the real final step", () => {
    const { result } = setup();
    act(() => result.current.start());
    expect(result.current.isFinalStep).toBe(false);
    // The non-developer journey ends at recent; agent is dev-persona only.
    for (let i = 0; i < 8 && result.current.step?.id !== "recent"; i += 1) {
      act(() => result.current.advance());
    }
    expect(result.current.step?.id).toBe("recent");
    expect(result.current.isFinalStep).toBe(true);
  });

  it("datasheet only appears in visibleSteps once a selection exists", () => {
    const { result, rerender } = setup(false);
    act(() => result.current.start());
    expect(result.current.visibleSteps.map((s) => s.id)).not.toContain("datasheet");

    rerender({ hasSelection: true });
    expect(result.current.visibleSteps.map((s) => s.id)).toContain("datasheet");
  });

  it("normalizes an unavailable step before paint and does not resurrect it when its anchor returns", () => {
    const steps = [
      { id: "first", anchor: null, persona: "all", copyKey: "first" },
      { id: "second", anchor: { type: "testid", value: "second" }, persona: "all", copyKey: "second" },
    ] as const;
    const { result, rerender } = renderHook(
      ({ hidden }: { hidden: boolean }) =>
        useGuidedTour({
          steps,
          hasSelection: hidden,
          canResolveAnchor: (anchor) => anchor === null || !hidden,
          storageKey: TEST_KEY,
        }),
      { initialProps: { hidden: false } },
    );
    act(() => result.current.start());
    act(() => result.current.advance());
    expect(result.current.step?.id).toBe("second");

    rerender({ hidden: true });
    expect(result.current.step?.id).toBe("first");
    expect(result.current.stepIndex).toBe(0);

    rerender({ hidden: false });
    expect(result.current.step?.id).toBe("first");
  });

  it("auto-advances off try-click the moment a selection appears (false→true transition)", async () => {
    const { result, rerender } = setup(false);
    act(() => result.current.start());
    act(() => result.current.advance()); // welcome -> nodes
    act(() => result.current.advance()); // nodes -> relations
    act(() => result.current.advance()); // relations -> try-click
    expect(result.current.step?.id).toBe("try-click");

    rerender({ hasSelection: true });
    await waitFor(() => {
      expect(result.current.step?.id).toBe("datasheet");
    });
  });

  it("still reaches the datasheet step when its DOM anchor only resolves after the commit that flips hasSelection (commit-race regression)", async () => {
    // React renders the `hasSelection` flip before committing the datasheet panel, so an
    // auto-advance using that render's memo would skip "datasheet". The flag models the gap.
    let panelMounted = false;
    const canResolveAnchor = (anchor: TourAnchor) => {
      if (anchor && anchor.type === "testid" && anchor.value === "map-detail-panel") {
        return panelMounted;
      }
      return true;
    };
    const { result, rerender } = renderHook(
      ({ hasSelection }: { hasSelection: boolean }) =>
        useGuidedTour({ hasSelection, canResolveAnchor, storageKey: TEST_KEY }),
      { initialProps: { hasSelection: false } },
    );
    act(() => result.current.start());
    act(() => result.current.advance()); // welcome -> nodes
    act(() => result.current.advance()); // nodes -> relations
    act(() => result.current.advance()); // relations -> try-click
    expect(result.current.step?.id).toBe("try-click");

    // The flip renders with the panel not yet resolvable; the commit lands right after.
    rerender({ hasSelection: true });
    panelMounted = true;

    await waitFor(() => {
      expect(result.current.step?.id).toBe("datasheet");
    });
  });

  it("does not auto-advance when a selection already existed before opening the tour", () => {
    const { result } = setup(true);
    act(() => result.current.start());
    act(() => result.current.advance()); // welcome -> nodes
    act(() => result.current.advance()); // nodes -> relations
    act(() => result.current.advance()); // relations -> try-click
    expect(result.current.step?.id).toBe("try-click");
    // hasSelection stayed true throughout, so no auto-advance.
    expect(result.current.step?.id).toBe("try-click");
  });

  it("calls onLeaveDatasheet exactly once when advancing past the datasheet step, not on other transitions", async () => {
    // A selection left open past the datasheet collapses the utility lane that later steps
    // anchor on; `onLeaveDatasheet` asks the host to release it at the right moment.
    const onLeaveDatasheet = vi.fn();
    const { result, rerender } = renderHook(
      ({ hasSelection }: { hasSelection: boolean }) =>
        useGuidedTour({
          hasSelection,
          canResolveAnchor: () => true,
          storageKey: TEST_KEY,
          onLeaveDatasheet,
        }),
      { initialProps: { hasSelection: false } },
    );
    act(() => result.current.start());
    act(() => result.current.advance()); // welcome -> nodes
    act(() => result.current.advance()); // nodes -> relations
    act(() => result.current.advance()); // relations -> try-click
    expect(onLeaveDatasheet).not.toHaveBeenCalled();

    rerender({ hasSelection: true }); // Simulates the click; auto-advances to datasheet.
    await waitFor(() => {
      expect(result.current.step?.id).toBe("datasheet");
    });
    expect(onLeaveDatasheet).not.toHaveBeenCalled();

    act(() => result.current.advance()); // Asks the host to release the selection.
    expect(onLeaveDatasheet).toHaveBeenCalledTimes(1);
    // Still on datasheet until `hasSelection` settles false through the prop.
    expect(result.current.step?.id).toBe("datasheet");

    // The host clears the selection, which flows back as `hasSelection: false`.
    rerender({ hasSelection: false });
    await waitFor(() => {
      expect(result.current.step?.id).toBe("index");
    });
    expect(onLeaveDatasheet).toHaveBeenCalledTimes(1);

    act(() => result.current.advance()); // index -> recent
    expect(onLeaveDatasheet).toHaveBeenCalledTimes(1);
  });

  it("chooseDevBranch() jumps to the 'agent' step and includes it in persona:'dev'", () => {
    const { result } = setup(true);
    act(() => result.current.start());
    act(() => result.current.chooseDevBranch());
    expect(result.current.persona).toBe("dev");
    expect(result.current.step?.id).toBe("agent");
    expect(result.current.visibleSteps.map((s) => s.id)).toContain("agent");
  });

  it("reports devBranchAvailable=false and finishes as 'done' (not a welcome reset) when the agent anchor can't resolve", () => {
  // "I'm a developer" after a dismissed first-run card must not jump to an unresolvable step and
  // reset to welcome.
    const { result } = renderHook(() =>
      useGuidedTour({
        hasSelection: true,
        canResolveAnchor: (anchor: TourAnchor) =>
          !(anchor?.type === "testid" && anchor.value === "first-run-starter"),
        storageKey: TEST_KEY,
      }),
    );
    act(() => result.current.start());
    expect(result.current.devBranchAvailable).toBe(false);

    act(() => result.current.chooseDevBranch());
    expect(result.current.open).toBe(false);
    expect(window.localStorage.getItem(TEST_KEY)).toBe("done");
  });

  it("finishAsDone() closes the tour and records 'done'", () => {
    const { result } = setup(true);
    act(() => result.current.start());
    act(() => result.current.chooseDevBranch());
    act(() => result.current.finishAsDone());
    expect(result.current.open).toBe(false);
    expect(window.localStorage.getItem(TEST_KEY)).toBe("done");
  });

  it("advancing past the last visible step finishes the tour as 'done'", () => {
    const { result } = setup(true);
    act(() => result.current.start());
    // Walk to the last linear step (recent): welcome, nodes, relations, try-click, datasheet,
    // index, recent.
    for (let i = 0; i < 6; i += 1) {
      act(() => result.current.advance());
    }
    expect(result.current.step?.id).toBe("recent");
    act(() => result.current.advance());
    expect(result.current.open).toBe(false);
    expect(window.localStorage.getItem(TEST_KEY)).toBe("done");
  });
});

/** Destination guides swap only the step array into the same state machine. */
describe("useGuidedTour with injected steps", () => {
  const DEST_KEY = "guided-tour:docs:v1:test";
  const steps = [
    { id: "a", anchor: null, persona: "all", copyKey: "a" },
    { id: "b", anchor: null, persona: "all", copyKey: "b" },
  ] as const;

  afterEach(() => window.localStorage.removeItem(DEST_KEY));

  function setupDestination() {
    return renderHook(() =>
      useGuidedTour({
        steps,
        hasSelection: false,
        canResolveAnchor: () => true,
        storageKey: DEST_KEY,
      }),
    );
  }

  it("walks the injected steps instead of the map journey", () => {
    const { result } = setupDestination();
    act(() => result.current.start());
    expect(result.current.step?.id).toBe("a");
    expect(result.current.personaSteps).toHaveLength(2);
    act(() => result.current.advance());
    expect(result.current.step?.id).toBe("b");
  });

  it("records seen only for that destination key after the last step", () => {
    const { result } = setupDestination();
    act(() => result.current.start());
    act(() => result.current.advance());
    act(() => result.current.advance());
    expect(result.current.open).toBe(false);
    expect(window.localStorage.getItem(DEST_KEY)).toBe("done");
    expect(window.localStorage.getItem(GUIDED_TOUR_STATUS_KEY)).toBeNull();
  });
});
