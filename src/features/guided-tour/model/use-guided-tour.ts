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
   * Defaults to the map journey (`TOUR_STEPS`); destination guides pass `DESTINATION_TOURS[id]`
   * to reuse this state machine. The map-only branches key off step ids, so other arrays pass
   * through them.
   */
  steps?: readonly TourStep[];
  /** `canvasSelectedSlug != null`. */
  hasSelection: boolean;
  /** HomePage decides from DOM and graph state, since a feature does not know widgets. */
  canResolveAnchor: (anchor: TourAnchor) => boolean;
  /** Injected for tests; defaults to `guided-tour:v1`. */
  storageKey?: string;
  /**
   * Called once when leaving step 5 (datasheet) by advancing or skipping; HomePage deselects the
   * node. A kept selection folds the utility lane and makes steps 7 and 8 unreachable.
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
   * The fixed persona journey for the progress denominator and dots (7, or 8 on the dev
   * branch); navigation still uses `visibleSteps`, whose length fluctuates with anchors.
   */
  personaSteps: readonly TourStep[];
  /** For the dots and N-of-M. */
  personaStepIndex: number;
  /** Lets the card pick step 4's waiting or success copy. */
  hasSelection: boolean;
  start: () => void;
  advance: () => void;
  back: () => void;
  /** Ends the tour as 'skipped'. */
  skip: () => void;
  /** Step 7's "done looking"; ends the tour as 'done'. */
  finishAsDone: () => void;
  /** Step 7's "I'm a developer"; enters step 8. */
  chooseDevBranch: () => void;
  /**
   * When false the card hides the dev-branch button, or it would jump to an unresolvable step
   * and reset to welcome.
   */
  devBranchAvailable: boolean;
  /**
   * Chooses the [next] or [done] label with the same condition as `advance()`, not the end of
   * `visibleSteps`: on the datasheet step the open panel hides later anchors, but `advance()`
   * closes it and moves on.
   */
  isFinalStep: boolean;
}

/**
 * The tour state machine: advance, back, skip, auto-advance on a selection at step 4
 * (try-click), and the 7→8 developer branch.
 */
/** Step ids are unique, so the one `agent` step decides. */
function agentStepResolvable(
  steps: readonly TourStep[],
  canResolveAnchor: (anchor: TourAnchor) => boolean,
): boolean {
  return steps.some((s) => s.id === "agent" && (s.anchor === null || canResolveAnchor(s.anchor)));
}

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
  // A testid anchor's resolution changes with resize and layout, so a tick forces
  // recomputation.
  const [resolveTick, setResolveTick] = useState(0);

  // A step change folds or restores the first-run card after anchors were resolved at render,
  // so one re-check on the next frame keeps the dev branch's anchor resolvable.
  useEffect(() => {
    if (!open) return undefined;
    const frame = window.requestAnimationFrame(() => setResolveTick((t) => t + 1));
    return () => window.cancelAnimationFrame(frame);
  }, [open, stepId]);

  useEffect(() => {
    if (!open) return undefined;
    const bump = () => setResolveTick((t) => t + 1);
    window.addEventListener("resize", bump);
    return () => window.removeEventListener("resize", bump);
  }, [open]);

  // A selection change shows or hides chrome on the next commit, which the `visibleSteps` memo
  // cannot see yet; re-resolve on the frame after commit and paint.
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

  // After `onLeaveDatasheet` clears the selection, the next step waits until `hasSelection`
  // settles false. State, because render reads this guard when normalizing a step.
  const [pendingLeaveDatasheet, setPendingLeaveDatasheet] = useState(false);
  const requestedStepIndex = visibleSteps.findIndex((s) => s.id === stepId);

  // An anchor may disappear between renders. Normalizing during render lets React retry before
  // paint, and keeping it in the state machine stops a reappearing anchor from resurrecting an
  // abandoned step.
  if (
    !pendingLeaveDatasheet &&
    requestedStepIndex < 0 &&
    visibleSteps.length > 0 &&
    visibleSteps[0].id !== stepId
  ) {
    setStepId(visibleSteps[0].id);
  }
  const stepIndex = requestedStepIndex >= 0 ? requestedStepIndex : visibleSteps.length > 0 ? 0 : -1;
  const step = stepIndex >= 0 ? visibleSteps[stepIndex] : null;

  // The fixed journey for progress display; see the interface comment.
  const personaSteps = useMemo(
    () => steps.filter((s) => s.persona === "all" || s.persona === persona),
    [steps, persona],
  );
  const personaStepIndex = step ? personaSteps.findIndex((s) => s.id === step.id) : -1;

  // The card takes focus on every step, so close returns it to the opener. Captured
  // synchronously in `start()`, because in an effect the card's focus effect runs first.
  const restoreFocusElRef = useRef<HTMLElement | null>(null);

  const finish = useCallback(
    (status: GuidedTourStatus) => {
      writeGuidedTourStatus(status, storageKey);
      setPendingLeaveDatasheet(false);
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
    setPendingLeaveDatasheet(false);
    setStepId(steps[0]?.id ?? "");
    setResolveTick((t) => t + 1);
    setOpen(true);
  }, [steps]);

  const leavesDatasheetOnAdvance = Boolean(
    step?.id === "datasheet" && onLeaveDatasheet && hasSelection,
  );
  const isFinalStep =
    stepIndex >= 0 && !leavesDatasheetOnAdvance && visibleSteps[stepIndex + 1] === undefined;

  const advance = useCallback(() => {
    if (stepIndex < 0) return;
    if (leavesDatasheetOnAdvance) {
      setPendingLeaveDatasheet(true);
      onLeaveDatasheet?.();
      return;
    }
    const next = visibleSteps[stepIndex + 1];
    if (!next) {
      finish("done");
      return;
    }
    setStepId(next.id);
  }, [stepIndex, visibleSteps, leavesDatasheetOnAdvance, onLeaveDatasheet, finish]);

  // Once `hasSelection` settles false, re-read the DOM and choose the next step; the same
  // commit race as the try-click auto-advance.
  useEffect(() => {
    if (!pendingLeaveDatasheet) return undefined;
    if (!open || hasSelection) return undefined;
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
      setPendingLeaveDatasheet(false);
      if (next) {
        setStepId(next.id);
      } else {
        finish("done");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [steps, hasSelection, open, pendingLeaveDatasheet, persona, canResolveAnchor, finish]);

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

  // Shares `resolveTick` with `visibleSteps` so it follows DOM changes such as a dismissed
  // first-run card.
  const devBranchAvailable = useMemo(() => {
    return agentStepResolvable(steps, canResolveAnchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveTick only triggers DOM re-resolution; its value is never read
  }, [steps, canResolveAnchor, resolveTick]);

  const chooseDevBranch = useCallback(() => {
    // A backstop: a stale click after the button hid finishes normally instead of looping.
    if (!agentStepResolvable(steps, canResolveAnchor)) {
      finish("done");
      return;
    }
    setPersona("dev");
    setStepId("agent");
  }, [steps, canResolveAnchor, finish]);

  // Step 4 (try-click) auto-advances on the hasSelection false→true transition, deferred to a
  // microtask to avoid a synchronous setState cascade. Two commit races:
  // 1. This render's `visibleSteps` predates the datasheet panel in the DOM, so the microtask
  //    calls `computeVisibleSteps` fresh, or datasheet is skipped.
  // 2. `resolveTick` is raised in the same microtask, or the memo cache without datasheet makes
  //    the next render reset to welcome; both setters batch into one render.
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

  // Reopening re-baselines against the current selection, so an existing selection is not
  // taken as a click that skips step 4.
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
