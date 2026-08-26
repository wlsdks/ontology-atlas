'use client';

import { useMemo, useState } from 'react';

import {
  buildArchitectureLayout,
  type ArchitectureProfile,
} from '@/entities/architecture-profile';
import { RowButton } from '@/shared/ui';

/**
 * The dependency policy: a ladder of layers, and the matrix that states the whole rule.
 *
 * ⚠️ **Five rounds got here, and the research says why four of them failed.**
 *
 * Rounds 1–4 were a *list of roles with decoration attached* — cards with an arrow between every
 * consecutive pair, boxes in a column, bands with arcs in a gutter, bands with dots in the corner.
 * Round 5 was nested rings. The owner rejected each one, latterly with *"can you see a flow in
 * this? a flow.."*, and the last rejection is the one with a measured cause behind it: the
 * nested-rectangle literature is blunt that **beyond 2–3 levels of nesting the form stops being
 * readable**, because deep nesting leaves no room for labels. Feature-Sliced Design has seven
 * layers. The onion was not a near miss; it was the wrong instrument for this depth.
 *
 * **What the evidence actually supports for 4–8 layers.**
 *
 * - **One nesting level, not seven.** Full-width bands in dependency order, constant height, label
 *   in a leading strip. A long name truncates horizontally instead of deforming the geometry.
 * - **A policy matrix beside them.** Ghoniem, Fekete and Castagliola measured the crossover: past
 *   about twenty vertices a matrix beats node-link at everything except path-finding, and below it
 *   the graph wins. At four to eight, the matrix is sixteen to sixty-four cells — small enough to
 *   read at a glance, and the only form in which *"there are no exceptions"* is a visible claim
 *   rather than an absence. A legal layering draws a filled triangle; a hole is an empty cell where
 *   the triangle should be solid, and needs no separate mark because its **position** is the
 *   exception. Concentric rings could not say this at all, which is why they needed a paragraph of
 *   disclaimer underneath.
 * - **One arrow, not n².** A single stroke down the gutter carrying one stated semantic. Arrow
 *   direction is genuinely ambiguous here — source-code dependency and data flow run in *opposite*
 *   directions across a boundary — so the legend names which one this is, once.
 * - **Motion that answers a question.** Hovering or focusing a layer raises it and everything it
 *   may reach and dims the rest, and lights its row and column in the matrix. That is Shneiderman's
 *   focus-plus-context and Heer and Shneiderman's linked highlighting, and it is the same ego-focus
 *   behaviour the map already uses. This is what makes the reach legible: a static picture of seven
 *   rows cannot show it, and no amount of restyling the rows was ever going to.
 *
 * ⚠️ **No layout library.** Every candidate — ELK, dagre, Cytoscape, Reaflow — solves *layout
 * search*, and there is nothing to search: the order is the data. ELK alone is 455 KB gzipped to
 * place eight boxes, and it is the one non-permissive licence among them. The geometry here is a
 * loop over an array.
 */

/** Row and header heights, as Tailwind steps so the three columns stay in register. */
const ROW_CLASS = 'h-14';
const ROW_H = 56;
const HEADER_H = 24;
/** One matrix column. Cell pitch, not cell size — the dot inside is smaller. */
const CELL_CLASS = 'w-4';

export function ArchitectureFlow({
  profile,
  roleLabel,
  reachLabel,
  sinkLabel,
  directionLabel,
  legend,
}: {
  profile: ArchitectureProfile;
  roleLabel: (id: string) => string;
  /** Reads one layer's reach aloud, because a matrix is not a sentence. */
  reachLabel: (role: string, targets: string) => string;
  /** What "depends on nothing" is called. */
  sinkLabel: string;
  /** Names the one arrow's semantic. Ambiguity here is the most common misread. */
  directionLabel: string;
  legend: { allowed: string; self: string; columns: string };
}) {
  const layout = useMemo(() => buildArchitectureLayout(profile), [profile]);
  const [focus, setFocus] = useState<string | null>(null);

  const pathsOf = useMemo(
    () => new Map(profile.roles.map((role) => [role.id, role.paths])),
    [profile],
  );
  /** Outer to inner. Roles sharing a depth share a rung: neither may depend on the other. */
  const rungs = layout.rows;
  const order = rungs.flat();
  const allows = useMemo(() => {
    const map = new Map<string, Set<string>>(order.map((id) => [id, new Set<string>()]));
    for (const edge of layout.edges) map.get(edge.from)?.add(edge.to);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- order is derived from layout
  }, [layout]);

  const reaches = (id: string) => allows.get(id) ?? new Set<string>();
  /** Focus keeps the focused layer and everything it may reach; everything else recedes. */
  const inFocus = (id: string) => focus === null || focus === id || reaches(focus).has(id);

  const gutterHeight = rungs.length * ROW_H;

  return (
    <div
      className="flex w-full max-w-2xl flex-col gap-3"
      data-testid="architecture-flow"
      onMouseLeave={() => setFocus(null)}
    >
      {/*
        ⚠️ **One table, not a diagram beside a table.** A first cut floated the ladder and the matrix
        as separate columns; with no surface under the rows the ladder read as sparse text again and
        a wide gap opened between a label and its own cells. Bands of constant height inside one
        panel put a row and its policy on the same line, which is also what lets a focused row
        recede as a unit.
      */}
      <div className="relative overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]">
        {/*
          One arrow with one meaning, drawn over the gutter column. An arrow per permitted pair
          would be 21 strokes on a seven-layer profile and would say nothing the order does not:
          the matrix carries which, this carries which way.
        */}
        <svg
          className="pointer-events-none absolute left-0"
          style={{ top: `${HEADER_H}px` }}
          width={40}
          height={gutterHeight}
          viewBox={`0 0 40 ${gutterHeight}`}
          aria-hidden
        >
          <defs>
            <marker
              id="architecture-ladder-head"
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
          <line
            x1={22}
            y1={18}
            x2={22}
            y2={gutterHeight - 18}
            stroke="var(--color-indigo-a60)"
            strokeWidth="1.5"
            markerEnd="url(#architecture-ladder-head)"
            data-testid="architecture-flow-inward"
          />
        </svg>

        <div
          className="flex items-center pr-4"
          style={{ height: `${HEADER_H}px` }}
          aria-hidden
          data-testid="architecture-matrix-header"
        >
          <span className="w-10 shrink-0" />
          <span className="min-w-0 flex-1" />
          {order.map((id, column) => (
            <span
              key={id}
              className={`${CELL_CLASS} shrink-0 text-center font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)] transition-opacity duration-[var(--motion-fast)] ${
                focus !== null && focus !== id && !reaches(focus).has(id) ? 'opacity-40' : ''
              }`}
            >
              {column + 1}
            </span>
          ))}
        </div>

        <ol className="m-0 list-none p-0" data-testid="architecture-matrix">
          {rungs.map((rung, depth) => (
            <li
              key={rung.join('+')}
              className={`flex ${ROW_CLASS} items-center border-t border-[color:var(--color-divider)] pr-4 transition-opacity duration-[var(--motion-fast)] ${
                rung.every((id) => !inFocus(id)) ? 'opacity-40' : 'opacity-100'
              }`}
              onMouseEnter={() => setFocus(rung[0] ?? null)}
            >
              <span className="w-10 shrink-0" />
              {rung.map((id) => (
                <div key={id} className="flex min-w-0 flex-1 items-center" data-testid={`architecture-rung-${id}`}>
                  <RowButton
                    active={focus === id}
                    hoverInk="strong"
                    hoverSurface="lift"
                    /*
                     * Hover and keyboard focus set the same state, so the reach is reachable
                     * without a pointer. `RowButton` is the registered primitive; a hand-written
                     * control would raise a ratchet that has stood at zero.
                     */
                    onMouseEnter={() => setFocus(id)}
                    onFocus={() => setFocus(id)}
                    onBlur={() => setFocus(null)}
                    onClick={() => setFocus((current) => (current === id ? null : id))}
                    data-testid={`architecture-role-${id}`}
                    data-focus-state={
                      focus === null
                        ? 'rest'
                        : focus === id
                          ? 'focused'
                          : inFocus(id)
                            ? 'reached'
                            : 'dimmed'
                    }
                    className="min-w-0 flex-1 justify-start px-3 py-2 text-left"
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      {/*
                        The index is how a reader decodes a matrix column: seven Korean layer names
                        cannot be written above 112px of cells, and numbering rows and columns alike
                        is what every dependency-structure matrix does instead.
                      */}
                      <span className="shrink-0 font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
                        {depth + 1}
                      </span>
                      <span
                        className={
                          reaches(id).size === 0
                            ? 'shrink-0 text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-indigo-text-soft)]'
                            : 'shrink-0 text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]'
                        }
                      >
                        {roleLabel(id)}
                      </span>
                      <span className="min-w-0 truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
                        {(pathsOf.get(id) ?? []).join('  ·  ')}
                      </span>
                    </span>
                  </RowButton>
                </div>
              ))}

              {/*
                Rows are the consumer, columns the provider, so a filled cell reads "this row may
                depend on that column". A legal layering is a filled triangle and a hole is a gap in
                it -- the exception needs no mark because its position is the exception.
              */}
              <div
                className="flex shrink-0"
                aria-hidden
                data-testid={`architecture-matrix-row-${rung[0]}`}
              >
                {order.map((columnId) => {
                  const rowId = rung[0]!;
                  const state =
                    columnId === rowId ? 'self' : reaches(rowId).has(columnId) ? 'on' : 'off';
                  /*
                   * Linked highlighting: the focused layer's own row and its column both light, so
                   * focusing a band answers "what may it reach" and "who may reach it" at once.
                   */
                  const lit = focus !== null && (focus === rowId || focus === columnId);
                  return (
                    <span key={columnId} data-reach={state} className={`${CELL_CLASS} flex justify-center`}>
                      <span
                        className={
                          state === 'on'
                            ? `size-2 rounded-full transition-colors duration-[var(--motion-fast)] ${lit ? 'bg-[color:var(--color-indigo-brand)]' : 'bg-[color:var(--color-indigo-a60)]'}`
                            : state === 'self'
                              ? 'size-2 rounded-full border border-[color:var(--color-text-quaternary)]'
                              : 'size-2 rounded-full bg-[color:var(--color-overlay-2)]'
                        }
                      />
                    </span>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* The drawing is hidden from assistive technology, so the same facts are stated here. */}
      <ol className="sr-only">
        {order.map((id) => {
          const allowed = [...reaches(id)];
          return (
            <li key={id}>
              {allowed.length === 0
                ? `${roleLabel(id)}: ${sinkLabel}`
                : reachLabel(roleLabel(id), allowed.map(roleLabel).join(', '))}
            </li>
          );
        })}
      </ol>

      {/*
        ⚠️ A legend is not optional here. With an achromatic palette and one accent, shape and
        position carry everything, and C4's own test is that the diagram must still make sense with
        colour removed — which only holds if the reader is told what the marks mean.
      */}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-[color:var(--color-text-quaternary)]">
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
        <span>{legend.columns}</span>
        <span>{directionLabel}</span>
      </p>
    </div>
  );
}
