import { useRef, useState } from "react";
import type { Pulse } from "../../render/edge-fireflies";

/** Own frame activity clocks, idle diagnostics, and motion preference. */
export function useTopologyActivityState() {

  /**
   * Names of the flags that last kept a frame awake, so idle-gate regressions are diagnosable from
   * outside the canvas. Recorded only with the `?e2e=1` window attached (`idleDebugEnabledRef`).
   */
  const lastActiveCausesRef = useRef<{ t: number; causes: string[]; } | null>(null);

  const idleDebugEnabledRef = useRef(false);

  const lastFrameTimeRef = useRef(0);

  /** When the navigation yield ends — see the `navigation-intent` subscription effect's doc-block. */
  const navYieldUntilRef = useRef(0);

  const reducedMotionRef = useRef(false);

  /**
   * The just-committed selection's commit-pulse anchor (node and click time): set once per NEW selection by the "focused slug change"
   * effect and never mutated per frame; `drawTopologyFrame` derives `now - startAtMs` and `computeSelectionPulse` decides expiry, so no cleanup timer is needed.
   */
  const selectionPulseRef = useRef<{ nodeId: string; startAtMs: number; } | null>(null);

  /**
   * Hover pulses — the list of live one-shot signals. Pointer handlers append
   * on hover; the frame loop drops expired ones (`updatePulses`) and hands the
   * rest to the draw.
   */
  const pulsesRef = useRef<Pulse[]>([]);

  /**
   * Does the world contain any `depends` edge at all — computed once per world
   * build for the idle gate. Without one there are no comets, so the map is
   * allowed to be judged idle.
   */
  const hasDependsEdgesRef = useRef(false);

  /**
   * Selecting a node sends comets along its `contains` edges, so the idle gate must stay awake while
   * focused and any `contains` edge exists. Deliberately coarse, like `hasDependsEdgesRef`.
   */
  const hasContainsEdgesRef = useRef(false);

  /**
   * `wakeFrameLoopRef` is installed by `useTopologyFrameLoop` and schedules a frame unless one is.
   * `lastActiveMsRef` is the time of last activity, refreshed on every frame where an activity flag
   * is true. Writing it is how the map asks to be drawn, and the loop stops when nothing is active,
   * so a write also wakes it.
   */
  const [{ wakeFrameLoopRef, lastActiveMsRef }] = useState(createActivityClock);

  /**
   * Ambient sleep: time of the last user input (pointer and wheel only). Unlike `lastActiveMsRef`, which is refreshed every frame ambient
   * motion runs, it can answer "has the person let go". Seeded at 0, not `performance.now()` (impure during render, blocked by lint): the
   * time origin is the navigation, so 0 reads as untouched since the page opened and the map sleeps 30 s later.
   */
  const lastInputMsRef = useRef(0);

  /** Previous frame's camera values, for movement detection. */
  const previousCameraSampleRef = useRef<{ x: number; y: number; s: number; } | null>(null);
  return {
    lastActiveCausesRef, idleDebugEnabledRef, lastFrameTimeRef, navYieldUntilRef, reducedMotionRef,
    selectionPulseRef, pulsesRef, hasDependsEdgesRef, hasContainsEdgesRef, lastActiveMsRef, lastInputMsRef,
    previousCameraSampleRef, wakeFrameLoopRef,
  };
}

function createActivityClock() {
  const wakeFrameLoopRef = { current: () => {} };
  let lastActiveMs = 0;
  const lastActiveMsRef = {
    get current() {
      return lastActiveMs;
    },
    set current(next: number) {
      lastActiveMs = next;
      wakeFrameLoopRef.current();
    },
  };
  return { wakeFrameLoopRef, lastActiveMsRef };
}
