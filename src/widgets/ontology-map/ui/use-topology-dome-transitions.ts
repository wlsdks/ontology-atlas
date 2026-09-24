"use client";

import type { MapArrangement } from "@/shared/lib/appearance-preferences";
import {
  useEffect,
  useRef,
  type RefObject
} from "react";
import {
  DOME_ASSEMBLE_TOTAL_MS,
  type DomeRuntime
} from "../model/dome-view";
import {
  type RealmTransitionState
} from "../model/realm-transition";

interface Dependencies {
  mapArrangementRef: RefObject<MapArrangement>;
  mapArrangement: MapArrangement;
  domeWorldSourceRef: RefObject<unknown>;
  lastActiveMsRef: RefObject<number>;
  view3dRef: RefObject<boolean>;
  view3d: boolean;
  domeFitPendingRef: RefObject<boolean>;
  domeFitDurationRef: RefObject<number | undefined>;
  flatFitPendingRef: RefObject<boolean>;
  domeRuntimeRef: RefObject<DomeRuntime | null>;
  lastInputMsRef: RefObject<number>;
  detailPanelVisible: boolean;
  realmTransitionRef: RefObject<RealmTransitionState>;
  focusedSlugRef: RefObject<string | null>;
}

/** Translate mode, arrangement, and inspector changes into deferred dome camera intents. */
export function useTopologyDomeTransitions({
  mapArrangementRef,
  mapArrangement,
  domeWorldSourceRef,
  lastActiveMsRef,
  view3dRef,
  view3d,
  domeFitPendingRef,
  domeFitDurationRef,
  flatFitPendingRef,
  domeRuntimeRef,
  lastInputMsRef,
  detailPanelVisible,
  realmTransitionRef,
  focusedSlugRef,
}: Dependencies) {

  /*
   * An arrangement change rebuilds **coordinates only** — neither the pose
   * (yaw/pitch) nor the camera is touched. Switching between ownership and
   * coupling changes *where the angles come from*, not *what you are looking
   * at*, so resetting the viewpoint would throw away the angle the user just
   * set.
   *
   * The model is invalidated by clearing `domeWorldSourceRef`: the loop's dome
   * step already has a "world changed, re-solve layout but keep the pose" path,
   * so this reuses it and adds no new branch.
   */
  useEffect(() => {
    if (mapArrangementRef.current === mapArrangement) return;
    mapArrangementRef.current = mapArrangement;
    domeWorldSourceRef.current = null;
    lastActiveMsRef.current = performance.now();
  }, [domeWorldSourceRef, lastActiveMsRef, mapArrangement, mapArrangementRef]);

  useEffect(() => {
    if (view3dRef.current === view3d) return;
    view3dRef.current = view3d;
    /*
     * Turning it on makes the next frame's dome step fit the camera to the dome
     * bbox with a cinematic tween.
     *
     * **Turning it off now fits too.** Owner bug report 2026-08-19: *"Switching from 3D back to 2D comes out oddly small"* (switching from 3D back to 2D
     * comes out oddly small).
     *
     * The old reasoning — nodes morph back into place, so nothing jumps —
     * holds only when the 3D camera matches the 2D framing, and it almost never
     * does: the dome fit scale is far lower than the 2D overview (0.315 vs
     * 0.978), and selection reframes, user pans and cloud placement each move
     * it again. Returning to 2D then moves only the nodes, **leaving the camera
     * where 3D put it**. At that zoom semantic zoom also collapses the shapes
     * to circles and hides the engraved counts, so it reads as a different
     * screen rather than a smaller one.
     *
     * It failed to reproduce in the browser a few times because returning was a
     * **side effect of another effect rather than a guaranteed behaviour**, so
     * some paths happened to land right. This makes the accident a contract.
     */
    domeFitPendingRef.current = view3d;
    if (view3d) domeFitDurationRef.current = DOME_ASSEMBLE_TOTAL_MS;
    if (!view3d) flatFitPendingRef.current = true;
    // Re-entering 3D restarts an untouched screen, so rearm the attention spin
    // (the rule that lowers it on interaction is in the spinArmed JSDoc) and
    // the entry sweep — re-entry is a fresh appearance. The sweep is tied to
    // the assembly clock (`domeEntrySweep`), so it only means anything at this
    // moment, when that clock restarts from 0.
    if (view3d && domeRuntimeRef.current !== null) {
      domeRuntimeRef.current.spinArmed = true;
      domeRuntimeRef.current.entryArmed = true;
      domeRuntimeRef.current.entryClock = 0;
    }
    lastInputMsRef.current = performance.now();
    lastActiveMsRef.current = lastInputMsRef.current;
  }, [domeFitDurationRef, domeFitPendingRef, domeRuntimeRef, flatFitPendingRef, lastActiveMsRef, lastInputMsRef, view3d, view3dRef]);

  // In 3D, the detail panel opening or closing is a resize event as far as the
  // camera is concerned. Owner, 2026-08-18: *"The camera should account for where
  // the panel is and settle at a good size by itself."* (the camera should account for where
  // the panel is and settle at a good size by itself). If the flip arrives
  // while a selection is live, the selected node is reframed against the new
  // visible-area insets on the same cinematic tween — never a teleport.
  //
  // The value is mount-based, so a close arrives after the exit animation ends,
  // once the panel has left the DOM and the measured insets are true. 2D does
  // not use this event: the 2D focus target already accounts for the panel
  // insets at selection time, and closing the panel *is* deselection, so there
  // is no separate reframing point.
  const lastDetailPanelVisibleRef = useRef(detailPanelVisible);

  useEffect(() => {
    if (lastDetailPanelVisibleRef.current === detailPanelVisible) return;
    lastDetailPanelVisibleRef.current = detailPanelVisible;
    if (!view3dRef.current || realmTransitionRef.current.phase !== "idle") return;
    const dome = domeRuntimeRef.current;
    if (dome === null) return;
    const slug = focusedSlugRef.current;
    if (slug === null) return;
    /*
     * Since 2026-09-25 a click only selects in 3D, and the panel a click opens must not
     * reframe the view by the back door: no zoom, no turn. A node a fly-to framed is re-flown
     * against the new free area (its return view kept); any other selected node gets only
     * the nudge — a sideways slide, and only when the panel would cover it (measured on the
     * sample vault in Neural at 1440: a domain near the right edge sat under its own panel).
     */
    dome.flyRequest = dome.flight !== null && dome.flight.slug === slug ? { slug } : { slug, nudge: true };
    lastActiveMsRef.current = performance.now();
  }, [detailPanelVisible, domeRuntimeRef, focusedSlugRef, lastActiveMsRef, realmTransitionRef, view3dRef]);

}
