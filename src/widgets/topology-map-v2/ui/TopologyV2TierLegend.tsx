"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { layoutTierLegendRows, type TierLegendAnchor } from "../model/tier-legend-rows";
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

export interface TopologyV2TierLegendProps {
  /** This frame's plane heights in canvas CSS px, top tier first. */
  anchors: readonly TierLegendAnchor[];
  /** kind → the localized tier name, the same map the rim names used. */
  labels: Readonly<Partial<Record<DomeViewKind, string>>>;
  /** Raise this plane's ring while the pointer is on its row; null clears it. */
  onRaise: (kind: DomeViewKind | null) => void;
  /** Reports whether the rail could place its rows — false puts the rim names back. */
  onFitChange: (fits: boolean) => void;
}

export function TopologyV2TierLegend({ anchors, labels, onRaise, onFitChange }: TopologyV2TierLegendProps) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [band, setBand] = useState<{ top: number; height: number } | null>(null);

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

  const rows =
    band === null ? null : layoutTierLegendRows(anchors, band.top, band.height, TIER_LEGEND_ROW_PX);
  const fits = rows !== null;

  useEffect(() => {
    onFitChange(fits);
  }, [fits, onFitChange]);

  // Leaving the rail must clear the raise even if no row got a leave event
  // (a fast pointer, or the rail unmounting under the cursor).
  useEffect(() => () => onRaise(null), [onRaise]);

  return (
    <div
      ref={railRef}
      data-testid="topology-tier-legend"
      data-tier-legend-fits={fits ? "true" : "false"}
      aria-hidden={!fits}
      /*
       * **A real 64 px column, not a zero-width anchor.** The camera reserves
       * whatever covers the canvas by measuring the DOM
       * (`interaction/free-area.ts`), and it ignores anything under 40 px on a
       * side. As a zero-width box the rail was invisible to that scan, the fit
       * ran the graph out to the canvas edge, and three nodes ended up under the
       * rows at 1040×720 — the same "a name on the data" defect the rail exists
       * to end. With a box the camera makes room, and `w-16` is the widest of the
       * four names plus its gap.
       */
      className="pointer-events-none absolute right-4 z-20 mt-3 hidden w-16 md:right-6 md:block xl:right-8"
      style={{
        /*
         * Under the **last** utility tile — the fourth slot is the growth-replay
         * one, and starting at the third put the rail's first row inside it,
         * where the tile silently swallowed the row's hover (measured 2026-09-06
         * at 1512×982). Composed from the tiles' own tokens, so a retuned rhythm
         * moves the rail with it.
         */
        top: "calc(var(--topology-growth-replay-desktop-top) + var(--chrome-tile-size))",
        // Clear of the bottom readout, which owns the map's bottom inset.
        bottom: "calc(var(--topology-v2-safe-inset-bottom) * 1px)",
      }}
      onPointerLeave={() => onRaise(null)}
    >
      {rows?.map((row) => {
        const text = labels[row.kind as DomeViewKind];
        if (!text) return null;
        return (
          <div
            key={row.kind}
            data-testid={`topology-tier-legend-row-${row.kind}`}
            data-tier-kind={row.kind}
            className="pointer-events-auto absolute right-0 flex w-max items-center justify-end whitespace-nowrap text-label text-[color:var(--color-text-quaternary)] transition-colors duration-[var(--motion-fast)] hover:text-[color:var(--color-text-tertiary)]"
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
