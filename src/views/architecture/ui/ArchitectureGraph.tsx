"use client";

import { Layers, Play } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ComponentType } from 'react';

import { Chip } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import type { ArchitectureGraph as Graph, GraphEdge } from '../model/graph-layout';

/**
 * Gap between one column and the next, and the room an edge has to travel.
 *
 * Measured on the installed app, 2026-08-28: the stage gives the graph about 807px, so seven
 * columns at 160px with 56px gaps needed 1456px and only four boxes were on screen. These are the
 * widest values that keep a seven-role profile inside roughly 1030px, which is what the stage has
 * at the widest window this product opens.
 */
const COLUMN_GAP = 36;
/** Column width. Narrow enough for seven, wide enough for a role name and two counts. */
const COLUMN_WIDTH = 136;
/** How far below the row a two-column skip swings. */
const SKIP_CLEARANCE = 18;
/** Each further column crossed adds this much depth, so the longest reach is the deepest arc. */
const SKIP_STEP = 9;
/** A permitted edge is a rule, so it has no magnitude and one width. */
const PERMITTED_STROKE = 1.5;

interface DrawnEdge extends GraphEdge {
  d: string;
  strokeWidth: number;
}

/**
 * The architecture as a horizontal flow: one column per rank, compact boxes, edges between them.
 *
 * ⚠️ **Why the boxes are small.** The first attempt drew edges onto full-width bands 250px tall,
 * and every stroke left and arrived at the same x because a full-width block has no side to leave
 * from. The result was a bundle of near-parallel wires nobody could read, reverted in
 * `4553e13c8`. A box an edge can attach to is the whole reason this shape exists, which is why
 * everything except a name and two counts lives in the detail panel instead.
 *
 * ⚠️ **Why left to right.** It is the convention the reader already has: workflow editors put
 * input on the left and output on the right, and layered-graph layouts treat direction as a
 * first-class setting. Recorded 2026-08-28 (3).
 *
 * Every stroke leaves the right edge of its source and enters the left edge of its target, so a
 * reader can always say which two boxes a line joins. Geometry is measured from the rendered
 * boxes, and the layer reads its container from its own node rather than a parent ref, because
 * React attaches a parent's ref in the same commit pass that runs a child's layout effect and the
 * parent-ref shape reads null on the first paint.
 */
export function ArchitectureGraph({
  graph,
  selected,
  onSelect,
  roleLabel,
  roleIcons,
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
  roleIcons: Readonly<Record<string, ComponentType<{ size?: number }>>>;
  moduleCountLabel: (count: number) => string;
  conceptCountLabel: (count: number) => string;
  permittedEdgeLabel: (from: string, to: string) => string;
  trafficEdgeLabel: (from: string, to: string, count: number) => string;
  /** `null` where this surface cannot list source at all, so the box says nothing rather than 0. */
  moduleCounts: Readonly<Record<string, number>> | null;
  conceptCounts: Readonly<Record<string, number>>;
  runLabel: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drawn, setDrawn] = useState<DrawnEdge[]>([]);
  /* `runSeq` keys the strokes so a second press replays instead of doing nothing. */
  const [runSeq, setRunSeq] = useState(0);
  const edgeKey = graph.edges.map((edge) => `${edge.kind}:${edge.from}>${edge.to}`).join('|');

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
      container
        .querySelectorAll<HTMLElement>('[data-graph-box]')
        .forEach((element) => {
          const id = element.dataset.graphBox;
          if (id) byRole.set(id, anchorOf(element));
        });

      const next: DrawnEdge[] = [];
      for (const edge of graph.edges) {
        /*
         * ⚠️ **At rest the canvas draws the spine; skips arrive with a selection.** This profile
         * measures nineteen crossings, and drawing every one of them at once braided them into a
         * tangle under the row (installed app, 2026-08-28) — the same "bundle of wires" failure
         * the reverted arcs had, moved a few pixels down. Adjacent crossings are the flow itself
         * and stay; a crossing that skips a column is a fact about one role, which is exactly what
         * choosing that role is for. The legend states this rather than leaving it a mystery.
         */
        if (edge.columnSpan > 1 && selected !== edge.from && selected !== edge.to) continue;
        const a = byRole.get(edge.from);
        const b = byRole.get(edge.to);
        if (!a || !b) continue;
        /* Out of the right side, into the left side. That is what makes the flow readable. */
        const sx = a.x + a.w;
        const sy = a.y + a.h / 2;
        const tx = b.x;
        const ty = b.y + b.h / 2;
        const strokeWidth =
          edge.kind === 'permitted' ? PERMITTED_STROKE : 1 + (edge.weight ?? 0) * 3;

        if (edge.columnSpan <= 1) {
          const bend = Math.max(COLUMN_GAP / 2, (tx - sx) / 2);
          next.push({
            ...edge,
            strokeWidth,
            d: `M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx} ${ty}`,
          });
          continue;
        }

        /*
         * ⚠️ **A skip has to go around, not through.** With every role in one row, an edge from
         * the first column to the last runs straight along the row's centre line and disappears
         * behind every box between them: measured on the installed app 2026-08-28, where the
         * declared skips were simply invisible. Routing below the row makes a skip legible *as* a
         * skip, and the further it reaches the deeper it swings, so the longest reach is also the
         * most obvious one.
         */
        const bottom = Math.max(a.y + a.h, b.y + b.h);
        const swing = bottom + SKIP_CLEARANCE + (edge.columnSpan - 2) * SKIP_STEP;
        next.push({
          ...edge,
          strokeWidth,
          d:
            `M ${sx} ${sy} C ${sx + COLUMN_GAP} ${sy}, ${sx + COLUMN_GAP} ${swing}, ` +
            `${(sx + tx) / 2} ${swing} C ${tx - COLUMN_GAP} ${swing}, ` +
            `${tx - COLUMN_GAP} ${ty}, ${tx} ${ty}`,
        });
      }
      setDrawn(next);
    };

    measure();
    const settle = setTimeout(measure, 260);
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(settle);
      window.removeEventListener('resize', onResize);
    };
  }, [edgeKey, graph.edges, selected]);

  const slotsPerColumn = graph.boxes.reduce((most, box) => Math.max(most, box.slot + 1), 1);
  const columnOf = new Map(graph.boxes.map((box) => [box.id, box.column]));

  return (
    <div
      className="architecture-canvas-ground relative overflow-x-auto rounded-panel border border-[color:var(--color-border-soft)] px-7 py-6"
      data-testid="architecture-graph"
      data-edge-source={graph.edgeSource}
    >
      {graph.edges.length === 0 ? null : (
        <div className="mb-3 flex justify-end">
          <Chip
            size="sm"
            onClick={() => setRunSeq((seq) => seq + 1)}
            data-testid="architecture-graph-run"
          >
            <Play size={ICON_SIZE.sm} aria-hidden />
            {runLabel}
          </Chip>
        </div>
      )}

      <svg
        ref={svgRef}
        aria-hidden
        data-testid={drawn.length === 0 ? undefined : 'architecture-graph-edges'}
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      >
        <defs>
          <marker
            id="architecture-graph-arrow"
            viewBox="0 0 8 8"
            refX="6.5"
            refY="4"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="var(--color-indigo-a60)" />
          </marker>
          {/* Traffic points too. The legend says the strokes carry direction, and a legend that
              names a mark the drawing does not make is the defect this screen already fixed once
              in the other direction (2026-08-28 (2)). */}
          <marker
            id="architecture-graph-arrow-traffic"
            viewBox="0 0 8 8"
            refX="6.5"
            refY="4"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="var(--color-indigo-a38)" />
          </marker>
        </defs>
        {drawn.map((edge) => (
          <path
            key={`${edge.kind}-${edge.from}-${edge.to}-${runSeq}`}
            className={runSeq === 0 ? undefined : 'architecture-flow-running'}
            style={
              runSeq === 0
                ? undefined
                : ({ '--architecture-run-step': columnOf.get(edge.from) ?? 0 } as React.CSSProperties)
            }
            d={edge.d}
            fill="none"
            stroke={
              edge.kind === 'permitted' ? 'var(--color-indigo-a60)' : 'var(--color-indigo-a38)'
            }
            strokeWidth={edge.strokeWidth}
            strokeLinecap="round"
            opacity={
              selected === null || edge.from === selected || edge.to === selected ? 1 : 0.22
            }
            markerEnd={
              edge.kind === 'permitted'
                ? 'url(#architecture-graph-arrow)'
                : 'url(#architecture-graph-arrow-traffic)'
            }
            data-edge-kind={edge.kind}
            data-edge-from={edge.from}
            data-edge-to={edge.to}
            data-edge-count={edge.count}
          />
        ))}
      </svg>

      <div
        className="relative grid w-max items-center"
        style={{
          gridTemplateColumns: `repeat(${graph.columns}, ${COLUMN_WIDTH}px)`,
          gridTemplateRows: `repeat(${slotsPerColumn}, minmax(64px, auto))`,
          columnGap: COLUMN_GAP,
          rowGap: 16,
        }}
      >
        {graph.boxes.map((box) => {
          const RoleIcon = roleIcons[box.id] ?? Layers;
          const isSelected = selected === box.id;
          const hasIncoming = graph.edges.some((edge) => edge.to === box.id);
          const hasOutgoing = graph.edges.some((edge) => edge.from === box.id);
          /* Focus plus context, the interaction the removed bands had: what the chosen role
             touches stays lit and the rest recedes. Nothing is hidden, so the shape survives. */
          const dimmed =
            selected !== null &&
            !isSelected &&
            !graph.edges.some(
              (edge) =>
                (edge.from === selected && edge.to === box.id) ||
                (edge.to === selected && edge.from === box.id),
            );
          return (
            <button
              key={box.id}
              type="button"
              data-graph-box={box.id}
              data-testid={`architecture-graph-box-${box.id}`}
              aria-pressed={isSelected}
              onClick={() => onSelect(box.id)}
              style={{ gridColumn: box.column + 1, gridRow: box.slot + 1 }}
              className={controlClass({
                shape: 'card',
                hoverSurface: 'lift',
                active: isSelected,
                /*
                 * ISO 5807 shapes. A terminator is the start or the end of a process and takes
                 * rounded ends; a unit of work is a rectangle. Which one a role gets is derived
                 * from the declared dependency graph in `buildArchitectureGraph`, never from its
                 * name. The standard's diamond and parallelogram are absent because this drawing
                 * has no branch and no input step, and a shape that means something else is worse
                 * than no shape at all.
                 */
                className: `architecture-canvas-node relative min-w-0 flex-col items-stretch gap-0 overflow-hidden p-0 text-left transition-opacity duration-[var(--motion-fast)] ${
                  box.shape === 'terminator' ? 'rounded-full' : 'rounded-card'
                } ${
                  isSelected
                    ? 'border-[color:var(--color-indigo-a60)]'
                    : 'border-[color:var(--color-border-soft)]'
                } ${dimmed ? 'opacity-40' : 'opacity-100'} bg-[color:var(--color-elevated)]`,
              })}
            >
              {/*
                Ports. The single clearest signal a node editor gives: this is where a line
                attaches. Without them an edge appears to touch the box somewhere unspecified,
                which is what made the reverted arcs unreadable even after they were routed
                correctly. Drawn only on the side that actually has a line, so a port is never a
                promise of a connection that is not there.
              */}
              {hasIncoming ? (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--color-indigo-a60)]"
                />
              ) : null}
              {hasOutgoing ? (
                <span
                  aria-hidden
                  className="absolute right-0 top-1/2 size-1.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--color-indigo-a60)]"
                />
              ) : null}

              {/* Identity on its own ground, facts beneath a hairline. One box, two registers. */}
              <span
                className={`flex min-w-0 items-center gap-2 py-2 ${
                  box.shape === 'terminator' ? 'px-5' : 'px-3'
                } ${
                  isSelected ? 'bg-[color:var(--color-indigo-a08)]' : 'bg-[color:var(--color-overlay-1)]'
                }`}
              >
                <span className="flex size-5 shrink-0 items-center justify-center text-[color:var(--color-text-secondary)]">
                  <RoleIcon size={ICON_SIZE.sm} />
                </span>
                <span className="truncate text-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
                  {roleLabel(box.id)}
                </span>
              </span>
              <span
                className={`block truncate border-t border-[color:var(--color-divider)] py-1.5 text-caption tabular-nums text-[color:var(--color-text-tertiary)] ${
                  box.shape === 'terminator' ? 'px-5' : 'px-3'
                }`}
              >
                {moduleCounts === null
                  ? conceptCountLabel(conceptCounts[box.id] ?? 0)
                  : `${moduleCountLabel(moduleCounts[box.id] ?? 0)} · ${conceptCountLabel(
                      conceptCounts[box.id] ?? 0,
                    )}`}
              </span>
            </button>
          );
        })}
      </div>

      {/*
        The drawing is hidden from assistive technology, so every stroke states itself here.
        The 2026-08-28 walkthrough found a rule that lived only in the accessibility tree; a line
        that lives only in a drawing is the same defect facing the other way.
      */}
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
