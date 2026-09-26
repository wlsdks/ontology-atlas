"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import type { DomeViewKind } from "../model/dome-view";
import { TIER_NAME_ROW_PX, type TierNameAnchor } from "../model/tier-names";

/**
 * **Strata's tier names, each beside the plane it names** (2026-09-26).
 *
 * The frame decides where a name stands (`model/tier-names.ts`): outside its own
 * plane's rim, on nothing, or not at all. This draws the names it placed, as DOM rows
 * over the canvas so they keep the chrome's type, and measures every name in that
 * type so the placement works from the widths a person sees.
 *
 * Hovering a name raises its plane's ring to the tertiary ink while the pointer is on
 * it — the reverse lookup, pointing from the word to the plane it sits against.
 *
 * The names are the planes' captions, not a second key: the legend strip along the
 * bottom still names each kind by colour for everyone, assistive technology included,
 * so these are hidden from it rather than read twice.
 */

const ROW_CLASS =
  "pointer-events-auto absolute flex w-max items-center whitespace-nowrap text-label text-[color:var(--color-text-quaternary)] transition-colors duration-[var(--motion-fast)] hover:text-[color:var(--color-text-tertiary)]";

export interface OntologyMapTierLegendProps {
  /** Where the frame placed each name this frame, canvas CSS px. */
  names: readonly TierNameAnchor[];
  /** kind → the localized tier name. */
  labels: Readonly<Partial<Record<DomeViewKind, string>>>;
  /** Raise this plane's ring while the pointer is on its name; null clears it. */
  onRaise: (kind: DomeViewKind | null) => void;
  /** Every name's rendered width by kind, for the placement; `{}` once the names leave. */
  onWidths: (widths: Readonly<Record<string, number>>) => void;
}

export function OntologyMapTierLegend({ names, labels, onRaise, onWidths }: OntologyMapTierLegendProps) {
  const sizerRef = useRef<HTMLDivElement | null>(null);

  /*
   * The widths are measured from a hidden copy of every name in the same type, so a
   * name the frame has not placed yet can still be measured. Measured before paint and
   * again once the web font has arrived, because a fallback face sets different widths.
   */
  useLayoutEffect(() => {
    const sizer = sizerRef.current;
    if (!sizer) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const widths: Record<string, number> = {};
      for (const el of sizer.querySelectorAll<HTMLElement>("[data-tier-measure]")) {
        const kind = el.dataset.tierMeasure;
        if (kind) widths[kind] = el.getBoundingClientRect().width;
      }
      onWidths(widths);
    };
    measure();
    void document.fonts?.ready.then(measure);
    return () => {
      cancelled = true;
    };
  }, [labels, onWidths]);

  // Leaving, the names give their room back: nothing is placed and nothing is reserved.
  useEffect(() => () => onWidths({}), [onWidths]);

  // Leaving must clear the raise even if no name got a leave event.
  useEffect(() => () => onRaise(null), [onRaise]);

  return (
    <div
      data-testid="topology-tier-legend"
      data-tier-legend-placement="anchored"
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 hidden md:block"
      onPointerLeave={() => onRaise(null)}
    >
      {names.map((name) => {
        const text = labels[name.kind as DomeViewKind];
        if (!text) return null;
        return (
          <div
            key={name.kind}
            data-testid={`topology-tier-legend-row-${name.kind}`}
            data-tier-kind={name.kind}
            data-tier-side={name.side}
            className={ROW_CLASS}
            style={{ left: name.minX, top: name.minY, height: TIER_NAME_ROW_PX, opacity: name.a }}
            onPointerEnter={() => onRaise(name.kind as DomeViewKind)}
            onPointerLeave={() => onRaise(null)}
          >
            {text}
          </div>
        );
      })}
      <div ref={sizerRef} className="invisible absolute left-0 top-0" aria-hidden>
        {Object.entries(labels).map(([kind, text]) =>
          text ? (
            <span key={kind} data-tier-measure={kind} className="block w-max whitespace-nowrap text-label">
              {text}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}
