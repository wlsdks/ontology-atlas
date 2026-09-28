"use client";

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { cn } from "@/shared/lib/cn";
import { useDialogFocusTrap } from "@/shared/lib/use-dialog-focus-trap";
import { useHeldValue, usePanelPresence } from "@/shared/lib/use-presence";
import type { UseGuidedTourResult } from "../model/use-guided-tour";
import {
  computeCardPlacement,
  resolveAnchorRect,
  visibleAnchorBox,
  type AnchorBox,
} from "../model/resolve-anchor-rect";
import { GuidedTourCard } from "./GuidedTourCard";

/** Slack between step 4's funnel hole and the probe, absorbing error against the drawn node. */
const TOUR_HOLE_PADDING = 16;
/** The placement function's own default. */
const TOUR_CARD_GAP = 12;
/**
 * The name a canvas node wears under its disc: `LABEL_OFFSET` (project 20) plus one line of
 * the map's label type, less the ring the anchor already adds.
 */
const TOUR_NODE_NAME_BAND = 28;

interface AnchorMeasurements {
  key: string;
  testidRect: AnchorBox | null;
  canvasRect: AnchorBox | null;
}

/**
 * The probe's current box, viewport-tested like the rAF tick. Seeds a canvas-node step before
 * its opening paint: the tick is an effect and runs after that paint, which would otherwise
 * centre the card on the node for one frame.
 */
function readCanvasAnchorBox(ref: RefObject<HTMLDivElement | null> | undefined): AnchorBox | null {
  const el = ref?.current;
  if (!el || typeof window === "undefined") return null;
  const r = el.getBoundingClientRect();
  return visibleAnchorBox(
    { top: r.top, left: r.left, width: r.width, height: r.height },
    window.innerWidth,
    window.innerHeight,
  );
}

export interface GuidedTourOverlayProps {
  tour: UseGuidedTourResult;
  /**
   * The canvas-anchor probe (steps 2 and 4), the div `OntologyMap` writes its per-frame
   * `worldToScreen` transform into. It paints nothing; this overlay draws scrim and cutout at z-70
   * so the dimming also covers outer chrome such as the top toolbar.
   */
  canvasAnchorRef?: RefObject<HTMLDivElement | null>;
  /** Lets a keyboard user perform step 4's canvas node click from the card. */
  onActivateAnchor?: () => void;
  /**
   * Called on a click on the full-screen blocker, so a blocked press withdraws the tour instead
   * of being swallowed silently; the mouse user's Escape.
   */
  onBlockedInteraction?: () => void;
  /**
   * Drawn nodes the step explains, in client px (`computeCardPlacement`'s `avoidRects`); the map
   * supplies them because the feature does not know how a map is drawn.
   */
  readAvoidRects?: (stepId: string) => readonly AnchorBox[];
}

/** Read again once the camera and a freshly opened panel have settled. */
const AVOID_SETTLE_MS = 450;

/**
 * Draws the scrim, cutout, blocker, card and progress dots in one z-70 layer so dimming is
 * uniform. Step 4 blocks with four strips around the cutout (a funnel), so only the spotlit
 * node is clickable and stacking transient UI stays banned.
 */
export function GuidedTourOverlay({
  tour,
  canvasAnchorRef,
  onActivateAnchor,
  onBlockedInteraction,
  readAvoidRects,
}: GuidedTourOverlayProps) {
  const { open: liveOpen, step: liveStep } = tour;
  /*
   * Leaves the way it arrived: the last open state is held through an exit window
   * (`usePanelPresence`) under `.map-overlay-out`, the opacity-only exit that keeps its time
   * under reduced motion, and is inert so nothing answers a press while it fades.
   */
  const liveTour = liveOpen && liveStep ? tour : null;
  const heldTour = useHeldValue(liveTour, liveTour ? liveStep?.id : null);
  const presence = usePanelPresence(liveTour !== null);
  const shownTour = liveTour ?? (presence.mounted ? heldTour : null);
  const exiting = liveTour === null && shownTour !== null;
  const open = shownTour !== null;
  const step = shownTour?.step ?? null;
  /*
   * Keyed by step so a stale read from the previous step never places this one; read on
   * arrival and again after the camera settles.
   */
  const [avoid, setAvoid] = useState<{ step: string | null; rects: readonly AnchorBox[] }>({ step: null, rects: [] });
  const avoidStepId = open ? (step?.id ?? null) : null;
  useEffect(() => {
    if (!avoidStepId || !readAvoidRects) return undefined;
    const read = () => setAvoid({ step: avoidStepId, rects: readAvoidRects(avoidStepId) });
    const first = window.requestAnimationFrame(read);
    const settled = window.setTimeout(read, AVOID_SETTLE_MS);
    window.addEventListener("resize", read);
    return () => {
      window.cancelAnimationFrame(first);
      window.clearTimeout(settled);
      window.removeEventListener("resize", read);
    };
  }, [avoidStepId, readAvoidRects]);
  const overlayRef = useDialogFocusTrap<HTMLDivElement>({
    open: liveOpen,
    initialFocus: "none",
    restoreFocus: false,
  });

  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 1440 : window.innerWidth,
    height: typeof window === "undefined" ? 900 : window.innerHeight,
  }));
  useEffect(() => {
    if (!open) return undefined;
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  // A measurement belongs to one open/step/anchor identity. Resetting by key during render paints
  // the full scrim first, so an old circle or rect never leaks into the new step.
  const anchorKey =
    !open || !step
      ? "closed"
      : step.anchor === null
        ? `${step.id}:none`
        : step.anchor.type === "testid"
          ? `${step.id}:testid:${step.anchor.value}`
          : `${step.id}:canvas:${step.anchor.target}`;
  const [measurements, setMeasurements] = useState<AnchorMeasurements>(() => ({
    key: anchorKey,
    testidRect: null,
    canvasRect: null,
  }));
  if (measurements.key !== anchorKey) {
    setMeasurements({ key: anchorKey, testidRect: null, canvasRect: null });
  }

  // Seeds a canvas-node step from the probe before its first paint (see `readCanvasAnchorBox`).
  // A layout effect, because only a layout effect is guaranteed to run before paint.
  useLayoutEffect(() => {
    if (!open || !step || step.anchor?.type !== "canvas-node" || !canvasAnchorRef) return;
    const box = readCanvasAnchorBox(canvasAnchorRef);
    if (!box) return;
    setMeasurements((current) =>
      current.key === anchorKey && current.canvasRect === null ? { ...current, canvasRect: box } : current,
    );
  }, [anchorKey, open, step, canvasAnchorRef]);

  // testid anchors use a static rect, recomputed on step change and resize; a CSS transition
  // (180ms) moves the cutout.
  useEffect(() => {
    if (!open || !step || step.anchor?.type !== "testid") return undefined;
    const anchorValue = step.anchor.value;
    const recompute = () =>
      setMeasurements((current) =>
        current.key === anchorKey ? { ...current, testidRect: resolveAnchorRect(anchorValue) } : current,
      );
    recompute();
    // Re-check one frame after mount: a panel that just opened may still be sliding in.
    const raf = window.requestAnimationFrame(recompute);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("resize", recompute);
      window.cancelAnimationFrame(raf);
    };
  }, [anchorKey, open, step]);

  // Every `[data-tour-keep-clear]` box (the map's top toolbar), for canvas-node steps only: a DOM
  // anchor may sit inside that box by design. Refreshed on step and resize.
  const [keepClear, setKeepClear] = useState<readonly AnchorBox[]>([]);
  const keepClearActive = open && step?.anchor?.type === "canvas-node";
  useEffect(() => {
    if (!keepClearActive) return undefined;
    const measure = () =>
      setKeepClear(
        [...document.querySelectorAll<HTMLElement>("[data-tour-keep-clear]")]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0)
          .map((r) => ({ top: r.top, left: r.left, width: r.width, height: r.height })),
      );
    const raf = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [keepClearActive, anchorKey]);

  // Canvas node anchors follow every frame with no CSS transition, so they keep the camera
  // spring's rhythm. Unprojected or off-viewport, this is null and the full scrim is the
  // fallback (`visibleAnchorBox`). The viewport is read live from `window`, because this tick
  // runs at frame rate and must not wait for a resize event.
  useEffect(() => {
    if (!open || !step || step.anchor?.type !== "canvas-node") return undefined;
    // Canvas node anchors are map-only; destination guides pass no probe.
    if (!canvasAnchorRef) return undefined;
    let raf = 0;
    const tick = () => {
      const el = canvasAnchorRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const box = visibleAnchorBox(
          { top: r.top, left: r.left, width: r.width, height: r.height },
          window.innerWidth,
          window.innerHeight,
        );
        setMeasurements((current) =>
          current.key === anchorKey ? { ...current, canvasRect: box } : current,
        );
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [anchorKey, open, step, canvasAnchorRef]);

  if (!open || !step || !shownTour) return null;

  const anchorRect =
    step.anchor?.type === "testid"
      ? measurements.testidRect
      : step.anchor?.type === "canvas-node"
        ? measurements.canvasRect
        : null;
  const cardWidth = Math.min(360, viewport.width - 32);
  // Card height is an approximation from rendered heights at 1440×900 (`guided-tour.spec.ts`).
  // Err large: a small estimate can push a "below" placement off the viewport.
  const cardHeight = step.id === "recent" ? 255 : step.interactive ? 250 : 205;
  const placement = computeCardPlacement({
    targetRect: anchorRect,
    cardWidth,
    cardHeight,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    // A canvas node's name hangs under its disc; the card below must clear it.
    belowGap: step.anchor?.type === "canvas-node" ? TOUR_CARD_GAP + TOUR_NODE_NAME_BAND : TOUR_CARD_GAP,
    // The card must also clear the node itself, which the step asks the person to press.
    avoidTarget: step.anchor?.type === "canvas-node",
    keepClear: keepClearActive ? keepClear : undefined,
    avoidRects: avoid.step === step.id ? avoid.rects : undefined,
  });

  const isInteractive = Boolean(step.interactive);
  // Step 4's click funnel: only the cutout's bbox reaches the canvas. The hole is 16px wider on
  // every side than the probe, because the strips are React state one frame behind the drawn
  // node during the camera spring (the "probe center" regression in `guided-tour.spec.ts`).
  const interactiveHole =
    isInteractive && anchorRect
      ? {
          top: anchorRect.top - TOUR_HOLE_PADDING,
          left: anchorRect.left - TOUR_HOLE_PADDING,
          width: anchorRect.width + TOUR_HOLE_PADDING * 2,
          height: anchorRect.height + TOUR_HOLE_PADDING * 2,
        }
      : null;

  return (
    <div
      ref={overlayRef}
      data-testid="guided-tour-overlay"
      data-tour-step={step.id}
      data-state={exiting ? "closed" : "open"}
      inert={exiting}
      className={exiting ? "map-overlay-out fixed inset-0 z-[var(--z-tour)]" : undefined}
    >
      {/*
       * The blocker: other steps block everything; step 4 blocks with four strips around the
       * cutout so only the spotlit node is clickable, since a fully click-through overlay let
       * other transient surfaces stack on the tour. Unresolved, full blocking stays.
       */}
      {interactiveHole ? (
        <>
          <div
            data-testid="guided-tour-blocker-strip"
            className="pointer-events-auto fixed inset-x-0 top-0 z-[var(--z-tour)]"
            style={{ height: Math.max(0, interactiveHole.top) }}
          />
          <div
            data-testid="guided-tour-blocker-strip"
            className="pointer-events-auto fixed left-0 z-[var(--z-tour)]"
            style={{ top: interactiveHole.top, height: interactiveHole.height, width: Math.max(0, interactiveHole.left) }}
          />
          <div
            data-testid="guided-tour-blocker-strip"
            className="pointer-events-auto fixed right-0 z-[var(--z-tour)]"
            style={{
              top: interactiveHole.top,
              height: interactiveHole.height,
              width: Math.max(0, viewport.width - (interactiveHole.left + interactiveHole.width)),
            }}
          />
          <div
            data-testid="guided-tour-blocker-strip"
            className="pointer-events-auto fixed inset-x-0 bottom-0 z-[var(--z-tour)]"
            style={{ height: Math.max(0, viewport.height - (interactiveHole.top + interactiveHole.height)) }}
          />
        </>
      ) : (
        <div
          data-testid="guided-tour-blocker"
          data-blocking="true"
          data-dismissable={onBlockedInteraction ? "true" : undefined}
          onClick={onBlockedInteraction}
          className="pointer-events-auto fixed inset-0 z-[var(--z-tour)]"
        />
      )}

      {step.anchor === null ? (
        <div
          data-testid="guided-tour-scrim"
          className="fixed inset-0 z-[var(--z-tour)] transition-opacity duration-[var(--topology-tour-transition-ms)] ease-[var(--motion-ease)] motion-reduce:transition-none"
          style={{ background: "var(--topology-tour-scrim-surface)" }}
        />
      ) : anchorRect ? (
        <div
          data-testid="guided-tour-cutout"
          data-cutout-shape={step.anchor.type === "canvas-node" ? "circle" : "rect"}
          className={cn(
            "pointer-events-none fixed z-[var(--z-tour)] border",
            step.anchor.type === "canvas-node"
              ? // Follows worldToScreen every frame, so no CSS transition may fight the camera spring. The
                // engine draws the visible ring on the canvas; this is only the dimming hole.
                "rounded-full border-transparent"
              : "rounded-[var(--chrome-radius)] border-[color:var(--color-border-strong)] transition-[top,left,width,height] duration-[var(--topology-tour-transition-ms)] ease-[var(--topology-motion-ease-out)] motion-reduce:transition-none",
          )}
          style={{
            ...(step.anchor.type === "canvas-node"
              ? {
                  top: anchorRect.top,
                  left: anchorRect.left,
                  width: anchorRect.width,
                  height: anchorRect.height,
                }
              : {
                  top: anchorRect.top - 8,
                  left: anchorRect.left - 8,
                  width: anchorRect.width + 16,
                  height: anchorRect.height + 16,
                }),
            // A 9999px spread fills everything outside the cutout. Zero blur and no colour emission, so it
            // is an opaque mask, not the glow ring `.claude/rules/design.md` forbids.
            boxShadow: "0 0 0 9999px var(--topology-tour-scrim-surface)",
          }}
        />
      ) : (
        // Before layout settles, a full scrim rather than a flickering half cutout.
        <div
          data-testid="guided-tour-scrim"
          className="fixed inset-0 z-[var(--z-tour)]"
          style={{ background: "var(--topology-tour-scrim-surface)" }}
        />
      )}

      {/*
       * Remounted per step via `key` and reusing the panel cross-fade keyframes: interpolating
       * position would drag behind the camera spring on canvas-node steps, and without it the
       * card teleported.
       */}
      <GuidedTourCard
        key={step.id}
        tour={shownTour}
        placement={placement}
        width={cardWidth}
        onActivateAnchor={onActivateAnchor}
        style={{ top: placement.top, left: placement.left }}
      />
    </div>
  );
}
