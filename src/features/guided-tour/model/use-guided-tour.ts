import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  computeVisibleSteps,
  TOUR_STEPS,
  type TourAnchor,
  type TourPersona,
  type TourStep,
} from "./tour-steps";
import {
  GUIDED_TOUR_STATUS_KEY,
  writeGuidedTourStatus,
  type GuidedTourStatus,
} from "./tour-storage";

export interface UseGuidedTourArgs {
  /**
   * The steps this tour walks. Defaults to the map's eight-step journey
   * (`TOUR_STEPS`); destination guides (docs, workshop, insights, projects,
   * history) pass `DESTINATION_TOURS[id]` to reuse **the same state machine** —
   * there is only one guidance system. The map-only branches below (leaving
   * `datasheet`, `try-click` auto-advance, the `agent` developer branch) all key
   * off step ids, so other arrays pass through them silently.
   */
  steps?: readonly TourStep[];
  /** Is a node currently selected on the map (`canvasSelectedSlug != null`)? */
  hasSelection: boolean;
  /** Can the testid/canvas-node anchor be resolved right now — HomePage decides
   *  from DOM and graph state and passes it down (a feature does not know widgets). */
  canResolveAnchor: (anchor: TourAnchor) => boolean;
  /** Injected localStorage key (for tests). Defaults to `guided-tour:v1`. */
  storageKey?: string;
  /**
   * Called once when leaving step 5 (datasheet) — whether advancing to step 6 or
   * ending the tour with [skip], i.e. "the moment that card is no longer needed".
   * HomePage passes node deselection (`handleClose`).
   *
   * Measured regression: with the selection still in place, the map stays in
   * "node focus" mode and folds the utility lane (including the spotlight
   * toggle), making step 7's (recent) anchor permanently unresolvable and step 8
   * (the dev branch) unreachable. Omitted, the selection is left alone
   * (zero regression — previous behaviour).
   */
  onLeaveDatasheet?: () => void;
}

export interface UseGuidedTourResult {
  open: boolean;
  persona: TourPersona;
  step: TourStep | null;
  stepIndex: number;
  visibleSteps: readonly TourStep[];
  /**
   * For progress display only — the full journey with the persona filter applied.
   * `visibleSteps` fluctuates in length with momentary anchor resolvability
   * (a selection folds the utility lane → the recent step vanishes → "5/5" is
   * followed by "5/6"), which broke trust in the progress indicator. The
   * denominator and the progress dots use this fixed journey (7 for
   * non-developers, 8 on the dev branch) while navigation (the skip rules)
   * continues to use `visibleSteps` — a skipped step simply looks like a dot
   * passed over.
   */
  personaSteps: readonly TourStep[];
  /** The current step's position within `personaSteps` (for the dots and N-of-M). */
  personaStepIndex: number;
  /** Mirrors the map's selection state — the card uses it to pick step 4's
   *  (try-click) waiting or success copy (`GuidedTourCard`). */
  hasSelection: boolean;
  start: () => void;
  advance: () => void;
  back: () => void;
  /** The card's [skip] — ends the whole tour as 'skipped'. */
  skip: () => void;
  /** Step 7's "done looking — to the map" — ends the tour as 'done'. */
  finishAsDone: () => void;
  /** Step 7's "I'm a developer →" — enters step 8, the dev branch. */
  chooseDevBranch: () => void;
  /**
   * Can step 8's (agent) anchor be resolved right now? When false the card hides
   * the dev-branch button entirely (measured correction 2026-07-23: for a user
   * who had already dismissed the first-run card, "I'm a developer →" jumped to
   * an unresolvable stepId and silently reset to welcome, forming a loop).
   */
  devBranchAvailable: boolean;
  /**
   * Would pressing [next] now end the tour — the single basis on which the card
   * chooses the [next] / [done] label. **It must not be decided by whether this
   * is the end of `visibleSteps`**: that list is a fluctuating projection of
   * "steps whose anchor resolves at this instant", and on the datasheet step the
   * open detail panel hides the INDEX and spotlight anchors behind it, cutting
   * the list off there. But `advance()` does not end at that step — it closes the
   * panel, re-reads the DOM, and moves on. Deciding by length drew [done] at 5/7,
   * and pressing it ended the tour early (measured in e2e, 2026-07-26). So the
   * verdict uses the same condition as `advance()`.
   */
  isFinalStep: boolean;
}

/**
 * The guided tour state machine: linear advance, back, skip, auto-advance when a
 * selection occurs on step 4 (try-click), and the 7→8 developer branch.
 * `visibleSteps` is the array after the skip rules, so the progress denominator
 * (N/M) is `visibleSteps.length`.
 */
export function useGuidedTour(args: UseGuidedTourArgs): UseGuidedTourResult {
  const {
    steps = TOUR_STEPS,
    hasSelection,
    canResolveAnchor,
    storageKey = GUIDED_TOUR_STATUS_KEY,
    onLeaveDatasheet,
  } = args;

  const [open, setOpen] = useState(false);
  const [persona, setPersona] = useState<TourPersona>("all");
  const [stepId, setStepId] = useState<string>(steps[0]?.id ?? "");
  // DOM resolution of a testid anchor can change with resize and layout, so a
  // separate tick forces recomputation (persona/hasSelection changes alone are
  // not enough).
  const [resolveTick, setResolveTick] = useState(0);

  useEffect(() => {
    if (!open) return undefined;
    const bump = () => setResolveTick((t) => t + 1);
    window.addEventListener("resize", bump);
    return () => window.removeEventListener("resize", bump);
  }, [open]);

  // When the selection changes (a node click or deselect, `onLeaveDatasheet`
  // included), surrounding chrome — the utility lane's spotlight toggle, say —
  // appears or disappears on the next commit. `visibleSteps` already lists
  // `hasSelection` as a dep and recomputes in that render, but at that point this
  // commit has not reached the DOM yet (the same race as the step-4 auto-advance
  // note below), so it may read stale state. Re-resolve once more on the frame
  // after commit and paint to settle it.
  useEffect(() => {
    if (!open) return undefined;
    const raf = window.requestAnimationFrame(() => setResolveTick((t) => t + 1));
    return () => window.cancelAnimationFrame(raf);
  }, [hasSelection, open]);

  const visibleSteps = useMemo(
    () =>
      computeVisibleSteps(steps, {
        persona,
        hasSelection,
        canResolveAnchor,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveTick only triggers DOM re-resolution; its value is never read
    [steps, persona, hasSelection, canResolveAnchor, resolveTick],
  );

  const stepIndex = visibleSteps.findIndex((s) => s.id === stepId);
  const step = stepIndex >= 0 ? visibleSteps[stepIndex] : (visibleSteps[0] ?? null);

  // The fixed journey used for progress display — see the interface comment above.
  const personaSteps = useMemo(
    () => steps.filter((s) => s.persona === "all" || s.persona === persona),
    [steps, persona],
  );
  const personaStepIndex = step ? personaSteps.findIndex((s) => s.id === step.id) : -1;

  // A datasheet exit is pending: after `onLeaveDatasheet` clears the selection,
  // the decision about the next step waits until `hasSelection` actually settles
  // to false (a separate effect below). This ref also guards against the
  // "skip correction" effect below cutting in first and resetting stepId to
  // "welcome" (a measured regression — the two effects reacted to the same
  // `hasSelection` transition and wrote different stepIds).
  const pendingLeaveDatasheetRef = useRef(false);

  // If the current step falls out of the list under the skip rules (step 5
  // excluded because the selection failed, say), correct to the first remaining
  // step. While a datasheet exit is pending, yield to its dedicated effect.
  useEffect(() => {
    if (!open) return;
    if (pendingLeaveDatasheetRef.current) return;
    if (stepIndex < 0 && visibleSteps.length > 0 && visibleSteps[0].id !== stepId) {
      setStepId(visibleSteps[0].id);
    }
  }, [open, stepIndex, visibleSteps, stepId]);

  // Focus restoration (2026-07-23) — the card takes focus on every step
  // (`GuidedTourCard`), so on close it is returned to whatever opened the tour
  // (the compass tile in the right rail). The capture happens synchronously
  // inside `start()`: capturing in an effect lets the child card's focus effect
  // run first and capture the card itself.
  const restoreFocusElRef = useRef<HTMLElement | null>(null);

  const finish = useCallback(
    (status: GuidedTourStatus) => {
      writeGuidedTourStatus(status, storageKey);
      setOpen(false);
      const el = restoreFocusElRef.current;
      restoreFocusElRef.current = null;
      if (el && el.isConnected) el.focus({ preventScroll: true });
    },
    [storageKey],
  );

  const start = useCallback(() => {
    restoreFocusElRef.current =
      typeof document !== "undefined" && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setPersona("all");
    setStepId(steps[0]?.id ?? "");
    setResolveTick((t) => t + 1);
    setOpen(true);
  }, [steps]);

  // The same expression as `advance()`'s end condition — for the reason in the
  // interface comment, the two diverging makes the label lie.
  const leavesDatasheetOnAdvance = Boolean(
    step?.id === "datasheet" && onLeaveDatasheet && hasSelection,
  );
  const isFinalStep =
    stepIndex >= 0 && !leavesDatasheetOnAdvance && visibleSteps[stepIndex + 1] === undefined;

  const advance = useCallback(() => {
    if (stepIndex < 0) return;
    if (step?.id === "datasheet" && onLeaveDatasheet && hasSelection) {
      pendingLeaveDatasheetRef.current = true;
      onLeaveDatasheet();
      return;
    }
    const next = visibleSteps[stepIndex + 1];
    if (!next) {
      finish("done");
      return;
    }
    setStepId(next.id);
  }, [stepIndex, visibleSteps, step, onLeaveDatasheet, hasSelection, finish]);

  // Completes the datasheet exit: once `hasSelection` settles to false (the
  // deselection the callback requested has actually committed), re-read the DOM
  // at that moment and choose the next step. The same commit-race pattern as the
  // try-click auto-advance.
  useEffect(() => {
    if (!pendingLeaveDatasheetRef.current) return undefined;
    if (!open || hasSelection) return undefined;
    pendingLeaveDatasheetRef.current = false;
    let cancelled = false;
    window.queueMicrotask(() => {
      if (cancelled) return;
      const fresh = computeVisibleSteps(steps, {
        persona,
        hasSelection: false,
        canResolveAnchor,
      });
      const tryClickIdx = fresh.findIndex((s) => s.id === "try-click");
      const next = tryClickIdx >= 0 ? fresh[tryClickIdx + 1] : fresh[0];
      setResolveTick((t) => t + 1);
      if (next) {
        setStepId(next.id);
      } else {
        finish("done");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [steps, hasSelection, open, persona, canResolveAnchor, finish]);

  const back = useCallback(() => {
    if (stepIndex <= 0) return;
    const prev = visibleSteps[stepIndex - 1];
    if (prev) setStepId(prev.id);
  }, [stepIndex, visibleSteps]);

  const skip = useCallback(() => {
    finish("skipped");
  }, [finish]);

  const finishAsDone = useCallback(() => {
    finish("done");
  }, [finish]);

  // Whether step 8's (agent) anchor resolves — shares the re-resolution trigger
  // (`resolveTick`) with `visibleSteps` so it follows DOM changes such as the
  // first-run card being dismissed.
  const devBranchAvailable = useMemo(() => {
    const agentStep = steps.find((s) => s.id === "agent");
    if (!agentStep) return false;
    return agentStep.anchor === null ? true : canResolveAnchor(agentStep.anchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveTick only triggers DOM re-resolution; its value is never read
  }, [steps, canResolveAnchor, resolveTick]);

  const chooseDevBranch = useCallback(() => {
  // A backstop — even a stale click from before the button was hidden converges
  // on a normal finish (identical to "done looking") rather than the welcome
  // reset loop.
    const agentStep = steps.find((s) => s.id === "agent");
    const resolvable =
      agentStep !== undefined &&
      (agentStep.anchor === null || canResolveAnchor(agentStep.anchor));
    if (!resolvable) {
      finish("done");
      return;
    }
    setPersona("dev");
    setStepId("agent");
  }, [steps, canResolveAnchor, finish]);

  // Step 4 (try-click) auto-advance — waits for a real node click (the
  // hasSelection false→true transition) before moving on. The `queueMicrotask`
  // defer follows the same synchronous-setState-cascade avoidance as
  // `use-sample-node-hint.ts`.
  //
  // Two commit races to beware of. ① The `advance()` captured in the closure
  // (i.e. this render's `visibleSteps`) must not be called directly: in the very
  // render where `hasSelection` flips to true, the `visibleSteps` useMemo
  // recomputes before this commit reaches the DOM (React goes render → commit →
  // paint → effect), so step 5's anchor (`topology-v2-detail-panel`) does not
  // exist yet, `canResolveAnchor` returns false, and datasheet is skipped
  // entirely (measured regression — clicking on step 4 jumped straight to step 7).
  // Effects run after commit, so this microtask calls `computeVisibleSteps`
  // **fresh** to re-read the DOM and choose the next step.
  // ② Calling only `setStepId` with that fresh result hits another trap — this
  // hook's own `visibleSteps` useMemo reuses the cache it just computed (without
  // datasheet) unless `[persona, hasSelection, …, resolveTick]` changes, so the
  // next render cannot find `stepId="datasheet"` in that cache, falls to -1, and
  // the "correct to the first step" effect resets to welcome. So `resolveTick` is
  // raised in the same microtask to invalidate the memo cache — `setStepId` and
  // `setResolveTick` are batched and land in one render.
  const prevHasSelectionRef = useRef(hasSelection);
  useEffect(() => {
    const prev = prevHasSelectionRef.current;
    prevHasSelectionRef.current = hasSelection;
    if (!open) return undefined;
    if (step?.id !== "try-click") return undefined;
    if (prev || !hasSelection) return undefined;
    let cancelled = false;
    window.queueMicrotask(() => {
      if (cancelled) return;
      const fresh = computeVisibleSteps(steps, {
        persona,
        hasSelection: true,
        canResolveAnchor,
      });
      const idx = fresh.findIndex((s) => s.id === "try-click");
      const next = idx >= 0 ? fresh[idx + 1] : undefined;
      setResolveTick((t) => t + 1);
      if (next) {
        setStepId(next.id);
      } else {
        finish("done");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [steps, hasSelection, open, step, persona, canResolveAnchor, finish]);

  // Reopening the tour re-baselines against the current selection state, so
  // opening with a node already selected is not mistaken for "just clicked" and
  // does not skip step 4.
  useEffect(() => {
    if (open) prevHasSelectionRef.current = hasSelection;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- captures only the `open` transition
  }, [open]);

  return {
    open,
    persona,
    step,
    stepIndex,
    visibleSteps,
    personaSteps,
    personaStepIndex,
    hasSelection,
    start,
    advance,
    back,
    skip,
    finishAsDone,
    chooseDevBranch,
    devBranchAvailable,
    isFinalStep,
  };
}
