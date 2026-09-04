"use client";

import { useEffect, useState, type RefObject } from "react";
import { cn } from "@/shared/lib/cn";
import { useDialogFocusTrap } from "@/shared/lib/use-dialog-focus-trap";
import type { UseGuidedTourResult } from "../model/use-guided-tour";
import {
  computeCardPlacement,
  resolveAnchorRect,
  type AnchorBox,
} from "../model/resolve-anchor-rect";
import { GuidedTourCard } from "./GuidedTourCard";

/** Slack between step 4's funnel hole and the probe — absorbs momentary error against the visual node. */
const TOUR_HOLE_PADDING = 16;

interface AnchorMeasurements {
  key: string;
  testidRect: AnchorBox | null;
  canvasRect: AnchorBox | null;
}

export interface GuidedTourOverlayProps {
  tour: UseGuidedTourResult;
  /**
   * The measurement probe for canvas node anchors (steps 2 and 4) — the same div
   * `TopologyMapV2` writes its per-frame `worldToScreen` transform into (HomePage
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
  const { open, step } = tour;
  const overlayRef = useDialogFocusTrap<HTMLDivElement>({
    open,
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

  // Canvas node anchors follow every frame (inheriting the camera spring's
  // rhythm, no CSS transition). While the probe is still unprojected (zero-size)
  // this is null and the full scrim is the fallback.
  useEffect(() => {
    if (!open || !step || step.anchor?.type !== "canvas-node") return undefined;
    // Canvas node anchors are map-only — destination guides pass no probe.
    if (!canvasAnchorRef) return undefined;
    let raf = 0;
    const tick = () => {
      const el = canvasAnchorRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        setMeasurements((current) =>
          current.key === anchorKey
            ? {
                ...current,
                canvasRect:
                  r.width > 0 && r.height > 0
                    ? { top: r.top, left: r.left, width: r.width, height: r.height }
                    : null,
              }
            : current,
        );
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [anchorKey, open, step, canvasAnchorRef]);

  if (!open || !step) return null;

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
    <div ref={overlayRef} data-testid="guided-tour-overlay" data-tour-step={step.id}>
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
          className="fixed inset-0 z-[var(--z-tour)] transition-opacity duration-[var(--topology-tour-transition-ms)] ease-out motion-reduce:transition-none"
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
              : "rounded-[var(--chrome-radius)] border-[color:var(--color-border-strong)] transition-[top,left,width,height] duration-[var(--topology-tour-transition-ms)] ease-out motion-reduce:transition-none",
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
        tour={tour}
        placement={placement}
        width={cardWidth}
        onActivateAnchor={onActivateAnchor}
        style={{ top: placement.top, left: placement.left }}
      />
    </div>
  );
}
