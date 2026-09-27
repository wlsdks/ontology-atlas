"use client";

import { cn } from '@/shared/lib/cn';
import type { ArchitectureGraph } from '../model/graph-layout';
import { EDGE_STROKE, VIOLATED_STROKE } from './ArchitectureSketch';

/**
 * Everything the drawing means, in words: the key for every mark and the direction dependencies
 * run. It sits in the panel beside the canvas (below `xl`, the next section) so the canvas keeps
 * its room, and it is painted, never `sr-only`. Rule sentences live on the strokes themselves.
 */
export function ArchitectureRules({
  graph,
  violatedPairs,
  legendPermitted,
  legendTraffic,
  legendSkipHint,
  legendViolated,
  directionLabel,
  hiddenAtWorkbench = false,
}: {
  graph: ArchitectureGraph;
  /** `from>to` for each crossing the receipt counted as a violation. */
  violatedPairs: ReadonlySet<string>;
  legendPermitted: string;
  legendTraffic: string;
  legendSkipHint: string;
  legendViolated: string;
  directionLabel: string;
  /** True while the dock is answering a role: the rules are one button away, not stacked under it. */
  hiddenAtWorkbench?: boolean;
}) {
  if (graph.edges.length === 0) return null;

  return (
    <div
      className={cn(
        'flex shrink-0 flex-col gap-3 border-b border-[color:var(--color-border-soft)] px-4 py-3 lg:col-span-2',
        hiddenAtWorkbench ? 'xl:hidden' : undefined,
      )}
    
      data-testid="architecture-rules"
    >
      {/* A key row appears only when its mark is drawn; the arrow sentence stays whenever any stroke exists. */}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[color:var(--color-divider)] pt-3 text-caption text-[color:var(--color-text-quaternary)]">
        {/* The shape key comes first: shapes are drawn before any stroke. */}
        {graph.edgeSource === 'permitted' || graph.edgeSource === 'both' ? (
          <span className="flex items-center gap-1.5">
            <svg width={18} height={6} aria-hidden>
              <line x1={0} y1={3} x2={18} y2={3} stroke={EDGE_STROKE} strokeWidth={1.5} />
            </svg>
            {legendPermitted}
          </span>
        ) : null}
        {graph.edgeSource === 'traffic' || graph.edgeSource === 'both' ? (
          <span className="flex items-center gap-1.5">
            <svg width={18} height={6} aria-hidden>
              <line x1={0} y1={3} x2={18} y2={3} stroke={EDGE_STROKE} strokeWidth={3} />
            </svg>
            {legendTraffic}
          </span>
        ) : null}
        {/* Both sentences come after every swatch, so the marks read as one run. */}
        <span>{directionLabel}</span>
        {/* The canvas hides skips until an end is chosen, so it says so. */}
        {graph.edges.some((edge) => violatedPairs.has(`${edge.from}>${edge.to}`)) ? (
          <span className="flex items-center gap-1.5 text-[color:var(--color-danger-text)]">
            <svg width={18} height={6} aria-hidden>
              <line
                x1={0}
                y1={3}
                x2={18}
                y2={3}
                stroke={VIOLATED_STROKE}
                strokeWidth={2}
                strokeDasharray="5 3"
              />
            </svg>
            {legendViolated}
          </span>
        ) : null}
        {graph.edges.some((edge) => edge.columnSpan > 1) ? <span>{legendSkipHint}</span> : null}
      </p>
    </div>
  );
}
