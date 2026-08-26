'use client';

import { useMemo } from 'react';

import {
  buildArchitectureLayout,
  type ArchitectureProfile,
} from '@/entities/architecture-profile';

/**
 * The dependency rules, drawn as the flow they are.
 *
 * ⚠️ **Why this is hand-drawn and not a graph library.** `AGENTS.md` names the canvas-2D
 * `topology-map-v2` engine as *the* graph renderer and says another one needs a decision record;
 * that rule is about the map's thousands of force-laid nodes. This is a handful of roles in a
 * settled layered order, so a library would add a dependency, a bundle, and a second visual
 * language to answer a layout that is a few lines of arithmetic.
 *
 * **Three defects the owner reported on the installed build, in order.**
 *
 * 1. *The picture disagreed with its data.* A stack of cards put a down-arrow between every
 *    consecutive pair whatever the rules said, so `domain` — which allows nothing — had an arrow
 *    leaving it and `port → domain` pointed the wrong way. `architecture-layout.ts` now derives the
 *    rows and edges from the rules.
 * 2. *The screen said everything twice.* A diagram of the roles sat above a list of the same roles,
 *    so neither half could use the width and the result was both repetitive and empty. One band per
 *    role now carries the name, the glob and the reach together.
 * 3. *A single spine threw the information away.* For a `lower-only` profile the drawing collapsed
 *    to seven rows and one hairline — *"this is poor too"*. Refusing to draw 21 implied edges was
 *    right; drawing **nothing** in their place was not.
 *
 * **What replaced the spine: the reach grid.** Every band carries one cell per role, in layer
 * order, filled where a dependency is allowed. Because the columns line up between bands, a
 * strictly layered project draws a triangle — and that shape *is* the answer to "did the agent
 * respect the architecture", because a dependency pointing back up appears on the wrong side of the
 * diagonal where nothing else sits. This is the dependency-structure matrix, folded into the rows
 * so a reader who does not know what a DSM is still sees a staircase.
 *
 * **The two policies stay two pictures.** `explicit` genuinely *is* a graph, so its declared edges
 * are drawn as arcs in a gutter. `lower-only` is a single sentence, so it has no gutter and the
 * grid carries it alone. Flattening them into one drawing is what produced defect 1.
 */

/** One band's height. Fixed so the arc overlay's arithmetic matches the DOM without measuring it. */
const BAND_H = 64;
/** The lane the arcs run in, left of the bands. Only `explicit` profiles draw one. */
const GUTTER = 88;
/*
 * ⚠️ **Every arc starts and ends on a marked point.** A first pass ran the curves into the bare
 * edge of the bands and they crowded into a smear that read as decoration rather than as four
 * declared rules. One station dot per role is the device a transit map uses, and it is what makes
 * the dependencies countable rather than merely felt.
 */
const STATION_X = GUTTER - 12;
const DOT_R = 3.5;
/** How far out each successive lane sits, so a skip cannot lie on top of a neighbouring edge. */
const LANE_STEP = 24;
const LANE_INSET = 18;

function laneX(span: number) {
  // A one-row hop hugs the bands; the further an edge skips, the further out it bows.
  return Math.max(4, STATION_X - LANE_INSET - (span - 1) * LANE_STEP);
}

/** An arc between two station dots: leaves horizontally, arrives horizontally at the dot's edge. */
function edgePath(y1: number, y2: number, span: number) {
  const x = laneX(span);
  return `M ${STATION_X} ${y1} C ${x} ${y1}, ${x} ${y2}, ${STATION_X - DOT_R - 1} ${y2}`;
}

export function ArchitectureFlow({
  profile,
  roleLabel,
  reachLabel,
  sinkLabel,
  legend,
}: {
  profile: ArchitectureProfile;
  roleLabel: (id: string) => string;
  /** Reads the reach grid aloud, because a grid of cells is not a sentence. */
  reachLabel: (role: string, targets: string) => string;
  /** What "depends on nothing" is called. */
  sinkLabel: string;
  /** Teaches the grid: what a filled cell, an open cell and the column order mean. */
  legend: { allowed: string; self: string; order: string };
}) {
  const layout = useMemo(() => buildArchitectureLayout(profile), [profile]);
  const pathsOf = useMemo(
    () => new Map(profile.roles.map((role) => [role.id, role.paths])),
    [profile],
  );

  /*
   * The grid's columns are the rows of the drawing, in the same order, so a cell's position alone
   * says which layer it means and an upward dependency lands on the wrong side of the diagonal.
   */
  const columns = layout.rows.flat();
  const depthOf = new Map(layout.nodes.map((node) => [node.id, node.depth]));
  const allowedOf = (id: string) =>
    layout.edges.filter((edge) => edge.from === id).map((edge) => edge.to);

  const centreOf = (depth: number) => depth * BAND_H + BAND_H / 2;
  const height = layout.rows.length * BAND_H;
  const drawsArcs = layout.policy === 'explicit';

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3" data-testid="architecture-flow">
      <div className="relative overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]">
        {drawsArcs ? (
          <svg
            className="pointer-events-none absolute left-0 top-0"
            width={GUTTER}
            height={height}
            viewBox={`0 0 ${GUTTER} ${height}`}
            aria-hidden
          >
            <defs>
              <marker
                id="architecture-flow-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="5"
                markerHeight="5"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 z" fill="var(--color-indigo-a60)" />
              </marker>
            </defs>

            {layout.edges.map((edge) => {
              const from = depthOf.get(edge.from) ?? 0;
              const to = depthOf.get(edge.to) ?? 0;
              return (
                <path
                  key={`${edge.from}->${edge.to}`}
                  d={edgePath(centreOf(from), centreOf(to), Math.abs(to - from))}
                  fill="none"
                  stroke={edge.skips ? 'var(--color-indigo-a30)' : 'var(--color-indigo-a60)'}
                  strokeWidth={edge.skips ? 1 : 1.5}
                  markerEnd="url(#architecture-flow-arrow)"
                  data-testid={`architecture-flow-edge-${edge.from}-${edge.to}`}
                />
              );
            })}

            {/* Dots last, so an arrowhead cannot sit on top of one. */}
            {layout.rows.map((row, depth) => (
              <circle
                key={row.join('+')}
                cx={STATION_X}
                cy={centreOf(depth)}
                r={DOT_R}
                fill="var(--color-panel)"
                stroke={
                  depth === layout.rows.length - 1
                    ? 'var(--color-indigo-a60)'
                    : 'var(--color-indigo-a30)'
                }
                strokeWidth="1.5"
              />
            ))}
          </svg>
        ) : null}

        <ol className={drawsArcs ? 'm-0 list-none p-0 pl-22' : 'm-0 list-none p-0'}>
          {layout.rows.map((row, depth) => (
            <li
              key={row.join('+')}
              /*
               * `h-16` with border-box keeps the row exactly BAND_H tall despite the divider, which
               * is what lets the overlay compute centres instead of measuring them.
               */
              className="flex h-16 items-center gap-4 border-t border-[color:var(--color-divider)] pl-4 pr-4 first:border-t-0"
              data-testid={`architecture-flow-band-${depth}`}
            >
              {row.map((id) => {
                const allowed = allowedOf(id);
                const isSink = allowed.length === 0;
                return (
                  <div
                    key={id}
                    className="flex min-w-0 flex-1 items-center gap-4"
                    data-testid={`architecture-role-${id}`}
                  >
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                      <h3
                        className={
                          isSink
                            ? 'min-w-0 truncate text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-indigo-text-soft)]'
                            : 'min-w-0 truncate text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]'
                        }
                      >
                        {roleLabel(id)}
                      </h3>
                      <p className="min-w-0 truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
                        {(pathsOf.get(id) ?? []).join('  ·  ')}
                      </p>
                    </div>

                    {/*
                      ⚠️ The grid is the picture, so it must not also be the accessible text: a
                      screen reader gets the sentence, and the cells are hidden from it.
                    */}
                    <p className="sr-only">
                      {isSink
                        ? sinkLabel
                        : reachLabel(roleLabel(id), allowed.map(roleLabel).join(', '))}
                    </p>
                    <div
                      className="flex shrink-0 gap-1"
                      aria-hidden
                      data-testid={`architecture-reach-${id}`}
                    >
                      {columns.map((column) => {
                        const state =
                          column === id ? 'self' : allowed.includes(column) ? 'on' : 'off';
                        return (
                          <span
                            key={column}
                            data-reach={state}
                            className={
                              state === 'on'
                                ? 'size-2 rounded-full bg-[color:var(--color-indigo-a60)]'
                                : state === 'self'
                                  ? 'size-2 rounded-full border border-[color:var(--color-text-quaternary)]'
                                  : 'size-2 rounded-full bg-[color:var(--color-overlay-2)]'
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </li>
          ))}
        </ol>
      </div>
      {/*
        ⚠️ A grid of cells is not self-explanatory: nothing on screen says the columns are the rows
        above in the same order, and that mapping is the whole reason an upward dependency would be
        visible. The diagonal of open cells hints at it; this states it. Real cells rather than
        typed glyphs, so the legend cannot drift from what is drawn.
      */}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-[color:var(--color-text-quaternary)]">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[color:var(--color-indigo-a60)]" aria-hidden />
          {legend.allowed}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="size-2 rounded-full border border-[color:var(--color-text-quaternary)]"
            aria-hidden
          />
          {legend.self}
        </span>
        <span>{legend.order}</span>
      </p>
    </div>
  );
}
