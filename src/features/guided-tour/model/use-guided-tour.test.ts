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

  // Even while anchor resolvability fluctuates moment to moment (a selection folds the
  // utility lane and `recent` vanishes), the progress denominator must stay the
  // persona's fixed journey (7 for non-developers). Blocks the regression where "5/5"
  // is followed by "5/6".
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

    // Even if the testid anchors (recent, relations) all become momentarily
    // unresolvable — shrinking visibleSteps — the displayed journey stays at 7.
    resolvable = false;
    rerender({ hasSelection: true });
    expect(result.current.visibleSteps.length).toBeLessThan(7);
    expect(result.current.personaSteps).toHaveLength(7);

    // Only on the dev branch does it become 8 — the user explicitly chose one more step.
    resolvable = true;
    rerender({ hasSelection: true });
    act(() => result.current.chooseDevBranch());
    expect(result.current.personaSteps).toHaveLength(8);
    expect(result.current.step?.id).toBe("agent");
    expect(result.current.personaStepIndex).toBe(7);
  });

  // Regression 2026-07-26 — deciding the card's [next]/[done] label from the
  // `visibleSteps` length lies on the datasheet step. There, the open detail panel
  // hides the anchors of later steps (INDEX, spotlight) and the list is cut off, but
  // `advance()` closes the panel, re-reads the DOM, and moves on. By length, [done]
  // was drawn at 5/7 and pressing it ended the tour early.
  it("datasheet 단계는 목록의 끝이어도 마지막 장이 아니다", () => {
    // Models the state where only the datasheet anchor resolves and later anchors are hidden.
    const canResolveAnchor = (anchor: TourAnchor) =>
      anchor === null ||
      anchor.type === "canvas-node" ||
      anchor.value === "topology-v2-detail-panel";
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

  it("진짜 마지막 장에서만 isFinalStep 이 참이다", () => {
    const { result } = setup();
    act(() => result.current.start());
    expect(result.current.isFinalStep).toBe(false);
    // The non-developer journey ends at recent — the next page (agent) is dev-persona only.
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
    // Regression: React finishes the render that flips `hasSelection` BEFORE
    // committing the new DOM (the datasheet panel mounts in that same
    // commit). The `visibleSteps` memo evaluated during that render still
    // sees the OLD DOM (no panel yet), so if the auto-advance effect used
    // that stale memo it would skip straight past "datasheet". Model the
    // pre-commit/post-commit gap explicitly with a resolver flag that only
    // flips true right after the `hasSelection` rerender.
    let panelMounted = false;
    const canResolveAnchor = (anchor: TourAnchor) => {
      if (anchor && anchor.type === "testid" && anchor.value === "topology-v2-detail-panel") {
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

    // The render that flips hasSelection happens with the panel NOT yet
    // resolvable (pre-commit) — then the "commit" lands right after.
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
    // hasSelection stayed true the whole time (no false->true transition) — no auto-advance.
    expect(result.current.step?.id).toBe("try-click");
  });

  it("calls onLeaveDatasheet exactly once when advancing past the datasheet step, not on other transitions", async () => {
    // Regression: leaving a real node selection open while the tour moved on
    // to "index"/"recent" made the map's node-focus mode collapse the
    // utility lane (including the spotlight toggle 7th step anchors), making
    // the "recent" step — and the dev-branch step behind it — permanently
    // unreachable. `onLeaveDatasheet` is the hook's way of asking the host
    // to release the selection at exactly the right moment.
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

    rerender({ hasSelection: true }); // simulates the click — auto-advances to datasheet
    await waitFor(() => {
      expect(result.current.step?.id).toBe("datasheet");
    });
    expect(onLeaveDatasheet).not.toHaveBeenCalled();

    act(() => result.current.advance()); // requests the host release the selection
    expect(onLeaveDatasheet).toHaveBeenCalledTimes(1);
    // Still on datasheet — the transition waits for `hasSelection` to
    // actually settle false (mirrors how HomePage's `handleClose` flows
    // back through a prop, not synchronously inside the callback).
    expect(result.current.step?.id).toBe("datasheet");

    // The host (HomePage, in production) reacts to onLeaveDatasheet by
    // clearing the selection, which flows back in as `hasSelection: false`.
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
  // Measured regression guard 2026-07-23 — for a user who had already dismissed the
  // first-run card (`first-run-starter`), "I'm a developer →" jumped to an
  // unresolvable stepId and silently reset to the first step (welcome), forming a loop.
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
    // walk to the very last linear step (recent) — 7 steps once selection exists
    // (welcome, nodes, relations, try-click, datasheet, index, recent)
    for (let i = 0; i < 6; i += 1) {
      act(() => result.current.advance());
    }
    expect(result.current.step?.id).toBe("recent");
    act(() => result.current.advance());
    expect(result.current.open).toBe(false);
    expect(window.localStorage.getItem(TEST_KEY)).toBe("done");
  });
});

/**
 * Destination guides (docs, workshop, and so on) swap only the step array into **the
 * same state machine** — this test pins that no second guidance system was built.
 */
describe("useGuidedTour — 주입된 스텝 배열", () => {
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

  it("지도 여정 대신 주입된 배열을 밟는다", () => {
    const { result } = setupDestination();
    act(() => result.current.start());
    expect(result.current.step?.id).toBe("a");
    expect(result.current.personaSteps).toHaveLength(2);
    act(() => result.current.advance());
    expect(result.current.step?.id).toBe("b");
  });

  it("마지막 장에서 진행하면 그 목적지 키에만 '봤음'이 기록된다", () => {
    const { result } = setupDestination();
    act(() => result.current.start());
    act(() => result.current.advance());
    act(() => result.current.advance());
    expect(result.current.open).toBe(false);
    expect(window.localStorage.getItem(DEST_KEY)).toBe("done");
    expect(window.localStorage.getItem(GUIDED_TOUR_STATUS_KEY)).toBeNull();
  });
});
