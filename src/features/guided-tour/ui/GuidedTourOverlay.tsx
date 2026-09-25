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

/** Slack between step 4's funnel hole and the probe — absorbs momentary error against the visual node. */
const TOUR_HOLE_PADDING = 16;
/** The card's distance from its anchor (the placement function's own default). */
const TOUR_CARD_GAP = 12;
/**
 * The name a canvas node wears under its disc: `LABEL_OFFSET` (project 20) plus
 * one line of the map's label type, less the ring the anchor already adds.
 * Measured 2026-09-19 at step 4: the hub's name ran 465–484 while the anchor
 * ended at 462, and the card at the plain gap started at 474.
 */
const TOUR_NODE_NAME_BAND = 28;

interface AnchorMeasurements {
  key: string;
  testidRect: AnchorBox | null;
  canvasRect: AnchorBox | null;
}

/**
 * The probe's box as it stands right now, viewport-tested the same way the rAF tick tests it.
 *
 * Used to seed a canvas-node step at the moment it opens. The tick that follows the node every
 * frame is an effect, so it first runs *after* the step's opening paint — and for that paint
 * `canvasRect` was null, which is the placement function's "no target" case: a card centred on
 * the window. Measured at 1200×863, that is exactly the reported rectangle (x 420–780,
 * y 307–555) sitting on the node the copy asks the person to press, and it jumped aside one
 * frame later. The probe div is shared and already carries the last frame the map wrote, so
 * reading it here costs one `getBoundingClientRect` and removes the frame.
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
   * The measurement probe for canvas node anchors (steps 2 and 4) — the same div
   * `OntologyMap` writes its per-frame `worldToScreen` transform into (HomePage
   * creates it and passes it to both). The probe itself paints nothing: the scrim
   * and cutout circle are drawn by this overlay at z-70 (2026-07-23 correction —
   * a z-40 scrim inside the widget could not cover outer chrome such as the top
   * toolbar, so the testid steps and the dimming disagreed).
   */
  canvasAnchorRef?: RefObject<HTMLDivElement | null>;
  /** Lets a keyboard user perform step 4's canvas node click from a button in the card. */
  onActivateAnchor?: () => void;
  /**
   * The response to pressing a blocked spot. When supplied, a click on the
   * full-screen blocker calls this.
   *
   * Why it was needed (audit 2026-07-27): while the docs surface's first-visit
   * guide was open, pressing any other navigation **swallowed the click with no
   * response at all** (confirmed over four seconds). With no cursor change, no
   * toast, and no shake, a user reads that as "broken" rather than "blocked" and
   * simply closes it. Esc already closed it, but someone arriving with a mouse
   * had no door — clicking the scrim is the standard exit for a surface that
   * covers the screen.
   */
  onBlockedInteraction?: () => void;
}

/**
 * Draws the scrim, cutout, blocker, card, and progress dots. Every step's scrim
 * and cutout are drawn in the same z-70 layer, so the dimming is uniform. The
 * interactive step (4) is not fully click-through but a **four-strip blocker
 * around the cutout** (a funnel) — chrome other than the spotlit node (the tour
 * tile, search, the toolbar) stays blocked, satisfying the ban on stacked
 * transient UI.
 */
export function GuidedTourOverlay({
  tour,
  canvasAnchorRef,
  onActivateAnchor,
  onBlockedInteraction,
}: GuidedTourOverlayProps) {
  const { open: liveOpen, step: liveStep } = tour;
  /*
   * **It leaves the way it arrived** (2026-09-25). The card fades in over about 100ms,
   * but on Escape or finish the whole overlay went from present to absent in one frame
   * (11–13ms measured). The last open state is held through an exit window
   * (`usePanelPresence`), drawn under `.map-overlay-out` — the map's opacity-only exit,
   * which keeps its time under reduced motion — and made inert, so nothing in it
   * answers a press while it fades.
   */
  const liveTour = liveOpen && liveStep ? tour : null;
  const heldTour = useHeldValue(liveTour, liveTour ? liveStep?.id : null);
  const presence = usePanelPresence(liveTour !== null);
  const shownTour = liveTour ?? (presence.mounted ? heldTour : null);
  const exiting = liveTour === null && shownTour !== null;
  const open = shownTour !== null;
  const step = shownTour?.step ?? null;
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

  // A measurement belongs to one specific open/step/anchor identity. Resetting it
  // by key during render makes an anchor-type transition paint the full scrim first;
  // an old canvas circle or DOM rect can never leak into the new step.
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

  // Seed a canvas-node step from the probe **before the step's first paint** — see
  // `readCanvasAnchorBox` for what that frame looked like without it. A layout effect, not the
  // rAF tick below, because only a layout effect is guaranteed to run before the browser paints.
  useLayoutEffect(() => {
    if (!open || !step || step.anchor?.type !== "canvas-node" || !canvasAnchorRef) return;
    const box = readCanvasAnchorBox(canvasAnchorRef);
    if (!box) return;
    setMeasurements((current) =>
      current.key === anchorKey && current.canvasRect === null ? { ...current, canvasRect: box } : current,
    );
  }, [anchorKey, open, step, canvasAnchorRef]);

  // testid anchors use a static rect, fixed once layout settles. Recomputed only
  // on step change and resize — moving the cutout is handled by a CSS
  // `transition` (180ms).
  useEffect(() => {
    if (!open || !step || step.anchor?.type !== "testid") return undefined;
    const anchorValue = step.anchor.value;
    const recompute = () =>
      setMeasurements((current) =>
        current.key === anchorKey ? { ...current, testidRect: resolveAnchorRect(anchorValue) } : current,
      );
    recompute();
    // Re-check one frame after mount — a panel that just opened (the datasheet,
    // say) may not be at its final size on the first tick because of the slide-in.
    const raf = window.requestAnimationFrame(recompute);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("resize", recompute);
      window.cancelAnimationFrame(raf);
    };
  }, [anchorKey, open, step]);

  // What the card must not cover: every `[data-tour-keep-clear]` box on the page (the
  // map's top toolbar). Read for canvas-node steps only — a DOM anchor may sit inside
  // that box, and its card stands beside it by design. Refreshed on step and resize.
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

  // Canvas node anchors follow every frame (inheriting the camera spring's
  // rhythm, no CSS transition). While the probe is still unprojected (zero-size)
  // — or while the node it tracks is panned outside the viewport — this is null
  // and the full scrim is the fallback.
  //
  // The viewport half of that test is `visibleAnchorBox` (round 4, 2026-09-04).
  // Size alone was not enough: a first domain sitting off-screen produced a real
  // rect, so the cutout and the four blocker strips were laid out outside the
  // window and the person saw one uniformly dark screen while the copy promised a
  // lit dot. The viewport is read live from `window` rather than from the
  // `viewport` state, because this tick already runs at frame rate and must not
  // wait a resize event to notice that the anchor left the screen.
  useEffect(() => {
    if (!open || !step || step.anchor?.type !== "canvas-node") return undefined;
    // Canvas node anchors are map-only — destination guides pass no probe.
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
  // The card's real height is auto from its content; layout only needs an
  // approximation (the card is pinned by `top`/`left` and grows to fit, with the
  // clamp leaving slack). The constants come from measurements at 1440×900
  // (2026-07-24 tour polish pass, rendered card heights for all eight steps via
  // Playwright `guided-tour.spec.ts`) — erring slightly large is the safe
  // direction, since erring small can push a "below" placement's real bottom off
  // the viewport. The previous constants overestimated try-click by 36.5px
  // (220px vs a measured 183.5px — safe but with needlessly large slack) and
  // underestimated recent by 11.5px (240px vs a measured 251.5px).
  // 2026-09-04: try-click's body now names the ring, so its rendered card grew to
  // 248px at 1440x900 (measured). 195 underestimated it by 53px, the direction the
  // note above calls unsafe for a "below" placement, so the interactive constant
  // moves to 250.
  const cardHeight = step.id === "recent" ? 255 : step.interactive ? 250 : 205;
  const placement = computeCardPlacement({
    targetRect: anchorRect,
    cardWidth,
    cardHeight,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    // A canvas node's name hangs under its disc; the card below must clear it.
    belowGap: step.anchor?.type === "canvas-node" ? TOUR_CARD_GAP + TOUR_NODE_NAME_BAND : TOUR_CARD_GAP,
    // And the card must clear the node itself, not only its name: this step asks the person to
    // look at that dot and press it.
    avoidTarget: step.anchor?.type === "canvas-node",
    keepClear: keepClearActive ? keepClear : undefined,
  });

  const isInteractive = Boolean(step.interactive);
  // The interactive (step 4) click funnel — only the cutout circle's bbox passes
  // through to the canvas. The hole is opened 16px wider on every side than the
  // probe rect, absorbing the momentary error between the strips (React state,
  // one frame behind) and the drawn node while the camera spring is running, so
  // "I pressed the bright node and nothing happened" cannot occur (hardened from
  // live observation 2026-07-24; the "probe center" regression in `guided-tour.spec.ts`).
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
      {/* The blocker — non-interactive steps block everything (the scrim is the
          evidence of dimming, satisfying the modal-without-modality rule). The
          interactive step (4) is not fully click-through but blocks with four
          strips around the cutout bbox: only the spotlit node is clickable while
          the rest of the chrome (tour tile re-entry, search, "?", toolbar) is
          blocked (2026-07-23 correction — a fully `pointer-events-none` overlay
          allowed other transient surfaces to stack on top of the tour). While the
          hole is still unresolved, full blocking stays (a one-frame fallback). */}
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
          className="fixed inset-0 z-[var(--z-tour)] transition-opacity duration-[var(--topology-tour-transition-ms)] ease-[var(--topology-motion-ease-out)] motion-reduce:transition-none"
          style={{ background: "var(--topology-tour-scrim-surface)" }}
        />
      ) : anchorRect ? (
        <div
          data-testid="guided-tour-cutout"
          data-cutout-shape={step.anchor.type === "canvas-node" ? "circle" : "rect"}
          className={cn(
            "pointer-events-none fixed z-[var(--z-tour)] border",
            step.anchor.type === "canvas-node"
              ? // The canvas node circle — its motion *is* following worldToScreen
                // every frame, so there is no CSS transition (it must not fight
                // the camera spring). The visible ring is drawn by the engine
                // directly on the canvas, so this leaves only the dimming hole
                // with a transparent border.
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
            // The scrim paint — a 9999px spread fills everything outside the
            // cutout with darkness. Zero blur, no colour emission: this is a
            // different technique from the glow/neon `0 0 …` ring
            // `.claude/rules/design.md` forbids (that is a luminous highlight with
            // blur > 0; this is an opaque mask with blur = 0).
            boxShadow: "0 0 0 9999px var(--topology-tour-scrim-surface)",
          }}
        />
      ) : (
        // Before layout settles — a full scrim rather than a flickering half cutout.
        <div
          data-testid="guided-tour-scrim"
          className="fixed inset-0 z-[var(--z-tour)]"
          style={{ background: "var(--topology-tour-scrim-surface)" }}
        />
      )}

      {/* Step-transition motion (frame audit 2026-07-24) — the card had only
          `transition-opacity`, so on a step change its top/left **teleported** (a
          one-frame jump in 30fps footage). Interpolating the position conflicts
          with the canvas-node steps following the rect every frame (it would drag
          behind the camera spring), so the card is remounted per step via `key`
          and **reuses the existing panel cross-fade keyframes** — the new copy
          rises into place while tracking accuracy is unchanged. */}
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
