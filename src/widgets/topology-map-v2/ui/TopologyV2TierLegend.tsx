"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  layoutTierLegendRows,
  type TierLegendAnchor,
  type TierLegendPlacement,
} from "../model/tier-legend-rows";
import type { DomeViewKind } from "../model/dome-view";

/**
 * **Strata's tier names, moved off the plane rims onto a rail.**
 *
 * The four names used to hang on the rings themselves, and at 1040×720 that put
 * them over the graph: the fit takes the widest plane's rim to the canvas edge, so
 * outside the ring there is no clear space to hang a name in and the name has to
 * sit on the data. Here they are on the right edge, under the utility tiles, where
 * nothing is drawn — and each row still keeps its own plane's projected height, so
 * "which ring is this name for" is answered by the alignment rather than by the
 * reader counting rings. `model/tier-legend-rows.ts` owns what happens when the
 * projection crowds the four heights together.
 *
 * Hovering a row raises that plane's ring to the tertiary ink for as long as the
 * pointer is on it — the reverse lookup, and the reason the rail is worth being
 * interactive at all rather than being painted onto the canvas.
 *
 * **Never both.** The rim names are drawn only while this rail reports that it
 * does not fit (`onFitChange(false)` — a very short canvas), so the two never
 * appear at once.
 *
 * **Two placements, one legend** (2026-09-07). The rail costs the fit a 56 px
 * column, and at 1040×720 — where width is what binds the fit — that column was
 * 6% of the canvas: the graph's fill fell from 72.5% to 63.6% and two element
 * pairs on one plane began to touch. At 1512×982 the same column costs nothing,
 * because there the fit is bound by height and 236 px of width go unused. So the
 * rail is drawn only where `tierLegendPlacement` says its column is free, and
 * everywhere else the four names become a **compact corner stack**: the same
 * words, the same hover-raises-the-ring reverse lookup, four 16 px rows in the
 * bottom-right corner that the plane rims curve away from, above the readout and
 * measured off it rather than guessed at. What the corner gives up is the
 * per-plane alignment — and at 1040 the rail was already clamping two of its four
 * rows to the top of its band, so what is given up there is two rows' worth.
 *
 * **The inspector owns this edge when it is open.** The selected-node panel docks
 * against the same right edge, and the two answers tried before this one both
 * failed a measurement: leaving the rail where it is put two rows behind the
 * panel, and stepping it left of the panel put a row on a node, because the ego
 * reframe does not know about the rail the way the overview fit does
 * (`TIER_LEGEND_RESERVE_PX`). So the caller unmounts the rail while the panel is
 * docked — the reader is looking at one concept, not at which plane is which —
 * and the rim names stay off, because they would land on the graph exactly as
 * before.
 */

/** One row's height, in CSS px. Every row is this tall; see the layout module. */
const TIER_LEGEND_ROW_PX = 20;

/**
 * One corner row's height. Tighter than the rail's, because a corner stack has no
 * plane height to answer to and four rows have to clear the readout below them —
 * still the full `text-label` line box, so the names are no smaller to read.
 */
const TIER_LEGEND_CORNER_ROW_PX = 16;

/** Fallback gap above the readout when it is not on screen to be measured. */
const TIER_LEGEND_CORNER_FALLBACK_BOTTOM_PX = 52;

export interface TopologyV2TierLegendProps {
  /** This frame's plane heights in canvas CSS px, top tier first. */
  anchors: readonly TierLegendAnchor[];
  /** kind → the localized tier name, the same map the rim names used. */
  labels: Readonly<Partial<Record<DomeViewKind, string>>>;
  /** Raise this plane's ring while the pointer is on its row; null clears it. */
  onRaise: (kind: DomeViewKind | null) => void;
  /** Reports whether the rail could place its rows — false puts the rim names back. */
  onFitChange: (fits: boolean) => void;
  /**
   * `rail` or `corner`, decided by the fit's own free box
   * (`model/tier-legend-rows.ts#tierLegendPlacement`) so the reserved column and
   * the drawn legend cannot disagree.
   */
  placement: TierLegendPlacement;
}

export function TopologyV2TierLegend({ anchors, labels, onRaise, onFitChange, placement }: TopologyV2TierLegendProps) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [band, setBand] = useState<{ top: number; height: number } | null>(null);
  /**
   * How far the corner stack sits above the container's bottom edge — measured
   * off the readout that owns that corner, the same "read the element, do not
   * assume the token" technique the rail's band uses. Null until measured.
   */
  const [cornerBottom, setCornerBottom] = useState<number | null>(null);

  /*
   * The band is where the rail actually is, measured rather than assumed: its top
   * comes from the utility tiles' own tokens and its bottom from the map's safe
   * inset, so a retuned tile rhythm moves the rail with it. Reading the element is
   * how those `calc()` expressions become numbers the row layout can use.
   */
  const measure = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const top = el.offsetTop;
    const height = el.offsetHeight;
    setBand((previous) =>
      previous !== null && Math.abs(previous.top - top) < 0.5 && Math.abs(previous.height - height) < 0.5
        ? previous
        : { top, height },
    );
    const parent = el.parentElement;
    const readout = document.querySelector('[data-testid="first-run-readout"]');
    if (parent && readout) {
      const parentBox = parent.getBoundingClientRect();
      const readoutBox = readout.getBoundingClientRect();
      const next = Math.max(0, parentBox.bottom - readoutBox.top);
      setCornerBottom((previous) => (previous !== null && Math.abs(previous - next) < 0.5 ? previous : next));
    } else {
      setCornerBottom((previous) => previous ?? TIER_LEGEND_CORNER_FALLBACK_BOTTOM_PX);
    }
  }, []);

  useEffect(() => {
    measure();
    const el = railRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const parent = el.parentElement;
    if (parent) observer.observe(parent);
    return () => observer.disconnect();
  }, [measure]);

  const corner = placement === "corner";
  const rows =
    corner || band === null
      ? null
      : layoutTierLegendRows(anchors, band.top, band.height, TIER_LEGEND_ROW_PX);
  // The corner stack owns a corner nothing else draws in, so it always places its
  // rows; only the rail can run out of band and hand the names back to the rims.
  const fits = corner || rows !== null;

  useEffect(() => {
    onFitChange(fits);
  }, [fits, onFitChange]);

  // Leaving the rail must clear the raise even if no row got a leave event
  // (a fast pointer, or the rail unmounting under the cursor).
  useEffect(() => () => onRaise(null), [onRaise]);

  const rowClassName =
    "pointer-events-auto flex w-max items-center justify-end whitespace-nowrap text-label text-[color:var(--color-text-quaternary)] transition-colors duration-[var(--motion-fast)] hover:text-[color:var(--color-text-tertiary)]";

  return (
    <div
      ref={railRef}
      data-testid="topology-tier-legend"
      data-tier-legend-fits={fits ? "true" : "false"}
      data-tier-legend-placement={placement}
      aria-hidden={!fits}
      /*
       * **A real 64 px column, not a zero-width anchor.** The camera reserves
       * whatever covers the canvas by measuring the DOM
       * (`interaction/free-area.ts`), and it ignores anything under 40 px on a
       * side. As a zero-width box the rail was invisible to that scan, the fit
       * ran the graph out to the canvas edge, and three nodes ended up under the
       * rows at 1040×720 — the same "a name on the data" defect the rail exists
       * to end. With a box the camera makes room, and `w-16` is the widest of the
       * four names plus its gap. The corner stack keeps the same width and the
       * same right inset, so the four names stay on the column the utility tiles
       * and the readout already line up on.
       */
      className={
        corner
          ? "pointer-events-none absolute right-4 z-20 mb-3 hidden w-16 flex-col items-end md:right-6 md:flex xl:right-8"
          : "pointer-events-none absolute right-4 z-20 mt-3 hidden w-16 md:right-6 md:block xl:right-8"
      }
      style={
        corner
          ? {
              // Above the readout, which owns this corner — measured off it, so a
              // retuned readout moves the stack with it.
              bottom: cornerBottom ?? TIER_LEGEND_CORNER_FALLBACK_BOTTOM_PX,
            }
          : {
              /*
               * Under the **last** utility tile — the fourth slot is the
               * growth-replay one, and starting at the third put the rail's first
               * row inside it, where the tile silently swallowed the row's hover
               * (measured 2026-09-06 at 1512×982). Composed from the tiles' own
               * tokens, so a retuned rhythm moves the rail with it.
               */
              top: "calc(var(--topology-growth-replay-desktop-top) + var(--chrome-tile-size))",
              // Clear of the bottom readout, which owns the map's bottom inset.
              bottom: "calc(var(--topology-v2-safe-inset-bottom) * 1px)",
            }
      }
      onPointerLeave={() => onRaise(null)}
    >
      {corner
        ? anchors.map((anchor) => {
            const text = labels[anchor.kind as DomeViewKind];
            if (!text) return null;
            return (
              <div
                key={anchor.kind}
                data-testid={`topology-tier-legend-row-${anchor.kind}`}
                data-tier-kind={anchor.kind}
                className={rowClassName}
                style={{ height: TIER_LEGEND_CORNER_ROW_PX }}
                onPointerEnter={() => onRaise(anchor.kind as DomeViewKind)}
                onPointerLeave={() => onRaise(null)}
              >
                {text}
              </div>
            );
          })
        : rows?.map((row) => {
            const text = labels[row.kind as DomeViewKind];
            if (!text) return null;
            return (
              <div
                key={row.kind}
                data-testid={`topology-tier-legend-row-${row.kind}`}
                data-tier-kind={row.kind}
                className={`absolute right-0 ${rowClassName}`}
                style={{ top: row.top, height: TIER_LEGEND_ROW_PX }}
                onPointerEnter={() => onRaise(row.kind as DomeViewKind)}
                onPointerLeave={() => onRaise(null)}
              >
                {text}
              </div>
            );
          })}
    </div>
  );
}
