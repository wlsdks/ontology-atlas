import type { MapArrangement } from "@/shared/lib/appearance-preferences";
import { MOTION } from "@/shared/motion";
import {
  type RefObject
} from "react";
import type { CameraAxes, CameraTarget } from "../engine/camera";
import { MAX_FRAME_DELTA_SECONDS } from "../engine/spring";
import { type PointerMachineState } from "../interaction/pointer-state-machine";
import { ambientSleepFactor, isAmbientAsleep } from "../model/ambient-sleep";
import { easeInOutCubic } from "../model/camera-easing";
import {
  clampDomePitch,
  DOME_ASSEMBLE_TOTAL_MS,
  type DomeRuntime
} from "../model/dome-view";
import { stepGrowthReplay, type GrowthReplay } from "../model/growth-replay";
import { isCameraUnsettled, isCanvasActive, isDomeSpinAnimating, isEgoTailAnimating, shouldSkipFrame } from "../model/idle-gate";
import {
  type RealmTransitionState
} from "../model/realm-transition";
import type { Pulse } from "../render/edge-fireflies";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import type { OntologyMapProps } from "./OntologyMap";
import type { NodeDragState } from "./topology-pointer-handlers";
import { readOntologyMapTokensOrNull } from "./topology-read-tokens";
import { type TopologyWorld } from "./topology-world";

const IDLE_GRACE_MS = 1200;
const VIEWPORT_SETTLE_FRAMES = 2;
const INTERACTION_DPR_CAP = 1;

interface Dependencies {
  pointerMachineRef: RefObject<PointerMachineState>;
  nodeDragRef: RefObject<NodeDragState | null>;
  pendingViewportRef: RefObject<{ width: number; height: number; dpr: number; } | null>;
  appliedDprScaleRef: RefObject<number | null>;
  viewportRef: RefObject<{ width: number; height: number; dpr: number; }>;
  commitViewportSizeRef: RefObject<(() => boolean) | null>;
  viewportSettleFramesRef: RefObject<number>;
  lastActiveMsRef: RefObject<number>;
  viewportRebuildPendingRef: RefObject<boolean>;
  rebuildViewportLayersRef: RefObject<(() => void) | null>;
  worldRef: RefObject<TopologyWorld | null>;
  lastFrameTimeRef: RefObject<number>;
  previewEdgePropRef: RefObject<NonNullable<OntologyMapProps["previewEdge"]> | null>;
  previewSignatureRef: RefObject<string | null>;
  previewEdgeHeldRef: RefObject<NonNullable<OntologyMapProps["previewEdge"]> | null>;
  previewTransitionRef: RefObject<{ start: number; duration: number; fromAlpha: number; toAlpha: number; fromCommit: number; toCommit: number; } | null>;
  previewAlphaRef: RefObject<number>;
  previewCommitRef: RefObject<number>;
  reducedMotionRef: RefObject<boolean>;
  navYieldUntilRef: RefObject<number>;
  cameraRef: RefObject<CameraAxes>;
  cameraTargetRef: RefObject<CameraTarget>;
  prevCameraSampleRef: RefObject<{ x: number; y: number; s: number; } | null>;
  lastInputMsRef: RefObject<number>;
  ambientSleepDelayRef: RefObject<number | undefined>;
  domeRuntimeRef: RefObject<DomeRuntime | null>;
  view3dRef: RefObject<boolean>;
  realmTransitionRef: RefObject<RealmTransitionState>;
  domeFocusPendingRef: RefObject<{ slug: string | null; } | null>;
  bgPointerRef: RefObject<{ x: number; y: number; } | null>;
  growthReplayRef: RefObject<GrowthReplay | null>;
  growthReplayAppearRef: RefObject<Map<string, number>>;
  endGrowthReplay: () => void;
  heatRef: RefObject<number>;
  homingActiveRef: RefObject<boolean>;
  selectionPulseRef: RefObject<{ nodeId: string; startAtMs: number; } | null>;
  hasDependsEdgesRef: RefObject<boolean>;
  focusedSlugRef: RefObject<string | null>;
  hasContainsEdgesRef: RefObject<boolean>;
  pulsesRef: RefObject<Pulse[]>;
  hoveredNodeIdRef: RefObject<string | null>;
  panelEmphasisNodeIdRef: RefObject<string | null>;
  hoveredClusterIdRef: RefObject<string | null>;
  trailLensPropRef: RefObject<RefObject<boolean> | null>;
  trailBrushPropRef: RefObject<RefObject<string | null> | null>;
  panelHoverPropRef: RefObject<RefObject<string | null> | null>;
  galaxyRampRef: RefObject<number>;
  galaxyRef: RefObject<boolean>;
  neuralRampRef: RefObject<number>;
  mapArrangementRef: RefObject<MapArrangement>;
  drawnTrailLensRef: RefObject<boolean>;
  trailLensRampRef: RefObject<number>;
  visitedTrailRef: RefObject<readonly string[]>;
  colorFocusRef: RefObject<{ focusedNodeId: string | null; selectedEdge: { sourceId: string; targetId: string; relationType?: string; } | null; } | null>;
  selectedEdgeRef: RefObject<{ sourceId: string; targetId: string; relationType?: string; } | null>;
  spotlightRampRef: RefObject<number>;
  spotlightIdsRef: RefObject<ReadonlySet<string> | null>;
  idleDebugEnabledRef: RefObject<boolean>;
  lastActiveCausesRef: RefObject<{ t: number; causes: string[]; } | null>;
}
interface FrameResult {
  tokens: OntologyMapTokens;
  world: TopologyWorld;
  width: number;
  height: number;
  dpr: number;
  dt: number;
}

/** Commit viewport changes, advance preview clocks, and decide whether this frame needs work. */
export function createFrameGate({
  pointerMachineRef,
  nodeDragRef,
  pendingViewportRef,
  appliedDprScaleRef,
  viewportRef,
  commitViewportSizeRef,
  viewportSettleFramesRef,
  lastActiveMsRef,
  viewportRebuildPendingRef,
  rebuildViewportLayersRef,
  worldRef,
  lastFrameTimeRef,
  previewEdgePropRef,
  previewSignatureRef,
  previewEdgeHeldRef,
  previewTransitionRef,
  previewAlphaRef,
  previewCommitRef,
  reducedMotionRef,
  navYieldUntilRef,
  cameraRef,
  cameraTargetRef,
  prevCameraSampleRef,
  lastInputMsRef,
  ambientSleepDelayRef,
  domeRuntimeRef,
  view3dRef,
  realmTransitionRef,
  domeFocusPendingRef,
  bgPointerRef,
  growthReplayRef,
  growthReplayAppearRef,
  endGrowthReplay,
  heatRef,
  homingActiveRef,
  selectionPulseRef,
  hasDependsEdgesRef,
  focusedSlugRef,
  hasContainsEdgesRef,
  pulsesRef,
  hoveredNodeIdRef,
  panelEmphasisNodeIdRef,
  hoveredClusterIdRef,
  trailLensPropRef,
  trailBrushPropRef,
  panelHoverPropRef,
  galaxyRampRef,
  galaxyRef,
  neuralRampRef,
  mapArrangementRef,
  drawnTrailLensRef,
  trailLensRampRef,
  visitedTrailRef,
  colorFocusRef,
  selectedEdgeRef,
  spotlightRampRef,
  spotlightIdsRef,
  idleDebugEnabledRef,
  lastActiveCausesRef,
}: Dependencies) {
  const result = {} as FrameResult;
  return function runFrameGate(
    now: number,
  ) {

    // Lower the backing resolution while dragging (`INTERACTION_DPR_CAP`).
    // The transition happens exactly **twice** — at the start and end of an
    // interaction — so the canvas is not reallocated per frame.
    {
      const deviceDpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const interacting =
        pointerMachineRef.current.phase === "dragging" || nodeDragRef.current !== null;
      const wantScale = interacting ? Math.min(deviceDpr, INTERACTION_DPR_CAP) : deviceDpr;
      const pending = pendingViewportRef.current;
      if (pending) {
        // A pending resize has its dpr **overwritten**. `measure()` records
        // the device dpr, so a window change mid-drag would restore full
        // resolution for the rest of that drag — rare, but silent.
        pending.dpr = wantScale;
        appliedDprScaleRef.current = wantScale;
      } else if (appliedDprScaleRef.current !== wantScale) {
        appliedDprScaleRef.current = wantScale;
        const { width, height } = viewportRef.current;
        if (width > 0 && height > 0) {
          pendingViewportRef.current = { width, height, dpr: wantScale };
        }
      }
    }

    // The resize commit happens **immediately before drawing**. Doing it in
    // the ResizeObserver callback clears the canvas and then paints, so a
    // blank map reaches the screen (see the resize effect's `measure`
    // comment). Here it clears and redraws in the same frame.
    if (commitViewportSizeRef.current?.()) {
      viewportSettleFramesRef.current = 0;
      // If the idle gate skipped this frame, the cleared canvas would ship.
      lastActiveMsRef.current = now;
    } else if (viewportRebuildPendingRef.current) {
      viewportSettleFramesRef.current += 1;
      if (viewportSettleFramesRef.current >= VIEWPORT_SETTLE_FRAMES) {
        rebuildViewportLayersRef.current?.();
        viewportRebuildPendingRef.current = false;
        lastActiveMsRef.current = now;
      }
    }

    const tokens = readOntologyMapTokensOrNull();

    const world = worldRef.current;

    const { width, height, dpr } = viewportRef.current;

    if (!tokens || !world || width <= 0 || height <= 0) {
      return null;
    }

    const dt =
      lastFrameTimeRef.current === 0
        ? 0
        : Math.min((now - lastFrameTimeRef.current) / 1000, MAX_FRAME_DELTA_SECONDS);

    lastFrameTimeRef.current = now;

    const previewProp = previewEdgePropRef.current;

    const previewSignature = previewProp
      ? `${previewProp.sourceId}>${previewProp.targetId}:${previewProp.relationType}:${previewProp.phase}`
      : "none";

    if (previewSignatureRef.current !== previewSignature) {
      const firstAppearance = previewSignatureRef.current === null || previewSignatureRef.current === "none";
      previewSignatureRef.current = previewSignature;
      if (previewProp) previewEdgeHeldRef.current = previewProp;
      const durationSeconds = previewProp === null
        ? MOTION.fast.duration
        : previewProp.phase === "committing"
          ? MOTION.settle.duration
          : MOTION.base.duration;
      previewTransitionRef.current = {
        start: now,
        duration: durationSeconds * 1000,
        fromAlpha: previewProp && !firstAppearance
          ? Math.min(previewAlphaRef.current, 0.45)
          : previewAlphaRef.current,
        toAlpha: previewProp ? 1 : 0,
        fromCommit: previewCommitRef.current,
        toCommit: previewProp?.phase === "committing" ? 1 : 0,
      };
    }

    const previewTransition = previewTransitionRef.current;

    if (previewTransition) {
      const progress = reducedMotionRef.current
        ? 1
        : Math.min(1, Math.max(0, (now - previewTransition.start) / previewTransition.duration));
      const eased = easeInOutCubic(progress);
      previewAlphaRef.current = previewTransition.fromAlpha +
        (previewTransition.toAlpha - previewTransition.fromAlpha) * eased;
      previewCommitRef.current = previewTransition.fromCommit +
        (previewTransition.toCommit - previewTransition.fromCommit) * eased;
      if (progress >= 1) {
        previewTransitionRef.current = null;
        if (previewTransition.toAlpha === 0) previewEdgeHeldRef.current = null;
      }
    }

    // The navigation yield sits **ahead of** the idle gate: whatever the
    // activity flags say (auto-spin, comets, assembly ramp), a screen that is
    // being left does not get drawn.
    if (now < navYieldUntilRef.current) {
      return null;
    }

    // --- Idle gate: re-evaluate the activity flags from the refs. Once they
    // are all off and the grace period has passed, physics and painting are
    // skipped. rAF keeps running, so any state change resumes naturally on
    // the next frame — no wake wiring and no freeze failure mode.
    {
      const cam = cameraRef.current;
      const target = cameraTargetRef.current;
      const prev = prevCameraSampleRef.current;
      // Watching only the camera's value movement would ignore a wheel tick
      // during an idle skip forever, because a wheel changes the target
      // alone. An unsettled spring (target ≠ value) is activity too — the
      // idle-gate contract.
      const cameraUnsettled = isCameraUnsettled(
        { x: cam.x.value, y: cam.y.value, scale: cam.scale.value },
        target,
      );
      const cameraMoving =
        prev === null ||
        cameraUnsettled ||
        Math.abs(cam.x.value - prev.x) > 0.01 ||
        Math.abs(cam.y.value - prev.y) > 0.01 ||
        Math.abs(cam.scale.value - prev.s) > 0.0001;
      prevCameraSampleRef.current = { x: cam.x.value, y: cam.y.value, s: cam.scale.value };

      /**
       * Ambient sleep factor (design council 「Workbench」 P0 prescription,
       * 2026-07-28).
       *
       * The always-on comets and the fresh breathe are **not switched off**:
       * the comets are the only channel carrying a `depends` edge's
       * direction, so switching them off would delete a typed fact. (The
       * council's test — "does turning that motion off lose information?" —
       * answers yes here.) Instead, once the person has let go for long
       * enough, their speed ramps to 0 and they fall asleep.
       *
       * The factor multiplies comet speed, so the flow decelerates to a stop
       * rather than cutting; the moment it reaches 0 the two activity flags
       * above drop and `isCanvasActive` closes on its own. Any input pushes
       * `lastInputMs` via `noteInput()` and the factor returns to 1 on the
       * next frame — the idle-gate design that needs no wake wiring.
       */
      const ambientFactor = ambientSleepFactor(now, lastInputMsRef.current, ambientSleepDelayRef.current);
      const ambientAsleep = isAmbientAsleep(ambientFactor);

      // Does the dome still have to move — assembly/teardown ramp, auto-spin,
      // orbit inertia, twist spring-back, flat-drag spring, or the reset
      // ease. The auto-spin stops while the pointer is over the canvas
      // (bgPointer present) so an aimed-at node cannot slide out from under
      // the cursor.
      const domeRt = domeRuntimeRef.current;
      const domeTargetOn = view3dRef.current && realmTransitionRef.current.phase === "idle";
      const domeMotion =
        (domeTargetOn && (domeRt === null || domeRt.rampClock < DOME_ASSEMBLE_TOTAL_MS)) ||
        (domeRt !== null &&
          ((!domeTargetOn && domeRt.rampClock > 0) ||
            domeRt.yawVel !== 0 ||
            domeRt.pitchVel !== 0 ||
            domeRt.drag !== null ||
            domeRt.poseTween !== null ||
            /*
             * ★ **Every motion in flight must be named here.** These two
             * were missing and the screen actually froze mid-animation
             * (measured 2026-08-18):
             *
             * - `yawSnap`: the landing target keeps closing the remaining gap
             *   exponentially after velocity reaches 0. A gate that watched
             *   velocity alone read that stretch as "stopped" and cut the
             *   frames, leaving the dome 0.073 rad short of its target.
             * - `entryArmed`: the entry sweep's clock (1500 ms) is longer
             *   than the assembly clock (1120 ms). A gate that watched only
             *   the ramp missed the last 380 ms.
             *
             * Generally: forgetting to register a new motion with the idle
             * gate produces "it sometimes stops halfway", which is the most
             * expensive class of symptom to trace back to its cause.
             */
            domeRt.yawSnap !== null ||
            domeRt.morph !== null ||
            domeRt.entryArmed ||
            domeFocusPendingRef.current !== null ||
            Math.abs(domeRt.lag.domain) + Math.abs(domeRt.lag.capability) + Math.abs(domeRt.lag.element) > 1e-4 ||
            domeRt.pitch !== clampDomePitch(domeRt.pitch) ||
            // Keep rAF awake only while the auto-spin could actually run. A
            // dome whose `spinArmed` was lowered by interaction is a still
            // frame and belongs to the idle gate.
            //
            // ★ **Why `!ambientAsleep` belongs here** (measured 2026-08-19):
            // the auto-spin is ambient motion of the same family as the
            // always-on comets and the fresh breathe, yet it alone sat
            // outside the `ambient-sleep.ts` contract. So 3D **never fell
            // asleep, even 45 s after the last input** — at 2,000 nodes it
            // burned 520 ms per second (half a core) forever, where 2D in the
            // same state burned 3 ms/s, a factor of 170. Given that this
            // app's typical scenario is "leave it open beside the agent
            // terminal", this was the most expensive state available.
            (!domeRt.orbiting &&
              isDomeSpinAnimating({
                domeOn: domeTargetOn,
                reducedMotion: reducedMotionRef.current,
                ambientAsleep,
                spinArmed: domeRt.spinArmed,
                pointerOverCanvas: bgPointerRef.current !== null,
                assembled: domeRt.rampClock >= DOME_ASSEMBLE_TOTAL_MS,
              }))));

      // Growth replay — advance every node's appear value for this frame, and end
      // it when the last node has fully appeared. Nothing is left behind:
      // `appearRef` still holds every node at 1. The deliberate exits are listed
      // in the token effect's table; none of them is a pointer move.
      if (growthReplayRef.current !== null) {
        if (stepGrowthReplay(growthReplayRef.current, now, growthReplayAppearRef.current)) {
          endGrowthReplay();
        }
        lastActiveMsRef.current = now;
      }
      const idleFlags = {
        pointerActive: pointerMachineRef.current.phase !== "idle",
        // The sim counts as warm only while a drag grab/release is charging
        // heat, or a node is pinned. There is no always-on physics toggle.
        simWarm: heatRef.current > 0 || nodeDragRef.current !== null,
        homing: homingActiveRef.current,
        selectionPulseActive: selectionPulseRef.current !== null &&
          now - selectionPulseRef.current.startAtMs < tokens.selectPulseDurationMs,
        // ★ The three branches are composed by a pure function in
        // `idle-gate.ts`, not by an inline OR here. While it was inline,
        // ambient sleep applied to the **`depends` branch only**, so leaving
        // a node selected and letting go meant the app never slept.
        //
        // The branches: with `depends` edges present and reduced-motion off,
        // comets flow regardless of focus (owner's instruction that they be
        // always-on), so the canvas is never idle; the focused `contains`
        // comets and the hover pulses raise the same flag. When the document
        // is hidden the browser stops rAF itself, which protects the battery.
        growthReplaying: growthReplayRef.current !== null,
        egoTailAnimating: isEgoTailAnimating({
          reducedMotion: reducedMotionRef.current,
          ambientAsleep,
          hasDependsEdges: hasDependsEdgesRef.current,
          edgePulseSpeed: tokens.edgePulseSpeed,
          focused: focusedSlugRef.current !== null,
          hasContainsEdges: hasContainsEdgesRef.current,
          livePulseCount: pulsesRef.current.length,
        }),
        // Lens brushing is an interaction in progress too: folding to idle
        // would freeze the hover ring or never draw it. Treated like canvas
        // hover.
        emphasisTarget:
          hoveredNodeIdRef.current !== null ||
          panelEmphasisNodeIdRef.current !== null ||
          hoveredClusterIdRef.current !== null ||
          ((trailLensPropRef.current?.current ?? false) && (trailBrushPropRef.current?.current ?? null) !== null) ||
          // Side-panel hover is an interaction in progress as well. Leaving
          // it out lets the loop fold to idle, and hovering then does
          // **nothing** — the value is right but nothing is drawn.
          (panelHoverPropRef.current?.current ?? null) !== null,
        // Lens on/off transition: if it differs from what was last drawn,
        // wake for a frame and draw the new state — same contract as the
        // spotlight ramp settling.
        galaxySettling:
          Math.abs(galaxyRampRef.current - (galaxyRef.current ? 1 : 0)) > 0.01 ||
          Math.abs(neuralRampRef.current - (view3dRef.current && mapArrangementRef.current === "coupling" ? 1 : 0)) > 0.01,
        galaxyAtmosphereActive: galaxyRef.current && !reducedMotionRef.current,
        trailLensSettling:
          (trailLensPropRef.current?.current ?? false) !== drawnTrailLensRef.current ||
          Math.abs(
            trailLensRampRef.current - ((trailLensPropRef.current?.current ?? false) ? 1 : 0),
          ) > 0.01,
        /*
         * The lens is open on a walk that has relations in it — so the twinkle and the
         * light travelling each line have something to move. Same class as the depends
         * comets: an ambient animation the ambient-sleep guard may stop, but the idle gate
         * must not, or the constellation freezes the moment the sweep lands.
         */
        trailMotionActive:
          (trailLensPropRef.current?.current ?? false) &&
          !reducedMotionRef.current &&
          visitedTrailRef.current.length > 1,
        // The fresh breathe is almost always true in this product's **normal
        // state**, where an agent edits the vault daily (council
        // measurement), which made this flag one of the two causes of the
        // idle gate staying open forever. Hence the ambient-sleep guard.
        breathing: !reducedMotionRef.current && !ambientAsleep && world.nodes.some((n) => n.fresh),
        cameraMoving,
        // Deselect fade: with no live focus but a retained colorFocus still
        // present (the colour target for the selection ring and background
        // dim), the loop must stay awake until the focus ramp decays to 0.
        // That decay and the colorFocus clear happen only in the frame body
        // below, so this is counted as activity explicitly rather than
        // relying on incidental activity like comets or the camera —
        // otherwise the deselected ring lingers.
        focusFadeSettling:
          colorFocusRef.current !== null && focusedSlugRef.current === null && selectedEdgeRef.current === null,
        // A spotlight on/off transition whose ramp has not arrived is
        // activity, on the same contract as focusFadeSettling: the ramp steps
        // only inside the frame body.
        spotlightSettling:
          Math.abs(spotlightRampRef.current - (spotlightIdsRef.current !== null ? 1 : 0)) > 0.01,
      };
      const active =
        isCanvasActive(idleFlags) ||
        previewTransitionRef.current !== null ||
        realmTransitionRef.current.phase === "entering" ||
        realmTransitionRef.current.phase === "exiting" ||
        domeMotion;
      if (active) {
        lastActiveMsRef.current = now;
        // e2e instrumentation: the names of the flags that just kept this
        // frame awake (see the `lastActiveCausesRef` doc-block). Recorded
        // only while the window is attached, so the product path pays zero.
        if (idleDebugEnabledRef.current) {
          const causes: string[] = [];
          for (const [k, v] of Object.entries(idleFlags)) if (v === true) causes.push(k);
          if (realmTransitionRef.current.phase !== "idle") causes.push("realmTransition");
          if (domeMotion) causes.push("domeMotion");
          if (previewTransitionRef.current !== null) causes.push("previewEdge");
          lastActiveCausesRef.current = { t: now, causes };
        }
      } else if (shouldSkipFrame(now, lastActiveMsRef.current, IDLE_GRACE_MS)) {
        return null;
      }
    }
    result.tokens = tokens;
    result.world = world;
    result.width = width;
    result.height = height;
    result.dpr = dpr;
    result.dt = dt;
    return result;
  };
}
