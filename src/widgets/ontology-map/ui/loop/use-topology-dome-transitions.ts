"use client";

import type { MapArrangement } from "@/shared/lib/preferences/appearance-preferences";
import {
  useEffect,
  useRef,
  type RefObject
} from "react";
import { DOME_ASSEMBLE_TOTAL_MS } from "../../model/dome-view/frame";
import type { DomeRuntime } from "../../model/dome-view/runtime";
import {
  type RealmTransitionState
} from "../../model/realm/realm-transition";

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
     * Turning 3D on fits the camera to the dome bbox with a cinematic tween. Turning it off fits too:
     * the 3D camera rarely matches the 2D framing, so otherwise the map returns tiny, shapes collapsed.
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

  // In 3D, the detail panel opening or closing counts as a resize: a live selection is reframed
  // against the new insets on the same tween. The value is mount-based, so a close arrives after exit.
  // 2D does not use it: its focus target already accounts for panel insets.
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
     * A click only selects in 3D and must not reframe: a fly-to-framed node is re-flown against the new
     * free area; any other selected node only slides sideways, and only if the panel would cover it.
     */
    dome.flyRequest = dome.flight !== null && dome.flight.slug === slug ? { slug } : { slug, nudge: true };
    lastActiveMsRef.current = performance.now();
  }, [detailPanelVisible, domeRuntimeRef, focusedSlugRef, lastActiveMsRef, realmTransitionRef, view3dRef]);

}
