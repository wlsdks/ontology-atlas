import type { MapArrangement } from "@/shared/lib/preferences/map-view-preferences";
import type { CameraAxes, CameraTarget } from "../../engine/camera";
import type { PointerMachineState } from "../../interaction/pointer-state-machine";
import { followOrbitTarget, startOrbitCadence, type OrbitCadence } from "../../model/camera/orbit-cadence";
import {
  CAMERA_TRANSITION_MIN_MS,
  cameraTransitionDurationMs,
  easeInOutCubic,
  easeOutCubic,
  type CameraKeyframe,
  type CameraTweenAltitude,
} from "../../model/camera/camera-easing";
import {
  chargeTierLag,
  commitDomeEntrySweep,
  setDomeFolding,
  DOME_ASSEMBLE_TOTAL_MS,
  DOME_ENTRY_SWEEP_MS,
  DOME_POSE_LAG_SCALE,
  DOME_TIER_LAG_DECAY_PER_MS,
  updateDomeFrame,
} from "../../model/dome-view/frame";
import {
  beginDomeModelBuild,
  DOME_BUILD_SLICE_MS,
  sameDomeLayoutInputs,
  type DomeModelBuild,
} from "../../model/dome-view/model-build";
import {
  clampDomePitch,
  DOME_POSE_MS,
  domeFocusYaw,
  domeNearestYawTurn,
  stepDomeDragSpring,
} from "../../model/dome-view/camera/orbit";
import { domeNudgeSlidePx } from "../../model/dome-view/camera/nudge-slide";
import { stepOrbitRelease } from "../../model/dome-view/camera/orbit-release";
import {
  domeEgoWorldBounds,
  domeWorldBounds,
  projectDomeCoord,
} from "../../model/dome-view/camera/projection";
import {
  beginDomeMorph,
  createDomeRuntime,
  DOME_FLY_MS,
  restDomeAtFit,
  settleDomeRuntimeOffscreen,
  type DomeFitTarget,
  type DomeRuntime,
} from "../../model/dome-view/runtime";
import { followTurnWithZoom } from "../../model/dome-view/camera/turn-follow";
import type { DomeModel } from "../../model/dome-view/dome-shapes";
import type { RealmTransitionState } from "../../model/realm/realm-transition";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { computeOverviewCameraTarget, computeOverviewFitScale } from "../camera/target/fit-targets";
import { computeDomeFocusCameraTarget } from "../camera/target/focus-fit";
import { overviewBoundsFor } from "../camera/topology-overview-fit";
import { dialOverviewFit } from "../world/framing/dial-world-framing";
import { radiusForKind } from "../world/geometry/node-radius";
import { type TopologyWorld } from "../world/topology-world";

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
    settlesOnScreen: boolean;
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
  reducedMotionRef: SourceRef<boolean>;
  lastActiveMsRef: SourceRef<number>;
  viewportRef: SourceRef<{ width: number; height: number; dpr: number; }>;
  beginCameraTween: (target: CameraTarget, durationOverrideMs?: number, ease?: "out", altitude?: CameraTweenAltitude) => void;
  cameraTokens: (tokens: OntologyMapTokens) => OntologyMapTokens;
  domeFitTarget: (
    model: DomeModel,
    yaw: number,
    pitch: number,
    width: number,
    height: number,
    tokens: OntologyMapTokens,
  ) => DomeFitTarget | null;
}

const REST_POSE_EPSILON = 1e-3;

/** Is the camera, or the view a selection move left from, still the whole-cloud fit at its pose? */
function cameraAtRestFit(
  dome: DomeRuntime,
  current: CameraTarget,
  sameTarget: (a: CameraTarget, b: CameraTarget) => boolean,
): boolean {
  const rest = dome.restFit;
  if (rest === null) return false;
  // Turned from a fit with the zoom still following it, the camera is that fit at this yaw.
  const follow = dome.turnFollow;
  if (follow?.followed && sameTarget(current, follow.followed)) return true;
  if (Math.abs(rest.yaw - dome.yaw) > REST_POSE_EPSILON || Math.abs(rest.pitch - dome.pitch) > REST_POSE_EPSILON) return false;
  const view = dome.nudgeReturn !== null && sameTarget(current, dome.nudgeReturn.landed) ? dome.nudgeReturn.before : current;
  return sameTarget(view, rest.target);
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
    reducedMotionRef,
    lastActiveMsRef,
    viewportRef,
    beginCameraTween,
    cameraTokens,
    domeFitTarget,
  } = sources;

  /*
   * Neural's zoom follows the turn while the camera holds its fit (`followTurnWithZoom`), set on camera
   * and target together so it has no motion of its own and rests when the turn does.
   */
  const followTurn = (dome: DomeRuntime) => {
    if (dome.turnFollow === null || dome.poseTween !== null || dome.flight !== null) return;
    const next = followTurnWithZoom(dome.turnFollow, cameraTargetRef.current, dome.yaw);
    if (next === null) return;
    cameraTargetRef.current = next;
    const cam = cameraRef.current;
    cam.x.value = next.tx;
    cam.y.value = next.ty;
    cam.scale.value = next.tscale;
    cam.x.velocity = 0;
    cam.y.velocity = 0;
    cam.scale.velocity = 0;
  };
  let orbitCadence: OrbitCadence | null = null;

  return function runDomeFrameStage(
    now: number,
    dt: number,
    tokens: OntologyMapTokens,
    world: TopologyWorld,
    width: number,
    height: number,
  ): boolean {
    {
      const domeTargetOn = view3dRef.current && realmTransitionRef.current.phase === "idle";
      let dome = domeRuntimeRef.current;
      if (domeTargetOn || (dome !== null && dome.rampClock > 0)) {
        const shown = domeWorldSourceRef.current;
        if (
          dome !== null &&
          shown !== null &&
          shown !== world &&
          dome.model.arrangement === mapArrangementRef.current &&
          sameDomeLayoutInputs(shown as TopologyWorld, world)
        ) {
          domeModelBuildRef.current = null;
          domeWorldSourceRef.current = world;
        }
        if (domeTargetOn && (dome === null || domeWorldSourceRef.current !== world)) {
          let pending = domeModelBuildRef.current;
          if (
            pending !== null &&
            pending.world !== world &&
            pending.arrangement === mapArrangementRef.current &&
            sameDomeLayoutInputs(pending.world as TopologyWorld, world)
          ) {
            pending.world = world;
          }
          let begun = false;
          if (
            pending === null ||
            pending.world !== world ||
            pending.arrangement !== mapArrangementRef.current
          ) {
            const build = beginDomeModelBuild(
              world.nodes.map((n) => ({ id: n.id, kind: n.kind, x: n.x, y: n.y, parentId: n.parentId })),
              /*
               * The coupling arrangement takes **every relation** as
               * input to its angles — which is precisely how it differs
               * from the ownership arrangement, which sees only the
               * containment parent.
               */
              { arrangement: mapArrangementRef.current, edges: world.edges },
            );
            const settlesOnScreen =
              build.step !== null &&
              !reducedMotionRef.current &&
              (dome === null || dome.model.arrangement !== build.model.arrangement || domeWorldSourceRef.current === null);
            pending = { world, arrangement: mapArrangementRef.current, build, settlesOnScreen };
            domeModelBuildRef.current = pending;
            begun = true;
            if (settlesOnScreen && dome === null) {
              dome = createDomeRuntime(build.model);
              domeRuntimeRef.current = dome;
              if (domeTargetOn) {
                domeFitPendingRef.current = true;
                domeFitDurationRef.current = DOME_ASSEMBLE_TOTAL_MS;
              }
            } else if (settlesOnScreen && dome !== null) {
              beginDomeMorph(dome, build.model, now, DOME_POSE_MS);
              dome.drawnBounds = null;
              dome.drag = null;
            }
            if (dome !== null) dome.settling = settlesOnScreen;
          }
          const complete =
            pending.build.step === null || (!(begun && pending.settlesOnScreen) && pending.build.step(DOME_BUILD_SLICE_MS));
          if (!complete) {
            lastActiveMsRef.current = now;
            // Held rather than redrawn: an unchanged model's draw would stack on every slice.
            if (dome !== null && !pending.settlesOnScreen) return false;
          } else {
            domeModelBuildRef.current = null;
            domeWorldSourceRef.current = world;
            if (dome === null) {
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
              dome.settling = false;
              const arrangementChanged = pending.settlesOnScreen || pending.build.model.arrangement !== dome.model.arrangement;
              if (!pending.settlesOnScreen) {
                /*
                 * **The structure stays where it stood.** A selection opens its ancestors in
                 * the flat layout, which rebuilds the world, and the model's anchor
                 * (`centerX/Y`, `unit`) is derived from that flat layout, so a rebuild in the
                 * same arrangement keeps the anchor it was drawn at.
                 */
                if (!arrangementChanged) {
                  pending.build.model.centerX = dome.model.centerX;
                  pending.build.model.centerY = dome.model.centerY;
                  pending.build.model.unit = dome.model.unit;
                }
                beginDomeMorph(dome, pending.build.model, now, reducedMotionRef.current ? 0 : DOME_POSE_MS);
                dome.drawnBounds = null;
                dome.drag = null;
              }
              /*
               * Refit only when the new shape does not fit the viewport at the current zoom,
               * or when the arrangement changed under a camera nobody moved: that camera is
               * the previous shape's own fit, not a zoom the user set.
               */
              const b = domeWorldBounds(dome.model, dome.yaw, dome.pitch);
              if (b !== null) {
                const scale = cameraRef.current.scale.value;
                const spanX = (b.maxX - b.minX) * 1.3 * scale;
                const spanY = (b.maxY - b.minY) * 1.3 * scale;
                if (spanX > width || spanY > height || (arrangementChanged && !userDrivenCameraRef.current)) {
                  domeFitPendingRef.current = true;
                  domeFitDurationRef.current = Math.max(DOME_POSE_MS, DOME_ASSEMBLE_TOTAL_MS - dome.rampClock);
                }
              }
            }
          }
        }
        // A reduced-motion first entry keeps the flat map until its layout is final.
        if (dome === null) return true;
        dome.active = domeTargetOn;
        if (domeFitPendingRef.current && domeTargetOn) {
          domeFitPendingRef.current = false;
          const target = domeFitTarget(dome.model, dome.yaw, dome.pitch, width, height, tokens);
          if (target !== null) {
            cameraTargetRef.current = target;
            // If the fit scale is below the 2D floor, lower the floor to it.
            // Otherwise target ≠ value persists and the wheel anchor computes
            // against a zoom that does not exist (see the `fitScale` JSDoc).
            restDomeAtFit(dome, target);
            userDrivenCameraRef.current = false;
            dampingRef.current = tokens.cameraDampingDefault;
            cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
            /*
             * The fit rides the choreography clock: entry takes the assembly length, an arrangement refit the
             * morph length (`domeFitDurationRef`).
             */
            beginCameraTween(target, domeFitDurationRef.current);
            domeFitDurationRef.current = undefined;
          }
        }
        const dtMs = dt * 1000;
        setDomeFolding(dome, !domeTargetOn);
        if (reducedMotionRef.current) {
          dome.rampClock = domeTargetOn ? DOME_ASSEMBLE_TOTAL_MS : 0;
          /*
           * Under reduced motion there is no entry sweep at all (app-generated motion, so WCAG 2.3.3's direct-manipulation exception
           * does not apply). `commitDomeEntrySweep` is not used: it folds a drawn sweep into the pose, which would add an angle never drawn.
           */
          dome.entryArmed = false;
        } else {
          dome.rampClock = Math.max(
            0,
            Math.min(DOME_ASSEMBLE_TOTAL_MS, dome.rampClock + (domeTargetOn ? dtMs : -dtMs * 1.6)),
          );
          /*
           * The entry sweep runs on its own clock and outlives assembly (`DOME_ENTRY_SWEEP_MS`; tier ramps are low during assembly, so
           * turning barely moves a node); spent, it disarms itself and the branch disappears from later frames.
           */
          if (dome.entryArmed) {
            dome.entryClock += domeTargetOn ? dtMs : dtMs * 4;
            if (dome.entryClock >= DOME_ENTRY_SWEEP_MS) dome.entryArmed = false;
          }
        }

        /*
         * The return fit starts with the teardown and lasts as long; the 2D overview bounds do not depend
         * on the ramp, so the target is known on the first frame.
         */
        if (flatFitPendingRef.current && !domeTargetOn) {
          flatFitPendingRef.current = false;
          const teardownMs = reducedMotionRef.current ? 0 : dome.rampClock / 1.6;
          // Use the same live panel measurement as fit-view; static reservations
          // can send the returning map underneath INDEX before a later fit corrects it.
          const fitTokens = cameraTokens(tokens);
          const flatTarget = computeOverviewCameraTarget(
            overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current),
            width,
            height,
            fitTokens,
            world.nodes.length,
            dialOverviewFit(world),
          );
          cameraTargetRef.current = flatTarget;
          overviewScaleRef.current = computeOverviewFitScale(
            overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current),
            width,
            height,
            fitTokens,
            world.nodes.length,
            dialOverviewFit(world),
          );
          // This is a programmatic move, so it uses the transition easing
          // rather than the interactive spring a preceding wheel gesture left
          // behind — same contract as 2D fit-view.
          userDrivenCameraRef.current = false;
          dampingRef.current = tokens.cameraDampingDefault;
          cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
          beginCameraTween(flatTarget, teardownMs > 0 ? teardownMs : undefined, undefined, "held-at-target");
          lastActiveMsRef.current = now;
        }
        // 3D selection reframe: consume the ticket the focus effect left (`domeFocusPendingRef`). The node may be on the far side, so zoom
        // and pan alone would enlarge it while still occluded: the yaw (to the front) and the camera pan/zoom ride the same cubic
        // ease-in-out clock and arrive together.
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
                restDomeAtFit(dome, target);
                userDrivenCameraRef.current = false;
                dampingRef.current = tokens.cameraDampingDefault;
                cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
                beginCameraTween(target);
              }
            } else {
              // A selection is interaction, so the entry sweep folds into the pose, even for a
              // node with no coordinate (a kind outside the dome model).
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
         * Double-click or Enter writes `flyRequest`; Esc / Home write null, flying back to the view the
         * first fly-to left from. Gestures win over programmatic moves.
         */
        if (
          dome.flyRequest !== null &&
          domeTargetOn &&
          !dome.settling &&
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
          } else if (request.nudge === true && request.slug !== null && vw > 0 && vh > 0 && dome.model.arrangement === "coupling" && cameraAtRestFit(dome, cameraTargetRef.current, sameTarget)) {
            /*
             * At the rest fit Neural lights dependencies across the whole cloud, so the click's move refits
             * the cloud into the area the panels leave free; the same move back when they close. Zoomed or
             * turned, the next branch only slides the selected cell clear.
             */
            const target = domeFitTarget(dome.model, dome.yaw, dome.pitch, vw, vh, tokens);
            if (target !== null && !sameTarget(cameraTargetRef.current, target)) {
              const current = cameraTargetRef.current;
              const before =
                dome.nudgeReturn !== null && sameTarget(current, dome.nudgeReturn.landed)
                  ? dome.nudgeReturn.before
                  : { ...current };
              dome.nudgeReturn = { before, landed: { ...target } };
              dome.turnFollow = { target, yaw: dome.yaw, followed: null };
              dome.fitScale = Math.min(dome.fitScale ?? target.tscale, target.tscale);
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
               * The slide clears the node and its lit neighbourhood: into the free area if it fits, centred if
               * not, always keeping the node itself clear.
               */
              let eMin = sx;
              let eMax = sx;
              const neighbourhood = dome.model.arrangement === "coupling" ? [] : world.neighborMap.get(request.slug) ?? [];
              for (const id of neighbourhood) {
                const c = dome.model.coords.get(id);
                if (c === undefined) continue;
                const x = toScreenX(projectDomeCoord(dome.model, c, dome.yaw, dome.pitch).wx);
                eMin = Math.min(eMin, x);
                eMax = Math.max(eMax, x);
              }
              const shift = domeNudgeSlidePx(sx, eMin, eMax, lo, hi);
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
                  restDomeAtFit(dome, target);
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
              const previousPoseYaw = dome.yaw;
              dome.yaw = pose.startYaw + (pose.targetYaw - pose.startYaw) * e;
              dome.pitch = pose.startPitch + (pose.targetPitch - pose.startPitch) * e;
              chargeTierLag(dome.lag, dome.yaw - previousPoseYaw, DOME_POSE_LAG_SCALE);
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
        if (dome.orbiting) {
          orbitCadence ??= startOrbitCadence(dome.yawTarget, dome.pitchTarget);
          followOrbitTarget(dome, orbitCadence, reducedMotionRef.current);
        } else {
          orbitCadence = null;
        }
        if (!dome.orbiting && dome.poseTween === null) stepOrbitRelease(dome, dtMs);
        followTurn(dome);
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
            (n) => radiusForKind(n.kind, tokens) * n.magnitudeScale,
            now,
            // A cone node is a fixed number of SCREEN pixels, so the zoom has
            // to be divided back out here (`DOME_NODE_PX`).
            cameraRef.current.scale.value,
          );
        } else if (dome.frame.size > 0) {
          dome.frame.clear();
          dome.drawnBounds = null;
          dome.fitScale = null;
          dome.restFit = null;
          dome.frameEpoch++;
        }
      } else if (dome !== null) {
        dome.active = false;
        // Fully off screen: rest every in-flight motion so the idle gate can
        // fold (see `settleDomeRuntimeOffscreen` — before this, a single 3D
        // visit kept the 2D map awake at 120 frames/s for the whole session).
        settleDomeRuntimeOffscreen(dome);
        domeFocusPendingRef.current = null;
        if (dome.frame.size > 0) {
          dome.frame.clear();
          dome.drawnBounds = null;
          dome.fitScale = null;
          dome.restFit = null;
          dome.frameEpoch++;
        }
      }
    }

    return true;
  };
}
