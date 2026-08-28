"use client";

import { useLayoutEffect, useRef, useState } from 'react';

import type { TrafficArc } from '../model/traffic-layout';

/** Clearance between the rightmost band edge and the innermost arc. */
const ARC_INSET = 20;
/** Extra bow per row crossed, so a longer drop bows wider and a skip reads as a skip. */
const ARC_BOW_PER_ROW = 16;
/** The loop a same-role arc draws against its own band's edge. */
const SAME_ROLE_RADIUS = 11;

interface MeasuredArc extends TrafficArc {
  d: string;
  strokeWidth: number;
}

/**
 * The traffic between roles, drawn from the record's measurement.
 *
 * ⚠️ **These strokes are observation; the connectors down the spine are the rule.** The band order
 * and the connector between two bands say what the profile *permits*. An arc says how many imports
 * the scanner actually *saw* cross, at the moment stamped in the record. They are drawn apart on
 * purpose: the rule owns the centre line, the measurement bows out to the right, and the count is
 * stated in words in the assistive list so the number never lives only in a picture.
 *
 * Geometry is measured from the rendered role rows through the same offset-chain walk
 * `ConceptEdgeLayer` uses, so entrance transforms never move a stroke, and an arc exists exactly
 * when both of its ends are on screen. Nothing here is positioned by hand or remembered.
 *
 * ⚠️ **The layer finds its own container instead of being handed a parent ref.** React attaches a
 * parent's ref in the same bottom-up commit pass that runs a child's layout effect, so a child
 * reading `parentRef.current` can read null on the very first paint. Its sibling `ConceptEdgeLayer`
 * has that shape and survives it only because a 260ms re-measure lands later, which means its
 * strokes arrive a quarter second after the bands do. Reading `parentElement` off this layer's own
 * node has no such ordering: a component's own ref is attached before its own layout effect.
 */
export function ArchitectureTrafficLayer({
  arcs,
  refreshKey,
}: {
  arcs: readonly TrafficArc[];
  refreshKey: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [measured, setMeasured] = useState<MeasuredArc[]>([]);

  useLayoutEffect(() => {
    const container = svgRef.current?.parentElement;
    if (!container) return;

    const measure = () => {
      const anchorOf = (element: HTMLElement) => {
        let x = 0;
        let y = 0;
        let node: HTMLElement | null = element;
        while (node && node !== container) {
          x += node.offsetLeft;
          y += node.offsetTop;
          node = node.offsetParent as HTMLElement | null;
        }
        return { x, y, w: element.offsetWidth, h: element.offsetHeight };
      };

      const byRole = new Map<string, { x: number; y: number; w: number; h: number }>();
      container.querySelectorAll<HTMLElement>('[data-testid^="architecture-rung-"]').forEach((element) => {
        const id = element.getAttribute('data-testid')?.replace('architecture-rung-', '');
        if (id) byRole.set(id, anchorOf(element));
      });
      if (byRole.size === 0) {
        setMeasured([]);
        return;
      }

      /* One shared right margin, so arcs nest instead of crossing each other on the way out. */
      const edge = [...byRole.values()].reduce((most, rect) => Math.max(most, rect.x + rect.w), 0);

      const next: MeasuredArc[] = [];
      for (const arc of arcs) {
        const a = byRole.get(arc.from);
        const b = byRole.get(arc.to);
        if (!a || !b) continue;

        if (arc.sameRole) {
          /* Traffic that never left its role gets a loop against its own band, not a crossing
             shape: it is always permitted and it spans nothing. */
          const y = a.y + a.h / 2;
          const x = edge + ARC_INSET;
          next.push({
            ...arc,
            strokeWidth: 1,
            d:
              `M ${x} ${y - SAME_ROLE_RADIUS} ` +
              `A ${SAME_ROLE_RADIUS} ${SAME_ROLE_RADIUS} 0 1 1 ${x} ${y + SAME_ROLE_RADIUS}`,
          });
          continue;
        }

        const sy = a.y + a.h / 2;
        const ty = b.y + b.h / 2;
        const bow = edge + ARC_INSET + arc.rowSpan * ARC_BOW_PER_ROW;
        next.push({
          ...arc,
          /* 1px is legible at the thinnest measured crossing (one import); the busiest reaches 4. */
          strokeWidth: 1 + arc.weight * 3,
          d: `M ${a.x + a.w} ${sy} C ${bow} ${sy}, ${bow} ${ty}, ${b.x + b.w} ${ty}`,
        });
      }
      setMeasured(next);
    };

    measure();
    /* The band height swap pins heights for --motion-base; measure again once it settles. */
    const settle = setTimeout(measure, 260);
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(settle);
      window.removeEventListener('resize', onResize);
    };
  }, [arcs, refreshKey]);

  /* The node is always mounted, because it is what the measurement reads its container from.
     With nothing measured it carries no marks and no test id, so an empty stage stays empty. */
  return (
    <svg
      ref={svgRef}
      aria-hidden
      data-testid={measured.length === 0 ? undefined : 'architecture-traffic'}
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
    >
      {measured.map((arc) => (
        <path
          key={`${arc.from}>${arc.to}`}
          d={arc.d}
          fill="none"
          stroke="var(--color-indigo-a38)"
          strokeWidth={arc.strokeWidth}
          strokeLinecap="round"
          strokeDasharray={arc.sameRole ? '3 3' : undefined}
          data-traffic-from={arc.from}
          data-traffic-to={arc.to}
          data-traffic-count={arc.count}
        />
      ))}
    </svg>
  );
}
