"use client";

import {
  useEffect,
  type RefObject
} from "react";
import type { CameraTarget } from "../engine/camera";
import {
  collectCanvasObstacles,
  computeFreeArea,
  type Rect
} from "../interaction/free-area";
import {
  commitDomeEntrySweep,
  type DomeRuntime
} from "../model/dome-view";
import { galaxyInspectionTarget } from "../model/galaxy-inspection-camera";
import { isPathTargetPick, type TopologyMapLensKind } from "../model/path-lens";
import {
  type RealmTransitionState
} from "../model/realm-transition";
import { computeEffectiveCameraScaleMax, computeFocusCameraTarget, computeOverviewCameraTarget, focusLeashPx, type FocusLeashPx } from "./topology-camera-math";
import {
  overviewBoundsFor
} from "./topology-overview-fit";
import { readOntologyMapTokensOrNull } from "./topology-read-tokens";
import { realmCameraTarget, realmVisibleBounds, type RealmRuntimeData } from "./topology-realm-runtime";
import { computePathPickBounds, type TopologyWorld } from "./topology-world";

interface Dependencies {
  lastFocusedSlugRef: RefObject<string | null>;
  focusedSlug: string | null;
  egoRevealBatchesRef: RefObject<number>;
  selectionPulseRef: RefObject<{ nodeId: string; startAtMs: number; } | null>;
  galaxyRef: RefObject<boolean>;
  cameraTargetRef: RefObject<CameraTarget>;
  galaxyInspectionCameraRef: RefObject<{ returnTarget: CameraTarget; focusTarget: CameraTarget; gestureRevision: number; } | null>;
  constellationFocusId: string | null;
  cameraGestureRevisionRef: RefObject<number>;
  userDrivenCameraRef: RefObject<boolean>;
  dampingRef: RefObject<number>;
  cameraAngularFreqRef: RefObject<number | null>;
  lastActiveMsRef: RefObject<number>;
  beginCameraTween: (target: CameraTarget, durationOverrideMs?: number) => void;
  focusedSlugRef: RefObject<string | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  worldRef: RefObject<TopologyWorld | null>;
  viewportRef: RefObject<{ width: number; height: number; dpr: number; }>;
  overviewScaleRef: RefObject<number>;
  view3dRef: RefObject<boolean>;
  realmTransitionRef: RefObject<RealmTransitionState>;
  domeRuntimeRef: RefObject<DomeRuntime | null>;
  realmDataRef: RefObject<RealmRuntimeData | null>;
  expandedParentsRef: RefObject<ReadonlySet<string>>;
  cameraTokens: <T extends { safeInsetLeft: number; safeInsetRight: number; }>(tokens: T) => T;
  focusLeashPxRef: RefObject<FocusLeashPx | null>;
  overviewFitRef: RefObject<"full" | "spine">;
  clusteredIdsRef: RefObject<ReadonlySet<string>>;
  mapLensKindRef: RefObject<TopologyMapLensKind>;
  spotlightIdsRef: RefObject<ReadonlySet<string> | null>;
}

/** Own focus camera transitions and reversible inspection targets. */
export function useTopologyFocusNavigation({
  lastFocusedSlugRef,
  focusedSlug,
  egoRevealBatchesRef,
  selectionPulseRef,
  galaxyRef,
  cameraTargetRef,
  galaxyInspectionCameraRef,
  constellationFocusId,
  cameraGestureRevisionRef,
  userDrivenCameraRef,
  dampingRef,
  cameraAngularFreqRef,
  lastActiveMsRef,
  beginCameraTween,
  focusedSlugRef,
  canvasRef,
  worldRef,
  viewportRef,
  overviewScaleRef,
  view3dRef,
  realmTransitionRef,
  domeRuntimeRef,
  realmDataRef,
  expandedParentsRef,
  cameraTokens,
  focusLeashPxRef,
  overviewFitRef,
  clusteredIdsRef,
  mapLensKindRef,
  spotlightIdsRef,
}: Dependencies) {

  // --- focused slug change — spring-dive to the ego bbox, or back to overview when cleared ---
  useEffect(() => {
    if (lastFocusedSlugRef.current === focusedSlug) return;
    lastFocusedSlugRef.current = focusedSlug;
    // A new focus starts from the top-ranked neighbours again, discarding
    // batches opened by chip clicks.
    egoRevealBatchesRef.current = 1;

    // A NEW selection (never a deselect) starts
    // the one-shot commit pulse. Captured unconditionally (before the
    // tokens/world early-return below) so the pulse timestamp is never
    // skipped even if the camera-target computation bails out for some
    // reason.
    selectionPulseRef.current = focusedSlug !== null ? { nodeId: focusedSlug, startAtMs: performance.now() } : null;

    /*
     * Galaxy inspection approaches the selected star without rebuilding or
     * collapsing the graph. It never zooms out a camera the reader already
     * brought closer. Its paired return target is retained here, so close
     * reverses the approach; if another camera action changes the target
     * meanwhile, it wins and the saved context is discarded.
     */
    if (galaxyRef.current) {
      const sameTarget = (a: CameraTarget, b: CameraTarget) =>
        Math.abs(a.tx - b.tx) < 0.01 &&
        Math.abs(a.ty - b.ty) < 0.01 &&
        Math.abs(a.tscale - b.tscale) < 0.0001;
      const currentTarget = cameraTargetRef.current;

      if (focusedSlug === null) {
        const inspection = galaxyInspectionCameraRef.current;
        galaxyInspectionCameraRef.current = null;
        // A saved-constellation focus intentionally replaces single-node
        // inspection in the same render. Let its safe-area fit own the camera;
        // restoring the inspection target here would race and overwrite it.
        if (constellationFocusId !== null) return;
        if (!inspection || inspection.gestureRevision !== cameraGestureRevisionRef.current) return;
        if (sameTarget(currentTarget, inspection.returnTarget)) return;
        const tokens = readOntologyMapTokensOrNull();
        if (!tokens) return;
        cameraTargetRef.current = inspection.returnTarget;
        userDrivenCameraRef.current = false;
        dampingRef.current = tokens.cameraDampingDefault;
        cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
        lastActiveMsRef.current = performance.now();
        beginCameraTween(inspection.returnTarget);
        return;
      }

      /*
       * A path's source is selected so the target can be picked, and every other star is a
       * candidate: approaching the source would carry the candidates off the frame. The
       * camera the reader has stays (`computePathPickBounds` is the flat map's answer).
       */
      if (isPathTargetPick(mapLensKindRef.current, focusedSlug, spotlightIdsRef.current)) return;

      const previous = galaxyInspectionCameraRef.current;
      const returnTarget =
        previous && previous.gestureRevision === cameraGestureRevisionRef.current
          ? previous.returnTarget
          : { ...currentTarget };
      galaxyInspectionCameraRef.current = {
        returnTarget,
        focusTarget: { ...currentTarget },
        gestureRevision: cameraGestureRevisionRef.current,
      };

      // Wait one frame for the selected-node inspector to enter the DOM, then
      // measure the actual free rectangle. No panel width is baked into canvas
      // logic, and an already-clear star produces the identical target.
      const raf = requestAnimationFrame(() => {
        if (focusedSlugRef.current !== focusedSlug) return;
        const canvasEl = canvasRef.current;
        const world = worldRef.current;
        const tokens = readOntologyMapTokensOrNull();
        const node = world?.nodeById.get(focusedSlug);
        const { width, height } = viewportRef.current;
        if (!canvasEl || !world || !tokens || !node || width <= 0 || height <= 0) return;
        const box = canvasEl.getBoundingClientRect();
        const canvasRect: Rect = { x: box.x, y: box.y, width: box.width, height: box.height };
        const freeArea = computeFreeArea(canvasRect, collectCanvasObstacles(canvasEl, canvasRect));
        const source = cameraTargetRef.current;
        const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
        const focusScale = Math.min(
          computeEffectiveCameraScaleMax(
            overviewEntryScale,
            tokens.cameraMaxZoomRatio,
            tokens.cameraScaleMax,
          ),
          overviewEntryScale * (tokens.focusMaxZoomRatio ?? 1),
        );
        const target = galaxyInspectionTarget({
          camera: source,
          node,
          viewport: { width, height },
          canvasRect,
          freeArea,
          targetScale: focusScale,
        });
        const inspection = galaxyInspectionCameraRef.current;
        if (!inspection || focusedSlugRef.current !== focusedSlug) return;
        // A direct camera gesture during the one-frame panel measurement wins.
        // Internal world rebuilds may change camera targets, but they do not
        // advance this revision and therefore cannot replace return context.
        if (inspection.gestureRevision !== cameraGestureRevisionRef.current) return;
        inspection.focusTarget = target;
        if (sameTarget(source, target)) return;
        cameraTargetRef.current = target;
        userDrivenCameraRef.current = false;
        dampingRef.current = tokens.cameraDampingDefault;
        cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
        lastActiveMsRef.current = performance.now();
        beginCameraTween(target);
      });
      return () => cancelAnimationFrame(raf);
    }

    // In 3D the camera target is NOT computed here. The 2D formula
    // (`computeFocusCameraTarget`) works from a node's **2D coordinates**,
    // which differ from where the dome drew it; and at this point the selection
    // may still be expanding ancestor clusters while the world rebuilds, so it
    // fails silently (measured 2026-08-18: selecting in 3D never moved the
    // camera scale once). Record a ticket instead, and let the loop's dome step
    // set up the yaw reframe and camera tween together against the live world.
    /*
     * **In 3D a click only selects** (2026-09-25, lit 3D). The camera and the pose stay where
     * the reader put them; flying to a node is its own gesture — a double-click or Enter,
     * consumed by the dome frame (`DOME_FLY_MS`). A selection still stops the attention
     * spin ("stop it turning after I click"), so nothing slides out from under a focus.
     * The only click-made move, the nudge off the inspector, is undone on deselect.
     * A deselect does not fly back either: Esc and Home do, and a click on empty space is a
     * click.
     */
    if (view3dRef.current && realmTransitionRef.current.phase === "idle" && domeRuntimeRef.current !== null) {
      const dome = domeRuntimeRef.current;
      if (focusedSlug !== null) {
        dome.spinArmed = false;
        commitDomeEntrySweep(dome);
      } else if (dome.nudgeReturn !== null) {
        // The one exception: a click's nudge off the inspector is undone with the selection.
        dome.flyRequest = { slug: null, unnudge: true };
      }
      lastActiveMsRef.current = performance.now();
      return;
    }

    const effectTokens = readOntologyMapTokensOrNull();
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!effectTokens || !world || width <= 0 || height <= 0) return;

    const overviewEntryScale = overviewScaleRef.current * effectTokens.overviewEntryRatio;
    // Inside a realm the ego bbox is restricted to realm members, so a
    // flung-out neighbour beyond the warding ring cannot inflate the bbox and
    // throw the camera off screen. The focus dive stays inside the ring.
    const realmActive = realmTransitionRef.current.phase !== "idle";
    const realmData = realmDataRef.current;
    // Deselecting by clicking the floor inside a realm used to send the camera
    // flying: `computeFocusCameraTarget`'s null branch works from the **global**
    // spineBounds, which does not match the realm layout's coordinate space
    // (origin 0,0). While a realm is active, the deselect return target is the
    // realm's content bbox over its visible members — the current realm fit,
    // not `entryCamera`, which belongs to leaving the realm.
    /*
     * ⚠️ **The target computation itself waits one frame.**
     *
     * The popover to avoid is opened by *this very selection*, so it is not in
     * the DOM while this effect runs. Measuring insets then reports 0 on the
     * right and the correction vanishes — which the gate caught exactly ("free
     * 127px, screen 64px"). So measuring and computing happen in the same
     * frame.
     *
     * One frame (≈16 ms) ahead of a 200–420 ms move is invisible, and the
     * one-input-one-event gate holds that gap to a frame count.
     */
    const raf = requestAnimationFrame(() => {
      /*
       * The lanes are read in this frame too, not only the panels. A selection folds
       * INDEX, and the page refreshes `--map-safe-inset-left` for it in an effect that
       * runs after this one: read before the frame, the lane still said INDEX was open
       * (376 against the tab's 78), so a path's source framed the map 150 px right of
       * the free map's centre at 1512×949 (measured 2026-09-26).
       */
      const tokens = readOntologyMapTokensOrNull() ?? effectTokens;
      let target: CameraTarget | null;
      if (focusedSlug === null && realmActive && realmData) {
        const bounds = realmVisibleBounds(
          world,
          realmData,
          new Set([...expandedParentsRef.current, realmData.rootId]),
          tokens,
        );
        target = realmCameraTarget(bounds, tokens, width, height);
      } else {
        const realmMembers = realmActive ? realmData?.memberIds ?? null : null;
        /*
         * Selection entry avoids the actual width of the just-opened inspector. Conversely, selection exit
         // must not avoid the final overview even if the inspector **still remains in the DOM during
         // its exit animation**. Previously both directions recalculated via `cameraTokens()`,
         // leaving the graph left by half the inspector's width (measured approx. 192px) after closing.
         *
         // The exit destination is the safe area after the panel disappears, so use the canonical CSS token;
         // the selection destination uses measured tokens including current actual obstacles. This is a
         // difference in entry/exit states for one condition, not a separate correction value.
         */
        const focusTokens = focusedSlug === null ? tokens : cameraTokens(tokens);
        // The physics keeps the same leash this target is clamped to: half the
        // free width less the edge pad, measured against the panels open now.
        focusLeashPxRef.current =
          focusedSlug === null
            ? null
            : focusLeashPx(width, height, {
              left: focusTokens.safeInsetLeft,
              right: focusTokens.safeInsetRight,
              top: focusTokens.safeInsetTop,
              bottom: focusTokens.safeInsetBottom,
            });
        const overviewBounds = overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current);
        target =
          focusedSlug !== null && !realmActive && isPathTargetPick(mapLensKindRef.current, focusedSlug, spotlightIdsRef.current)
            ? // A path's source waits for its target: frame the map the target is picked
              // from, the source's own neighbours included, rather than dive into them.
              computeOverviewCameraTarget(
                computePathPickBounds(world, tokens, focusedSlug, overviewBounds, expandedParentsRef.current),
                width,
                height,
                focusTokens,
                world.nodes.length,
              )
            : computeFocusCameraTarget(world, focusTokens, width, height, focusedSlug, overviewEntryScale, realmMembers, overviewBounds);
      }
      if (!target) return;
      /*
       * **Aim at a spot the panel does not cover.** Owner, 2026-08-10:
       * "It must not be covered — centre it in the space left over after the panel."
       *
       * Selecting a node opens a popover on the right while this target is
       * computed against the **viewport centre**, so the selected node could end
       * up behind the panel explaining it. Measured at 1512×982: canvas x64
       * w1448, popover x1128 w352 — the free area's centre is **192 px left** of
       * the screen centre. The overview path already dodged the panels; the
       * selection path did not, and this is that one place.
       *
       * The panel width is measured from the DOM, not pinned: a pinned value
       * drifts silently the day the panel changes. It runs per selection, not per
       * frame.
       */
      const finalTarget = target;
      dampingRef.current = tokens.cameraDampingDefault;
      cameraTargetRef.current = finalTarget;
      userDrivenCameraRef.current = false;
      // Dive-zoom fix — focus dive AND deselect-return are both PROGRAMMATIC
      // camera moves (this effect fires for both directions of `focusedSlug`
      // changing), so both ease via the cubic transition tween (reduced-motion →
      // spring/snap).
      cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
      lastActiveMsRef.current = performance.now();
      beginCameraTween(finalTarget);
    });
    return () => cancelAnimationFrame(raf);
  }, [focusedSlug, beginCameraTween, cameraTokens, constellationFocusId, lastFocusedSlugRef, egoRevealBatchesRef, selectionPulseRef, galaxyRef, view3dRef, realmTransitionRef, domeRuntimeRef, worldRef, viewportRef, overviewScaleRef, realmDataRef, cameraTargetRef, galaxyInspectionCameraRef, cameraGestureRevisionRef, userDrivenCameraRef, dampingRef, cameraAngularFreqRef, lastActiveMsRef, focusedSlugRef, canvasRef, expandedParentsRef, focusLeashPxRef, overviewFitRef, clusteredIdsRef, mapLensKindRef, spotlightIdsRef]);

}
