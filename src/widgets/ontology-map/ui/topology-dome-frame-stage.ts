import type { MapArrangement } from "@/shared/lib/appearance-preferences";
import type { CameraAxes, CameraTarget } from "../engine/camera";
import type { PointerMachineState } from "../interaction/pointer-state-machine";
import { ambientSleepFactor, isAmbientAsleep } from "../model/ambient-sleep";
import {
  CAMERA_TRANSITION_MIN_MS,
  cameraTransitionDurationMs,
  easeInOutCubic,
  easeOutCubic,
  type CameraKeyframe,
} from "../model/camera-easing";
import {
  beginDomeModelBuild,
  beginDomeMorph,
  chargeTierLag,
  clampDomePitch,
  commitDomeEntrySweep,
  createDomeRuntime,
  decayOrbitVelocity,
  DOME_ASSEMBLE_TOTAL_MS,
  DOME_BUILD_SLICE_MS,
  DOME_ENTRY_SWEEP_MS,
  DOME_PERIOD_MS,
  DOME_POSE_LAG_SCALE,
  DOME_POSE_MS,
  DOME_TIER_LAG_DECAY_PER_MS,
  domeEgoWorldBounds,
  domeFocusYaw,
  domeNearestYawTurn,
  domeWorldBounds,
  DOME_FLY_MS,
  ORBIT_SMOOTH_TAU_MS,
  ORBIT_SNAP_ARRIVE_RAD,
  orbitSnapTauMs,
  projectDomeCoord,
  settleDomeRuntimeOffscreen,
  stepDomeDragSpring,
  updateDomeFrame,
  type DomeModel,
  type DomeModelBuild,
  type DomeRuntime,
} from "../model/dome-view";
import { isDomeSpinAnimating } from "../model/idle-gate";
import type { RealmTransitionState } from "../model/realm-transition";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import {
  computeDomeFocusCameraTarget,
  computeOverviewCameraTarget,
  computeOverviewFitScale,
} from "./topology-camera-math";
import { overviewBoundsFor } from "./topology-overview-fit";
import { radiusForKind, type TopologyWorld } from "./topology-world";

type SourceRef<T> = { current: T; };

/**
 * How far inside the free canvas a nudged node lands (CSS px) — enough for its disc, its
 * selection ring and the start of its name to clear the panel edge.
 */
const DOME_NUDGE_MARGIN_PX = 64;

export interface DomeFrameStageSources {
  view3dRef: SourceRef<boolean>;
  realmTransitionRef: SourceRef<RealmTransitionState>;
  domeRuntimeRef: SourceRef<DomeRuntime | null>;
  domeWorldSourceRef: SourceRef<unknown>;
  domeModelBuildRef: SourceRef<{
    world: unknown;
    arrangement: string;
    build: DomeModelBuild;
  } | null>;
  mapArrangementRef: SourceRef<MapArrangement>;
  domeFitPendingRef: SourceRef<boolean>;
  domeFitDurationRef: SourceRef<number | undefined>;
  flatFitPendingRef: SourceRef<boolean>;
  domeFocusPendingRef: SourceRef<{ slug: string | null; } | null>;
  cameraRef: SourceRef<CameraAxes>;
  cameraTargetRef: SourceRef<CameraTarget>;
  dampingRef: SourceRef<number>;
  cameraAngularFreqRef: SourceRef<number | null>;
  userDrivenCameraRef: SourceRef<boolean>;
  overviewScaleRef: SourceRef<number>;
  overviewFitRef: SourceRef<"spine" | "full">;
  expandedParentsRef: SourceRef<ReadonlySet<string>>;
  clusteredIdsRef: SourceRef<ReadonlySet<string>>;
  pointerMachineRef: SourceRef<PointerMachineState>;
  bgPointerRef: SourceRef<{ x: number; y: number; } | null>;
  reducedMotionRef: SourceRef<boolean>;
  lastInputMsRef: SourceRef<number>;
  lastActiveMsRef: SourceRef<number>;
  ambientSleepDelayRef: SourceRef<number | undefined>;
  viewportRef: SourceRef<{ width: number; height: number; dpr: number; }>;
  beginCameraTween: (target: CameraTarget, durationOverrideMs?: number, ease?: "out") => void;
  cameraTokens: (tokens: OntologyMapTokens) => OntologyMapTokens;
  domeFitTarget: (
    model: DomeModel,
    yaw: number,
    pitch: number,
    width: number,
    height: number,
    tokens: OntologyMapTokens,
  ) => CameraTarget | null;
}

export function createDomeFrameStage(sources: DomeFrameStageSources) {
  const {
    view3dRef,
    realmTransitionRef,
    domeRuntimeRef,
    domeWorldSourceRef,
    domeModelBuildRef,
    mapArrangementRef,
    domeFitPendingRef,
    domeFitDurationRef,
    flatFitPendingRef,
    domeFocusPendingRef,
    cameraRef,
    cameraTargetRef,
    dampingRef,
    cameraAngularFreqRef,
    userDrivenCameraRef,
    overviewScaleRef,
    overviewFitRef,
    expandedParentsRef,
    clusteredIdsRef,
    pointerMachineRef,
    bgPointerRef,
    reducedMotionRef,
    lastInputMsRef,
    lastActiveMsRef,
    ambientSleepDelayRef,
    viewportRef,
    beginCameraTween,
    cameraTokens,
    domeFitTarget,
  } = sources;

  return function runDomeFrameStage(
    now: number,
    dt: number,
    tokens: OntologyMapTokens,
    world: TopologyWorld,
    width: number,
    height: number,
  ): boolean {
    // --- Dome step: refresh pose, inertia, assembly clock and frame map each
    // frame. Every value and physical property lives in `model/dome-view.ts`
    // (owner's dispensation: 3D mode sits outside the app's motion
    // conventions — `docs/DECISIONS.md`). ---
    {
      const domeTargetOn = view3dRef.current && realmTransitionRef.current.phase === "idle";
      let dome = domeRuntimeRef.current;
      if (domeTargetOn || (dome !== null && dome.rampClock > 0)) {
        if (dome === null || domeWorldSourceRef.current !== world) {
          if (dome === null) {
            /*
             * First dome — the model build is consumed in **frame-budget
             * slices** (see the `domeModelBuildRef` doc-block: the coupled
             * cloud relaxation used to hitch this one frame by 346–368 ms).
             * The ownership arrangement has a null `step`, so it still
             * completes immediately in this frame.
             */
            let pending = domeModelBuildRef.current;
            if (
              pending === null ||
              pending.world !== world ||
              pending.arrangement !== mapArrangementRef.current
            ) {
              pending = {
                world,
                arrangement: mapArrangementRef.current,
                build: beginDomeModelBuild(
                  world.nodes.map((n) => ({ id: n.id, kind: n.kind, x: n.x, y: n.y, parentId: n.parentId })),
                  /*
                   * The coupling arrangement takes **every relation** as
                   * input to its angles — which is precisely how it differs
                   * from the ownership arrangement, which sees only the
                   * containment parent.
                   */
                  { arrangement: mapArrangementRef.current, edges: world.edges },
                ),
              };
              domeModelBuildRef.current = pending;
            }
            if (pending.build.step !== null && !pending.build.step(DOME_BUILD_SLICE_MS)) {
              // Still relaxing — draw nothing this frame, exactly as the
              // synchronous hitch used to show a still frame. Count it as
              // activity so the idle gate does not fold, and resume next
              // frame.
              lastActiveMsRef.current = now;
              return false;
            }
            domeModelBuildRef.current = null;
            dome = createDomeRuntime(pending.build.model);
            domeRuntimeRef.current = dome;
            // When the map loads with 3D already on (a saved preference on
            // revisit) the toggle effect never runs, so the first fit is
            // scheduled here.
            if (domeTargetOn) {
              domeFitPendingRef.current = true;
              domeFitDurationRef.current = DOME_ASSEMBLE_TOTAL_MS;
            }
          } else {
            /*
             * The world or the arrangement changed while the dome is on
             * screen — re-solve layout, keep the pose (yaw/pitch).
             *
             * Measured 2026-09-02: this path rebuilt synchronously, so a
             * dome→cloud switch held one frame for 22 ms at 125 nodes and
             * **260 ms at 1,000** — the first-entry path above had been sliced
             * (ledger (85)) but a switch had not. It now consumes the same
             * sliced build; the previous model keeps drawing meanwhile, and
             * on completion the coordinates **morph** to the new model
             * (`beginDomeMorph`) instead of cutting.
             */
            let pending = domeModelBuildRef.current;
            if (
              pending === null ||
              pending.world !== world ||
              pending.arrangement !== mapArrangementRef.current
            ) {
              pending = {
                world,
                arrangement: mapArrangementRef.current,
                build: beginDomeModelBuild(
                  world.nodes.map((n) => ({ id: n.id, kind: n.kind, x: n.x, y: n.y, parentId: n.parentId })),
                  { arrangement: mapArrangementRef.current, edges: world.edges },
                ),
              };
              domeModelBuildRef.current = pending;
            }
            if (pending.build.step !== null && !pending.build.step(DOME_BUILD_SLICE_MS)) {
              /*
               * Still relaxing — **hold the previous picture** this frame and
               * resume next frame, the same contract as first entry. Redrawing
               * the old model on every slice frame stacked ~10 ms of draw on the
               * 28 ms slice (measured 2026-09-02 at 3,000 nodes: p95 52 ms for 31
               * frames), and nothing on screen was moving anyway — the click on
               * the picker put the pointer over the canvas, which parks the spin.
               * Counted as activity so the idle gate does not fold mid-build.
               */
              lastActiveMsRef.current = now;
              return false;
            } else {
              domeModelBuildRef.current = null;
              /*
               * **The structure stays where it stood** (2026-09-25). A selection opens its
               * ancestors in the flat layout, which rebuilds the world, and the model's anchor
               * (`centerX/Y`, `unit`) is derived from that flat layout — so the whole 3D view
               * slid under the pointer after a click, and the next click landed on a
               * different node. The selection reframe used to hide the slide by moving the
               * camera anyway; now that a click only selects, a rebuild in the same
               * arrangement keeps the anchor it was drawn at.
               */
              if (pending.build.model.arrangement === dome.model.arrangement) {
                pending.build.model.centerX = dome.model.centerX;
                pending.build.model.centerY = dome.model.centerY;
                pending.build.model.unit = dome.model.unit;
              }
              beginDomeMorph(dome, pending.build.model, now, reducedMotionRef.current ? 0 : DOME_POSE_MS);
              dome.drawnBounds = null;
              dome.drag = null;
              domeWorldSourceRef.current = world;
              /*
               * Refit only when the new shape does not fit the viewport at the
               * current zoom (the cloud is wider than the tree, so a switch made
               * after a selection reframe spilled nodes past the top edge —
               * measured 2026-09-02). A shape that still fits keeps the zoom the
               * user set; the pose is never touched either way.
               */
              const b = domeWorldBounds(dome.model, dome.yaw, dome.pitch);
              if (b !== null) {
                const scale = cameraRef.current.scale.value;
                const spanX = (b.maxX - b.minX) * 1.3 * scale;
                const spanY = (b.maxY - b.minY) * 1.3 * scale;
                if (spanX > width || spanY > height) {
                  domeFitPendingRef.current = true;
                  domeFitDurationRef.current = DOME_POSE_MS;
                }
              }
            }
          }
          if (domeModelBuildRef.current === null) domeWorldSourceRef.current = world;
        }
        dome.active = domeTargetOn;
        // Once, right after turning on: fit the camera so the cone fills the
        // free canvas (`domeFitTarget`). It used to reserve the hero's "object
        // centred, half of it air" 15% pad on top of the 2D overview fit's own
        // reservations, which put the cone at 22.6% of the free area — an
        // object adrift rather than a map (measured 2026-09-05).
        if (domeFitPendingRef.current && domeTargetOn) {
          domeFitPendingRef.current = false;
          const target = domeFitTarget(dome.model, dome.yaw, dome.pitch, width, height, tokens);
          if (target !== null) {
            cameraTargetRef.current = target;
            // If the fit scale is below the 2D floor, lower the floor to it.
            // Otherwise target ≠ value persists and the wheel anchor computes
            // against a zoom that does not exist (see the `fitScale` JSDoc).
            dome.fitScale = target.tscale;
            userDrivenCameraRef.current = false;
            dampingRef.current = tokens.cameraDampingDefault;
            cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
            /*
             * The fit rides the choreography's clock, not the 2D tween cap
             * (measured 2026-09-02 on a real recording: the zoom-out finished
             * in 300 ms while the rings were still at 33% of their rise, so
             * one input read as two events — a whip, then a slow assembly).
             * Entry takes the assembly length; an arrangement refit takes
             * the morph length. `domeFitDurationRef` is set by whoever raised
             * the pending flag.
             */
            beginCameraTween(target, domeFitDurationRef.current);
            domeFitDurationRef.current = undefined;
          }
        }
        const dtMs = dt * 1000;
        // Assembly/teardown clock: turning on runs forward with a tier
        // stagger, turning off runs backward at 1.6×. Reduced-motion snaps —
        // the assembly choreography is app-generated motion.
        if (reducedMotionRef.current) {
          dome.rampClock = domeTargetOn ? DOME_ASSEMBLE_TOTAL_MS : 0;
          /*
           * Under reduced-motion there is **no entry sweep at all** — it is
           * app-generated motion, so WCAG 2.3.3's direct-manipulation
           * exception does not apply.
           *
           * `commitDomeEntrySweep` is deliberately NOT used here: it means
           * "fold the sweep already being drawn into the pose", which would
           * permanently add an angle that was never drawn. With nothing
           * drawn there is nothing to fold in.
           */
          dome.entryArmed = false;
        } else {
          dome.rampClock = Math.max(
            0,
            Math.min(DOME_ASSEMBLE_TOTAL_MS, dome.rampClock + (domeTargetOn ? dtMs : -dtMs * 1.6)),
          );
          /*
           * The entry sweep runs on its own clock, outliving assembly (see
           * the `DOME_ENTRY_SWEEP_MS` doc-block: during assembly the tier
           * ramps are low, so turning the pose barely moves any node). When
           * it is spent it disarms itself and the branch disappears from
           * later frames.
           */
          if (dome.entryArmed) {
            dome.entryClock += domeTargetOn ? dtMs : dtMs * 4;
            if (dome.entryClock >= DOME_ENTRY_SWEEP_MS) dome.entryArmed = false;
          }
        }

        /*
         * The 2D return fit, paid **once, on the frame teardown finishes**
         * (see the `flatFitPendingRef` doc-block). Fitting while the ramp
         * runs frames mid-morph coordinates and is wrong again on arrival.
         *
         * The target uses the **same computation** as 2D fit-view
         * (`overviewBoundsFor` + `computeOverviewCameraTarget`): if the view
         * after turning 3D off differed from the view after pressing
         * fit-view, that difference would itself be the next defect.
         */
        /*
         * The return fit starts **with** the teardown and lasts exactly as
         * long (measured 2026-09-02: it used to wait for the ramp to reach 0,
         * so the concepts folded back at 3D zoom for 700 ms and only then
         * the camera zoomed in — two events for one input). The target is the
         * 2D overview, whose bounds do not depend on the ramp, so it is known
         * on the first teardown frame; the tween and the ramp end together.
         */
        if (flatFitPendingRef.current && !domeTargetOn) {
          flatFitPendingRef.current = false;
          const teardownMs = reducedMotionRef.current ? 0 : dome.rampClock / 1.6;
          const flatTarget = computeOverviewCameraTarget(
            overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current),
            width,
            height,
            tokens,
            world.nodes.length,
          );
          cameraTargetRef.current = flatTarget;
          overviewScaleRef.current = computeOverviewFitScale(
            overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current),
            width,
            height,
            tokens,
            world.nodes.length,
          );
          // This is a programmatic move, so it uses the transition easing
          // rather than the interactive spring a preceding wheel gesture left
          // behind — same contract as 2D fit-view.
          userDrivenCameraRef.current = false;
          dampingRef.current = tokens.cameraDampingDefault;
          cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
          beginCameraTween(flatTarget, teardownMs > 0 ? teardownMs : undefined);
          lastActiveMsRef.current = now;
        }
        // 3D selection reframe: consume the ticket the focus effect left
        // (why here rather than in the effect: the `domeFocusPendingRef`
        // JSDoc). This is the dome equivalent of the 2D focus dive. The node
        // may be on the far side of the structure, so zoom and pan alone
        // would enlarge it while still occluded; instead the yaw (bringing it
        // to the front) and the camera pan/zoom (to the ego projection bbox)
        // ride the **same clock** — cubic ease-in-out, identical duration —
        // and arrive together. No new easing vocabulary.
        if (
          domeFocusPendingRef.current !== null &&
          domeTargetOn &&
          // Gestures win: while the user is orbiting or dragging, the ticket
          // is dropped rather than starting a programmatic move — input
          // always wins, symmetric with the tween-interrupt contract.
          !dome.orbiting &&
          pointerMachineRef.current.phase !== "dragging"
        ) {
          const pending = domeFocusPendingRef.current;
          domeFocusPendingRef.current = null;
          const { width, height } = viewportRef.current;
          if (width > 0 && height > 0) {
            if (pending.slug === null) {
              // Deselect: leave the pose alone (respect the user's
              // viewpoint) and return only the camera to the whole-dome frame
              // at the current pose — the equivalent of the 2D overview
              // return.
              const target = domeFitTarget(dome.model, dome.yaw, dome.pitch, width, height, tokens);
              if (target !== null) {
                cameraTargetRef.current = target;
                dome.fitScale = target.tscale;
                userDrivenCameraRef.current = false;
                dampingRef.current = tokens.cameraDampingDefault;
                cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
                beginCameraTween(target);
              }
            } else {
              // A selection is interaction, so the attention spin is
              // lowered here. That holds even for a node with no coordinate
              // (a kind outside the dome model) — interaction is interaction.
              dome.spinArmed = false;
              commitDomeEntrySweep(dome);
              const coord = dome.model.coords.get(pending.slug);
              if (coord !== undefined) {
                dome.orbiting = false;
                dome.yawVel = 0;
                // Drop the landing target too — new input and an explicit
                // reset always win.
                dome.yawSnap = null;
                dome.pitchVel = 0;
                const targetYaw = domeFocusYaw(coord, dome.yaw);
                const targetPitch = clampDomePitch(dome.pitch);
                const egoIds = [pending.slug, ...(world.neighborMap.get(pending.slug) ?? [])];
                const b = domeEgoWorldBounds(dome.model, egoIds, targetYaw, targetPitch);
                if (b !== null) {
                  const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
                  const anchorAtTarget = projectDomeCoord(dome.model, coord, targetYaw, targetPitch);
                  const target = computeDomeFocusCameraTarget(
                    b,
                    cameraTokens(tokens),
                    width,
                    height,
                    overviewEntryScale,
                    dome.fitScale,
                    { x: anchorAtTarget.wx, y: anchorAtTarget.wy },
                  );
                  const start: CameraKeyframe = {
                    x: cameraRef.current.x.value,
                    y: cameraRef.current.y.value,
                    scale: cameraRef.current.scale.value,
                  };
                  // Duration is the larger of the camera term (distance
                  // proportional, the existing formula) and the pose term
                  // (half a turn = `DOME_POSE_MS`), so both axes arrive
                  // together on one clock.
                  const yawSpan = Math.abs(targetYaw - dome.yaw) + Math.abs(targetPitch - dome.pitch);
                  const yawMs =
                    CAMERA_TRANSITION_MIN_MS +
                    Math.min(1, yawSpan / Math.PI) * (DOME_POSE_MS - CAMERA_TRANSITION_MIN_MS);
                  const durationMs = Math.max(
                    cameraTransitionDurationMs(start, { x: target.tx, y: target.ty, scale: target.tscale }),
                    yawMs,
                  );
                  dome.poseTween = { startYaw: dome.yaw, startPitch: dome.pitch, targetYaw, targetPitch, startMs: now, durationMs };
                  cameraTargetRef.current = target;
                  userDrivenCameraRef.current = false;
                  dampingRef.current = tokens.cameraDampingDefault;
                  cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
                  beginCameraTween(target, durationMs);
                }
              }
            }
          }
        }
        /*
         * Fly-to (2026-09-25, `DOME_FLY_MS`): the explicit gesture that moves the view.
         * A single click only selects; a double-click or Enter writes `flyRequest` and
         * this frame carries that node to the front and frames its family, on one
         * ease-out clock for pose and camera. Esc / Home write a null request, which
         * flies back to the exact view the first fly-to left from (or, with no flight
         * in effect, to the whole structure at the current pose). Gestures win, as
         * with every programmatic move.
         */
        if (
          dome.flyRequest !== null &&
          domeTargetOn &&
          !dome.orbiting &&
          pointerMachineRef.current.phase !== "dragging"
        ) {
          const request = dome.flyRequest;
          dome.flyRequest = null;
          const { width: vw, height: vh } = viewportRef.current;
          const sameTarget = (a: CameraTarget, b: CameraTarget) =>
            Math.abs(a.tx - b.tx) < 0.01 && Math.abs(a.ty - b.ty) < 0.01 && Math.abs(a.tscale - b.tscale) < 1e-4;
          if (request.unnudge === true) {
            // The selection cleared: undo the click's nudge if the view is still where it put it.
            const back = dome.nudgeReturn;
            dome.nudgeReturn = null;
            if (back !== null && dome.flight === null && sameTarget(cameraTargetRef.current, back.landed)) {
              const target = { ...back.before };
              cameraTargetRef.current = target;
              userDrivenCameraRef.current = false;
              dampingRef.current = tokens.cameraDampingDefault;
              cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
              beginCameraTween(target);
              lastActiveMsRef.current = now;
            }
          } else if (request.nudge === true && request.slug !== null && vw > 0 && vh > 0) {
            /*
             * The click's one allowed move (see `DomeRuntime.flyRequest`): slide sideways
             * until the selected node clears the panels, and nothing else.
             */
            const coord = dome.model.coords.get(request.slug);
            if (coord !== undefined) {
              const at = projectDomeCoord(dome.model, coord, dome.yaw, dome.pitch);
              const measured = cameraTokens(tokens);
              const current = cameraTargetRef.current;
              const toScreenX = (wx: number) => (wx - current.tx) * current.tscale + vw / 2;
              const sx = toScreenX(at.wx);
              const lo = measured.safeInsetLeft + DOME_NUDGE_MARGIN_PX;
              const hi = vw - measured.safeInsetRight - DOME_NUDGE_MARGIN_PX;
              /*
               * The node and what it lights up. Clearing only the node left a domain's own
               * capabilities spreading right, under the panel it had just opened (interaction
               * audit, 2026-09-25: two of its capability names were cut at the panel's edge in
               * Strata at 1040). The slide takes the lit neighbourhood into the free area when it
               * fits, centres it when it does not, and always keeps the node itself clear.
               */
              let eMin = sx;
              let eMax = sx;
              for (const id of world.neighborMap.get(request.slug) ?? []) {
                const c = dome.model.coords.get(id);
                if (c === undefined) continue;
                const x = toScreenX(projectDomeCoord(dome.model, c, dome.yaw, dome.pitch).wx);
                eMin = Math.min(eMin, x);
                eMax = Math.max(eMax, x);
              }
              let shift = 0;
              if (hi > lo) {
                const needAtLeast = eMax - hi;
                const allowAtMost = eMin - lo;
                shift =
                  needAtLeast <= allowAtMost
                    ? Math.min(allowAtMost, Math.max(needAtLeast, 0))
                    : (eMin + eMax) / 2 - (lo + hi) / 2;
                shift = Math.min(sx - lo, Math.max(sx - hi, shift));
              }
              if (Math.abs(shift) > 0.5) {
                const target = { tx: current.tx + shift / current.tscale, ty: current.ty, tscale: current.tscale };
                // Chained nudges keep the first view as the one a deselect returns to.
                const before =
                  dome.nudgeReturn !== null && sameTarget(current, dome.nudgeReturn.landed)
                    ? dome.nudgeReturn.before
                    : { ...current };
                dome.nudgeReturn = { before, landed: { ...target } };
                cameraTargetRef.current = target;
                userDrivenCameraRef.current = false;
                dampingRef.current = tokens.cameraDampingDefault;
                cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
                beginCameraTween(target);
                lastActiveMsRef.current = now;
              }
            }
          } else if (vw > 0 && vh > 0) {
            dome.spinArmed = false;
            commitDomeEntrySweep(dome);
            dome.yawVel = 0;
            dome.pitchVel = 0;
            dome.yawSnap = null;
            const flyCamera = (target: CameraTarget) => {
              cameraTargetRef.current = target;
              userDrivenCameraRef.current = false;
              dampingRef.current = tokens.cameraDampingDefault;
              cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
              beginCameraTween(target, DOME_FLY_MS, "out");
            };
            const flyer = dome;
            const flyPose = (targetYaw: number, targetPitch: number) => {
              flyer.poseTween = {
                startYaw: flyer.yaw,
                startPitch: flyer.pitch,
                targetYaw,
                targetPitch,
                startMs: now,
                durationMs: DOME_FLY_MS,
                ease: "out",
              };
            };
            if (request.slug === null) {
              const back = dome.flight;
              dome.flight = null;
              if (back !== null) {
                flyPose(domeNearestYawTurn(back.returnYaw, dome.yaw), clampDomePitch(back.returnPitch));
                flyCamera({ ...back.returnCamera });
              } else {
                const target = domeFitTarget(dome.model, dome.yaw, dome.pitch, vw, vh, tokens);
                if (target !== null) {
                  dome.fitScale = target.tscale;
                  flyCamera(target);
                }
              }
            } else {
              const coord = dome.model.coords.get(request.slug);
              if (coord !== undefined) {
                const targetYaw = domeFocusYaw(coord, dome.yaw);
                const targetPitch = clampDomePitch(dome.pitch);
                const egoIds = [request.slug, ...(world.neighborMap.get(request.slug) ?? [])];
                const b = domeEgoWorldBounds(dome.model, egoIds, targetYaw, targetPitch);
                if (b !== null) {
                  const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
                  const anchorAtTarget = projectDomeCoord(dome.model, coord, targetYaw, targetPitch);
                  const target = computeDomeFocusCameraTarget(
                    b,
                    cameraTokens(tokens),
                    vw,
                    vh,
                    overviewEntryScale,
                    dome.fitScale,
                    { x: anchorAtTarget.wx, y: anchorAtTarget.wy },
                  );
                  // The first fly-to remembers where the reader was; a second one keeps
                  // that memory, so Esc always lands on the view they chose.
                  dome.flight = {
                    slug: request.slug,
                    returnYaw: dome.flight?.returnYaw ?? dome.yaw,
                    returnPitch: dome.flight?.returnPitch ?? dome.pitch,
                    // A nudge before the flight is the click's, not the reader's: return past it.
                    returnCamera:
                      dome.flight?.returnCamera ??
                      (dome.nudgeReturn !== null && sameTarget(cameraTargetRef.current, dome.nudgeReturn.landed)
                        ? { ...dome.nudgeReturn.before }
                        : { ...cameraTargetRef.current }),
                  };
                  dome.nudgeReturn = null;
                  flyPose(targetYaw, targetPitch);
                  flyCamera(target);
                }
              }
            }
            lastActiveMsRef.current = now;
          }
        }
        // Programmatic pose moves (reset, selection reframe). If an orbit
        // drag starts, the gesture wins and continues from the current pose.
        const pose = dome.poseTween;
        if (pose !== null) {
          if (dome.orbiting) {
            dome.poseTween = null;
          } else {
            const t = (now - pose.startMs) / pose.durationMs;
            if (t >= 1 || reducedMotionRef.current) {
              dome.yaw = pose.targetYaw;
              dome.pitch = pose.targetPitch;
              dome.poseTween = null;
            } else {
              const e = pose.ease === "out" ? easeOutCubic(t) : easeInOutCubic(t);
              const prevPoseYaw = dome.yaw;
              dome.yaw = pose.startYaw + (pose.targetYaw - pose.startYaw) * e;
              dome.pitch = pose.startPitch + (pose.targetPitch - pose.startPitch) * e;
              /*
               * Programmatic moves feed the tier torsion too (see the
               * `DOME_POSE_LAG_SCALE` doc-block). Without it a click reframe
               * turns all four rings as one rigid block, which reads as an
               * object that does not react to its own motion. When the move
               * ends, charging stops and the existing decay unwinds, so the
               * settling wobble on arrival comes for free.
               */
              chargeTierLag(dome.lag, dome.yaw - prevPoseYaw, DOME_POSE_LAG_SCALE);
            }
            dome.yawVel = 0;
            // Drop the landing target too — new input and an explicit reset
            // always win.
            dome.yawSnap = null;
            dome.pitchVel = 0;
            dome.yawTarget = dome.yaw;
            dome.pitchTarget = dome.pitch;
          }
        }
        // While orbiting, follow the pointer-pushed target with τ = 45 ms,
        // which removes the stepping when the event period is longer than the
        // frame period (see the `ORBIT_SMOOTH_TAU_MS` JSDoc). The tier
        // torsion must be charged from the **actual frame movement** to stay
        // in time with that smoothing. Reduced-motion snaps, keeping 1:1
        // direct manipulation.
        if (dome.orbiting) {
          const prevYaw = dome.yaw;
          if (reducedMotionRef.current) {
            dome.yaw = dome.yawTarget;
            dome.pitch = dome.pitchTarget;
          } else {
            const k = 1 - Math.exp(-dtMs / ORBIT_SMOOTH_TAU_MS);
            dome.yaw += (dome.yawTarget - dome.yaw) * k;
            dome.pitch += (dome.pitchTarget - dome.pitch) * k;
            chargeTierLag(dome.lag, dome.yaw - prevYaw);
          }
        }
        if (!dome.orbiting && dome.poseTween === null) {
          /*
           * Carry the release to a meaningful landing, but only when it aimed
           * at a domain meridian (`dome.yawSnap`). τ is derived from the
           * release velocity, so speed does not jump on the frame the pointer
           * lifts (see the `orbitSnapTauMs` doc-block). On arrival it clears
           * its own target and this branch disappears from later frames.
           */
          if (dome.yawSnap !== null) {
            const delta = dome.yawSnap - dome.yaw;
            if (Math.abs(delta) < ORBIT_SNAP_ARRIVE_RAD) {
              dome.yaw = dome.yawSnap;
              dome.yawSnap = null;
              dome.yawVel = 0;
            } else {
              const tau = orbitSnapTauMs(delta, dome.yawVel);
              dome.yaw += delta * (1 - Math.exp(-dtMs / tau));
              // The velocity gauge must keep saying how fast it is turning
              // right now, so decay continues even outside the inertia
              // branch — the disarm check reads it.
              dome.yawVel = decayOrbitVelocity(dome.yawVel, dtMs);
            }
            dome.pitch += dome.pitchVel * dtMs;
            dome.pitchVel = decayOrbitVelocity(dome.pitchVel, dtMs);
            dome.yawTarget = dome.yaw;
            dome.pitchTarget = dome.pitch;
            const clamped = clampDomePitch(dome.pitch);
            if (clamped !== dome.pitch) {
              dome.pitch += (clamped - dome.pitch) * (1 - Math.exp(-dtMs / 120));
              if (Math.abs(clamped - dome.pitch) < 0.0005) dome.pitch = clamped;
              dome.pitchVel = 0;
            }
          } else {
            // Release inertia: the velocity at release carries on and stops
            // under geometric decay.
            dome.yaw += dome.yawVel * dtMs;
            dome.pitch += dome.pitchVel * dtMs;
            dome.yawVel = decayOrbitVelocity(dome.yawVel, dtMs);
            dome.pitchVel = decayOrbitVelocity(dome.pitchVel, dtMs);
            // Pitch rubber-band: past the limit, spring back exponentially.
            const clampedPitch = clampDomePitch(dome.pitch);
            if (clampedPitch !== dome.pitch) {
              dome.pitch += (clampedPitch - dome.pitch) * (1 - Math.exp(-dtMs / 120));
              if (Math.abs(clampedPitch - dome.pitch) < 0.0005) dome.pitch = clampedPitch;
              dome.pitchVel = 0;
            }
          }
          // Auto-spin (48 s per turn) is an attention loop, so it runs
          // **only while armed**: any interaction — orbit, zoom, pinch, node
          // drag, selection — lowers `spinArmed` and it never turns by itself
          // again. Owner: "Stop it turning after I click." It is rearmed by auto-align or by re-entering 3D.
          // It also stops while the pointer is over the canvas, and stays 0
          // under reduced-motion.
          //
          // Its speed is multiplied by the ambient sleep factor — put to
          // sleep, not switched off (`model/ambient-sleep.ts`). 30 s after
          // the hand lets go, rotation ramps to 0 over 2 s; the moment it
          // reaches 0 the activity flag above drops and the idle gate closes.
          // Any input pushes `lastInputMs` and the factor returns to 1 on the
          // next frame, so no wake wiring is needed. A ramp rather than a
          // step for the same reason as the comets: cutting it in one frame
          // reads as the dome having seized.
          const spinFactor = ambientSleepFactor(now, lastInputMsRef.current, ambientSleepDelayRef.current);
          if (
            dome.yawVel === 0 &&
            isDomeSpinAnimating({
              domeOn: domeTargetOn,
              reducedMotion: reducedMotionRef.current,
              ambientAsleep: isAmbientAsleep(spinFactor),
              spinArmed: dome.spinArmed,
              pointerOverCanvas: bgPointerRef.current !== null,
              assembled: dome.rampClock >= DOME_ASSEMBLE_TOTAL_MS,
            })
          ) {
            dome.yaw += (dtMs / DOME_PERIOD_MS) * Math.PI * 2 * spinFactor;
          }
          // Invariant outside a drag: the target always follows the current
          // pose, so the next drag does not inherit a stale target gap.
          dome.yawTarget = dome.yaw;
          dome.pitchTarget = dome.pitch;
        }
        // Tier torsion decay (spring-back) — the hero's elastic torsion.
        const lagDecay = Math.pow(DOME_TIER_LAG_DECAY_PER_MS, dtMs);
        dome.lag.domain = Math.abs(dome.lag.domain) < 1e-5 ? 0 : dome.lag.domain * lagDecay;
        dome.lag.capability = Math.abs(dome.lag.capability) < 1e-5 ? 0 : dome.lag.capability * lagDecay;
        dome.lag.element = Math.abs(dome.lag.element) < 1e-5 ? 0 : dome.lag.element * lagDecay;
        // In-plane node drag: a critically damped spring, reusing the crisp
        // layer's angular frequency.
        if (dome.drag !== null) {
          const coord = dome.model.coords.get(dome.drag.nodeId);
          if (coord === undefined) {
            dome.drag = null;
          } else {
            if (reducedMotionRef.current) {
              dome.drag.spring.px = dome.drag.targetPx;
              dome.drag.spring.pz = dome.drag.targetPz;
              dome.drag.spring.vx = 0;
              dome.drag.spring.vz = 0;
            } else {
              stepDomeDragSpring(
                dome.drag.spring,
                dome.drag.targetPx,
                dome.drag.targetPz,
                dtMs,
                tokens.cameraSpringAngFreqInteractive,
              );
            }
            coord.px = dome.drag.spring.px;
            coord.pz = dome.drag.spring.pz;
            const settled =
              Math.abs(dome.drag.spring.px - dome.drag.targetPx) < 0.05 &&
              Math.abs(dome.drag.spring.pz - dome.drag.targetPz) < 0.05 &&
              Math.abs(dome.drag.spring.vx) < 0.05 &&
              Math.abs(dome.drag.spring.vz) < 0.05;
            if (dome.drag.released === true && (settled || reducedMotionRef.current)) dome.drag = null;
          }
        }
        if (dome.rampClock > 0) {
          // The dot radius denominator — the same formula draw and
          // hit-testing multiply by.
          updateDomeFrame(
            dome,
            world.nodes,
            (n) => {
              const w = world.nodeById.get(n.id);
              return w ? radiusForKind(w.kind, tokens) * w.magnitudeScale : 1;
            },
            now,
            // A cone node is a fixed number of SCREEN pixels, so the zoom has
            // to be divided back out here (`DOME_NODE_PX`).
            cameraRef.current.scale.value,
          );
        } else if (dome.frame.size > 0) {
          dome.frame.clear();
          dome.drawnBounds = null;
          dome.fitScale = null;
          dome.frameEpoch++;
        }
      } else if (dome !== null) {
        dome.active = false;
        // Fully off screen: rest every in-flight motion so the idle gate can
        // fold (see `settleDomeRuntimeOffscreen` — before this, a single 3D
        // visit kept the 2D map awake at 120 frames/s for the whole session).
        settleDomeRuntimeOffscreen(dome);
        domeModelBuildRef.current = null;
        domeFocusPendingRef.current = null;
        if (dome.frame.size > 0) {
          dome.frame.clear();
          dome.drawnBounds = null;
          dome.fitScale = null;
          dome.frameEpoch++;
        }
      }
    }

    return true;
  };
}
