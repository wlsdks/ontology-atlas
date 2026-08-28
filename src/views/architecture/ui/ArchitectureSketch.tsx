"use client";

import { useMemo, useRef, useState } from 'react';

import { cn } from '@/shared/lib/cn';
import { controlClass } from '@/shared/ui/control-class';

import type { ArchitectureGraph as Graph, GraphBoxShape } from '../model/graph-layout';
import { sketchConnector, sketchRect, sketchStadium } from '../model/sketch-stroke';

/* Geometry. One place, so the drawing can be reasoned about without reading the JSX. */
const BOX_W = 148;
const BOX_H = 62;
const COL_GAP = 52;
const ROW_GAP = 26;
const PAD_X = 28;
const PAD_Y = 26;
/** How far below the row a skip swings, and how much deeper each further column pushes it. */
const SKIP_DROP = 30;
const SKIP_STEP = 10;

interface Placed {
  id: string;
  x: number;
  y: number;
  shape: GraphBoxShape;
}

/**
 * The architecture, drawn.
 *
 * ⚠️ **The stroke says where the fact came from.** This screen carries two kinds of claim and has
 * always taken care not to let them read alike: a reviewed profile is what a person declared, and
 * measured traffic is what the scanner counted. Both used to be indigo strokes told apart only by
 * a legend sentence. Here the hand does it — **a declared rule is drawn with an unsteady human
 * line, an observation with an exact machine one** — so the difference survives being glanced at.
 *
 * ⚠️ **Shapes are ISO 5807's**, assigned from the declared graph in `buildArchitectureGraph`: a
 * terminator (stadium) at either end of the chain, a rectangle for a unit of work. The standard's
 * diamond and parallelogram stay unused because this drawing has no branch and no input step.
 *
 * One `<svg>` holds everything. The previous attempt put DOM boxes under an SVG overlay and spent
 * three rounds fighting the seam between them; a drawing is one artifact, and every mark here is
 * placed by the same arithmetic.
 */
export function ArchitectureSketch({
  graph,
  selected,
  onSelect,
  roleLabel,
  moduleCountLabel,
  conceptCountLabel,
  permittedEdgeLabel,
  trafficEdgeLabel,
  moduleCounts,
  conceptCounts,
  runLabel,
}: {
  graph: Graph;
  selected: string | null;
  onSelect: (id: string) => void;
  roleLabel: (id: string) => string;
  moduleCountLabel: (count: number) => string;
  conceptCountLabel: (count: number) => string;
  permittedEdgeLabel: (from: string, to: string) => string;
  trafficEdgeLabel: (from: string, to: string, count: number) => string;
  /** `null` where this surface cannot list source at all, so a box says nothing rather than 0. */
  moduleCounts: Readonly<Record<string, number>> | null;
  conceptCounts: Readonly<Record<string, number>>;
  runLabel: string;
}) {
  const [runSeq, setRunSeq] = useState(0);
  /*
   * ⚠️ **The run has to end.** `.architecture-flow-running` carries the dash pattern as a static
   * rule, so leaving the class on left every stroke dashed for good, with no way back and no
   * control to stop it (fresh-eyes walkthrough, 2026-08-28). The count comes from the paths
   * themselves through `onAnimationEnd`, so the duration lives in exactly one place — the token
   * the CSS reads — and never has to be repeated here as a number.
   */
  const [running, setRunning] = useState(false);
  const pending = useRef(0);

  const placed = useMemo(() => {
    const map = new Map<string, Placed>();
    for (const box of graph.boxes) {
      map.set(box.id, {
        id: box.id,
        x: PAD_X + box.column * (BOX_W + COL_GAP),
        y: PAD_Y + box.slot * (BOX_H + ROW_GAP),
        shape: box.shape,
      });
    }
    return map;
  }, [graph.boxes]);

  /* At rest the canvas draws the spine. A crossing that skips a column is a fact about one role,
     so it arrives when that role is chosen; the legend says so rather than leaving it a mystery. */
  const visibleEdges = graph.edges.filter(
    (edge) => edge.columnSpan <= 1 || selected === edge.from || selected === edge.to,
  );

  const slots = graph.boxes.reduce((most, box) => Math.max(most, box.slot + 1), 1);
  const width = PAD_X * 2 + graph.columns * BOX_W + (graph.columns - 1) * COL_GAP;
  /*
   * ⚠️ Reserve room for the skips that are actually drawn, not for the ones that could be. The
   * first cut always added the deepest possible swing, so at rest — where no skip is drawn at all
   * — the canvas ended in 180px of empty dot field (installed app, 2026-08-28). The drawing grows
   * when a selection reveals a skip and shrinks back when it is let go.
   */
  const drawnSkip = visibleEdges.reduce((most, edge) => Math.max(most, edge.columnSpan), 0);
  const skipRoom = drawnSkip <= 1 ? 0 : SKIP_DROP + drawnSkip * SKIP_STEP;
  const height = PAD_Y * 2 + slots * BOX_H + (slots - 1) * ROW_GAP + skipRoom;

  return (
    <div className="architecture-canvas-ground relative rounded-panel border border-[color:var(--color-border-soft)]">
      {graph.edges.length === 0 ? null : (
        <button
          type="button"
          onClick={() => {
            pending.current = visibleEdges.length;
            setRunSeq((seq) => seq + 1);
            setRunning(true);
          }}
          disabled={running}
          data-testid="architecture-graph-run"
          className={cn(
            controlClass({ shape: 'chip', size: 'sm', tone: 'secondary', hoverBorder: 'strong' }),
            'absolute right-4 top-4 z-10 bg-[color:var(--color-elevated)]',
          )}
        >
          <svg width={9} height={10} viewBox="0 0 9 10" aria-hidden>
            <path d="M0.5 0.5 L8.5 5 L0.5 9.5 Z" fill="currentColor" />
          </svg>
          {runLabel}
        </button>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        /*
         * ⚠️ **Pin the drawing to the left.** Measured on the built export at 1512: the element
         * is 1348 wide while a four-role profile's viewBox is 804, and the default
         * `xMidYMid` centred it — so a flow that reads left to right began 272px inside the
         * canvas, with an equal field of empty dots on either side. The boxes do not grow to
         * fill instead: 148×62 is a measured size, and stretching a node to use up width would
         * invent one.
         */
        preserveAspectRatio="xMinYMid meet"
        role="presentation"
        data-testid="architecture-graph"
        data-edge-source={graph.edgeSource}
        className="block max-w-full"
      >
        <defs>
          <marker
            id="architecture-sketch-arrow"
            viewBox="0 0 8 8"
            refX="6"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0,0.5 L7.5,4 L0,7.5" fill="none" stroke="context-stroke" strokeWidth={1.4} />
          </marker>
        </defs>

        {visibleEdges.map((edge) => {
          const a = placed.get(edge.from);
          const b = placed.get(edge.to);
          if (!a || !b) return null;
          const sx = a.x + BOX_W;
          const sy = a.y + BOX_H / 2;
          const tx = b.x;
          const ty = b.y + BOX_H / 2;
          const receded = selected !== null && selected !== edge.from && selected !== edge.to;

          /*
           * A permitted edge is a person's declared rule, so it is drawn by hand. Measured traffic
           * is a machine's count, so it is drawn exactly and its width carries the number.
           */
          const isDeclared = edge.kind === 'permitted';
          const drop =
            edge.columnSpan <= 1
              ? 0
              : SKIP_DROP + (edge.columnSpan - 2) * SKIP_STEP + BOX_H / 2;
          const midY = Math.max(sy, ty) + drop;
          const d =
            edge.columnSpan <= 1
              ? isDeclared
                ? sketchConnector(`${edge.from}>${edge.to}`, sx, sy, tx, ty, COL_GAP * 0.6)
                : `M ${sx} ${sy} C ${sx + COL_GAP * 0.6} ${sy}, ${tx - COL_GAP * 0.6} ${ty}, ${tx} ${ty}`
              : `M ${sx} ${sy} C ${sx + COL_GAP} ${sy}, ${sx + COL_GAP} ${midY}, ${
                  (sx + tx) / 2
                } ${midY} C ${tx - COL_GAP} ${midY}, ${tx - COL_GAP} ${ty}, ${tx} ${ty}`;

          return (
            <path
              key={`${edge.kind}-${edge.from}-${edge.to}-${runSeq}`}
              d={d}
              fill="none"
              /* Measured at 1512 on the installed app: `--color-indigo-a38` at a hairline was not
                 visible against the canvas ground at all. A stroke nobody can see is a fact the
                 drawing did not state. */
              stroke={isDeclared ? 'var(--color-indigo-a60)' : 'var(--color-indigo-a60)'}
              strokeWidth={isDeclared ? 1.4 : 1.4 + (edge.weight ?? 0) * 3}
              strokeLinecap="round"
              markerEnd="url(#architecture-sketch-arrow)"
              opacity={receded ? 0.18 : 1}
              className={running ? 'architecture-flow-running' : undefined}
              onAnimationEnd={() => {
                pending.current -= 1;
                if (pending.current <= 0) setRunning(false);
              }}
              style={
                running
                  ? ({
                      /*
                       * ⚠️ **The column, not the x.** This was fed `placed.get(...).x` — a pixel
                       * coordinate — and the CSS multiplies the step by the stagger token, so the
                       * three strokes of the storefront profile started at 2520ms, 20520ms and
                       * 38520ms. The walkthrough measured a "run" that took forty seconds to
                       * cross four boxes. A stagger counts places in a queue.
                       */
                      '--architecture-run-step': graph.boxes.find((b) => b.id === edge.from)?.column ?? 0,
                    } as React.CSSProperties)
                  : undefined
              }
              data-edge-kind={edge.kind}
              data-edge-from={edge.from}
              data-edge-to={edge.to}
              data-edge-count={edge.count}
            />
          );
        })}

        {graph.boxes.map((box) => {
          const at = placed.get(box.id);
          if (!at) return null;
          const isSelected = selected === box.id;
          const receded =
            selected !== null &&
            !isSelected &&
            !graph.edges.some(
              (edge) =>
                (edge.from === selected && edge.to === box.id) ||
                (edge.to === selected && edge.from === box.id),
            );
          const passes =
            box.shape === 'terminator'
              ? sketchStadium(box.id, at.x, at.y, BOX_W, BOX_H)
              : sketchRect(box.id, at.x, at.y, BOX_W, BOX_H);
          const counts =
            moduleCounts === null
              ? conceptCountLabel(conceptCounts[box.id] ?? 0)
              : `${moduleCountLabel(moduleCounts[box.id] ?? 0)} · ${conceptCountLabel(
                  conceptCounts[box.id] ?? 0,
                )}`;

          return (
            <g
              key={box.id}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`${roleLabel(box.id)} · ${counts}`}
              data-graph-box={box.id}
              data-testid={`architecture-graph-box-${box.id}`}
              onClick={() => onSelect(box.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(box.id);
                }
              }}
              opacity={receded ? 0.35 : 1}
              className="cursor-pointer outline-none [&:focus-visible>path]:stroke-[color:var(--color-indigo-a60)]"
            >
              {/* The fill is a separate flat shape: the sketch passes are the outline, and giving
                  them a fill would double-paint the wobble into a smudge. */}
              {box.shape === 'terminator' ? (
                <rect
                  x={at.x}
                  y={at.y}
                  width={BOX_W}
                  height={BOX_H}
                  rx={BOX_H / 2}
                  fill={
                    isSelected ? 'var(--color-indigo-a08)' : 'var(--color-elevated)'
                  }
                />
              ) : (
                <rect
                  x={at.x}
                  y={at.y}
                  width={BOX_W}
                  height={BOX_H}
                  fill={isSelected ? 'var(--color-indigo-a08)' : 'var(--color-elevated)'}
                />
              )}
              {passes.map((d, pass) => (
                <path
                  key={pass}
                  d={d}
                  fill="none"
                  stroke={
                    isSelected
                      ? 'var(--color-indigo-a60)'
                      : 'var(--color-architecture-sketch-ink)'
                  }
                  strokeWidth={1.2}
                  strokeLinecap="round"
                  opacity={pass === 0 ? 1 : 0.55}
                />
              ))}
              <text
                x={at.x + BOX_W / 2}
                y={at.y + BOX_H / 2 - 4}
                textAnchor="middle"
                className="fill-[color:var(--color-text-primary)] text-body font-[var(--font-weight-strong)]"
              >
                {roleLabel(box.id)}
              </text>
              <text
                x={at.x + BOX_W / 2}
                y={at.y + BOX_H / 2 + 13}
                textAnchor="middle"
                className="fill-[color:var(--color-text-tertiary)] text-caption tabular-nums"
              >
                {counts}
              </text>
            </g>
          );
        })}
      </svg>

      {/* The drawing is presentational, so every stroke states itself here. */}
      <ol className="sr-only">
        {graph.edges.map((edge) => (
          <li key={`${edge.kind}-${edge.from}-${edge.to}`}>
            {edge.kind === 'permitted'
              ? permittedEdgeLabel(roleLabel(edge.from), roleLabel(edge.to))
              : trafficEdgeLabel(roleLabel(edge.from), roleLabel(edge.to), edge.count ?? 0)}
          </li>
        ))}
      </ol>
    </div>
  );
}
