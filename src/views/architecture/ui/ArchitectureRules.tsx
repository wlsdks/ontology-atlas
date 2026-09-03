"use client";

import { cn } from '@/shared/lib/cn';
import type { ArchitectureGraph } from '../model/graph-layout';
import { EDGE_STROKE, VIOLATED_STROKE } from './ArchitectureSketch';

/**
 * Everything the drawing means, in words: every rule as a sentence, and a key for every mark.
 *
 * ⚠️ **Why it is not under the canvas any more** (2026-08-30). It was, and at 1512×945 the canvas
 * then had 554px for a chain that needs 702 — the drawing the screen exists for was the thing
 * being cut. This block is the panel's content in the owner's own model of the screen: the canvas
 * is the map, and the explanations open beside it. Below `xl` the panel is not a panel at all —
 * it is the next section down the page, exactly where this list already was.
 *
 * ⚠️ **Painted, not screen-reader-only.** The list once held the complete answer to the question
 * the screen exists to answer inside an `sr-only` box one pixel wide (walkthrough, 2026-08-28):
 * a fact only the accessibility tree carries is a fact on no screen at all. A panel a reader opens
 * keeps it on a screen; an `sr-only` box did not.
 *
 * The sentences themselves left this panel on 2026-08-30 (Direction B): every stroke states its
 * own sentence on the canvas now, so this panel keeps what the drawing still cannot say in
 * place, the key for every mark and the direction the dependencies run.
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
      {/*
        A legend for a mark nobody drew is noise, so each row appears only in the case that draws
        it. The arrow sentence stays whenever any stroke exists, because both kinds point.
      */}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[color:var(--color-divider)] pt-3 text-caption text-[color:var(--color-text-quaternary)]">
        {/*
          ⚠️ **The shape key comes first, because the shapes are drawn before any stroke is.** A
          fresh-eyes walkthrough on 2026-08-28 read the whole legend and still could not say what
          the two shapes meant: it explained only the lines. `docs/AGENT-DESIGN-METHOD.md` states
          the rule this broke — every legend row names a mark that is on screen, and every mark on
          screen states itself somewhere readable.
        */}
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
        {/*
          ⚠️ Both sentences come after every swatch. In DOM order the direction sentence used to
          arrive third — between the two shape swatches and the stroke one — so a reader scanning
          for what a mark means met a sentence in the middle of the marks.
        */}
        <span>{directionLabel}</span>
        {/* The canvas hides skips until an end is chosen, so it says so. A drawing that quietly
            withholds a fact is the same defect as one that quietly invents it. */}
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
