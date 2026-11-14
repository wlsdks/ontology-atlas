"use client";

import { useLayoutEffect, useRef, type RefObject } from 'react';

import { cn } from '@/shared/lib/cn';
import { Tooltip, TooltipProvider } from '@/shared/ui';

import type { PlacedLabel, RoleArc } from '../../model/role-arcs';

/** A hover target wider than the thinnest stroke. */
const HIT_STROKE_PX = 12;
const ARROW_REACH_PX = 6;
const ARROW_HALF_PX = 4;
export const ARC_LABEL_HEIGHT_PX = 16;

type ArcState = 'rest' | 'bright' | 'dim';

function arcState(arc: RoleArc, selected: string | null): ArcState {
  if (selected === null) return 'rest';
  return arc.from === selected || arc.to === selected ? 'bright' : 'dim';
}

const ARC_OPACITY: Record<ArcState, number> = { rest: 0.5, bright: 0.95, dim: 0.14 };

function readDurationMs(element: Element, token: string): number {
  const raw = getComputedStyle(element).getPropertyValue(token).trim();
  const value = Number.parseFloat(raw) || 0;
  return raw.endsWith('ms') ? value : value * 1000;
}

/** Draws each arc from its source once, the first time a profile shows arcs; reduced motion shows them at once. */
function useArcsDrawIn(svgRef: RefObject<SVGSVGElement | null>, drawKey: string) {
  const drawn = useRef<string | null>(null);
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg || drawKey === '' || drawn.current === drawKey) return;
    drawn.current = drawKey;
    if (typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const duration = readDurationMs(svg, '--motion-settle');
    const easing = getComputedStyle(svg).getPropertyValue('--motion-ease').trim() || undefined;
    if (duration <= 0) return;
    for (const path of svg.querySelectorAll<SVGPathElement>('[data-arc-stroke]')) {
      if (typeof path.animate !== 'function' || typeof path.getTotalLength !== 'function') continue;
      if (path.dataset.arcViolated === 'true') {
        path.animate([{ opacity: 0 }, { opacity: 1 }], { duration, delay: duration, easing });
        continue;
      }
      const length = path.getTotalLength();
      path.animate(
        [
          { strokeDasharray: `${length} ${length}`, strokeDashoffset: length },
          { strokeDasharray: `${length} ${length}`, strokeDashoffset: 0 },
        ],
        { duration, easing },
      );
    }
  }, [svgRef, drawKey]);
}

export function RoleArcs({
  arcs,
  selected,
  widthPx,
  heightPx,
  drawKey,
  sentenceOf,
  labelOf,
  countLabels,
  violationLabels,
}: {
  arcs: readonly RoleArc[];
  selected: string | null;
  widthPx: number;
  heightPx: number;
  /** Changes when a different set of arcs should draw in again: the profile. */
  drawKey: string;
  sentenceOf: (arc: RoleArc) => string;
  labelOf: (arc: RoleArc) => string;
  countLabels: readonly PlacedLabel[];
  violationLabels: readonly (PlacedLabel & { text: string })[];
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  useArcsDrawIn(svgRef, arcs.length === 0 ? '' : drawKey);
  /* Violations paint last, so a red stroke is never under a neutral one. */
  const ordered = [...arcs.filter((arc) => !arc.violated), ...arcs.filter((arc) => arc.violated)];
  const countByKey = new Map(arcs.map((arc) => [`${arc.from}>${arc.to}`, arc.count]));

  return (
    <div className="relative" style={{ width: widthPx, height: heightPx }} data-testid="architecture-arcs">
      <TooltipProvider delayDuration={120}>
        <svg
          ref={svgRef}
          width={widthPx}
          height={heightPx}
          viewBox={`0 0 ${widthPx} ${heightPx}`}
          className="absolute inset-0 overflow-visible"
        >
          {ordered.map((arc) => {
            const state = arcState(arc, selected);
            const key = `${arc.from}>${arc.to}`;
            return (
              <g
                key={key}
                data-testid={`architecture-arc-${arc.from}-${arc.to}`}
                data-arc-from={arc.from}
                data-arc-to={arc.to}
                data-arc-state={state}
                data-arc-violated={arc.violated ? 'true' : 'false'}
                data-arc-stroke-px={arc.strokePx}
                className="transition-opacity duration-[var(--motion-base)]"
                style={{ opacity: arc.violated ? (state === 'dim' ? 0.35 : 1) : ARC_OPACITY[state] }}
              >
                <path
                  data-arc-stroke
                  data-arc-violated={arc.violated ? 'true' : 'false'}
                  d={arc.d}
                  fill="none"
                  strokeLinecap="round"
                  strokeWidth={arc.violated ? Math.max(1.5, arc.strokePx) : arc.strokePx}
                  strokeDasharray={arc.violated ? '4 4' : undefined}
                  className={cn(
                    'transition-[stroke] duration-[var(--motion-base)]',
                    arc.violated
                      ? 'stroke-[color:var(--color-danger-text)]'
                      : state === 'bright'
                        ? 'stroke-[color:var(--color-text-secondary)]'
                        : 'stroke-[color:var(--color-text-quaternary)]',
                  )}
                />
                {arc.violated ? (
                  <path
                    d={`M ${ARROW_REACH_PX} ${arc.targetY - ARROW_HALF_PX} L 0.5 ${arc.targetY} L ${ARROW_REACH_PX} ${arc.targetY + ARROW_HALF_PX}`}
                    fill="none"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="stroke-[color:var(--color-danger-text)]"
                  />
                ) : null}
                <Tooltip content={labelOf(arc)} side="right" withProvider={false} delayMs={120}>
                  <path
                    role="img"
                    aria-label={sentenceOf(arc)}
                    data-testid={`architecture-arc-hit-${arc.from}-${arc.to}`}
                    d={arc.d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={HIT_STROKE_PX}
                    pointerEvents="stroke"
                  />
                </Tooltip>
              </g>
            );
          })}
        </svg>
      </TooltipProvider>
      {countLabels.map((label) => (
        <span
          key={label.key}
          aria-hidden
          data-testid={`architecture-arc-count-${label.key.replace('>', '-')}`}
          className="pointer-events-none absolute rounded-micro bg-[color:var(--color-panel)] px-1 font-mono text-label tabular-nums text-[color:var(--color-text-primary)] topology-chrome-in"
          style={{ left: label.x, top: label.y, height: ARC_LABEL_HEIGHT_PX }}
        >
          {countByKey.get(label.key)}
        </span>
      ))}
      {violationLabels.map((label) => (
        <span
          key={label.key}
          aria-hidden
          data-testid={`architecture-arc-violation-${label.key.replace('>', '-')}`}
          className="pointer-events-none absolute whitespace-nowrap text-label text-[color:var(--color-danger-text)]"
          style={{ left: label.x, top: label.y, height: ARC_LABEL_HEIGHT_PX }}
        >
          {label.text}
        </span>
      ))}
    </div>
  );
}
