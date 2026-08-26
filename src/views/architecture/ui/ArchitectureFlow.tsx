'use client';

import { useMemo } from 'react';

import {
  buildArchitectureLayout,
  type ArchitectureProfile,
} from '@/entities/architecture-profile';

/**
 * The dependency rules, drawn as nested layers.
 *
 * ⚠️ **Four rounds of owner rejection got here, and each one was the same mistake.** The screen
 * kept being a *list of roles with decoration attached* — first a stack of cards with an arrow
 * between every consecutive pair, then a column of boxes, then bands with arcs in a gutter, then
 * bands with a grid of dots in the corner. Every round asked the reader to assemble the shape from
 * rows. The verdict never changed: *"can you see a flow in this? a flow.."*
 *
 * A flow is not a list. So the drawing is now the one every layered architecture is taught with:
 * **layers nested inside each other, with dependency running inward.** The outermost ring may
 * depend on everything it contains; the core depends on nothing. Containment *is* the rule, so the
 * picture cannot disagree with the data the way the first version did — there are no arrows to
 * point the wrong way, and the sink is at the centre because nothing is inside it.
 *
 * ⚠️ **Containment is only honest when the profile is fully nested.** It claims every outer layer
 * may reach every inner one. `lower-only` says exactly that, and a well-formed hexagonal profile
 * does too. A profile with a hole — an outer layer forbidden from some inner layer — would be
 * over-stated by the rings, so the holes are computed and named beneath the drawing rather than
 * silently drawn as permission.
 */

/** The drawing's own coordinate space; the SVG scales to its container. */
const W = 640;
/** How far each layer sits inside the one that may depend on it. */
const INSET_X = 36;
const INSET_Y = 26;
/** The core is a destination, not a hairline, so it keeps a real height of its own. */
const CORE_H = 72;

export function ArchitectureFlow({
  profile,
  roleLabel,
  reachLabel,
  sinkLabel,
  directionLabel,
  exceptionLabel,
}: {
  profile: ArchitectureProfile;
  roleLabel: (id: string) => string;
  /** Reads one layer's reach aloud, because a drawing is not a sentence. */
  reachLabel: (role: string, targets: string) => string;
  /** What "depends on nothing" is called. */
  sinkLabel: string;
  /** States which way the rings are read. */
  directionLabel: string;
  /** Names a pair the rings would otherwise claim is allowed. */
  exceptionLabel: (from: string, to: string) => string;
}) {
  const layout = useMemo(() => buildArchitectureLayout(profile), [profile]);
  const pathsOf = useMemo(
    () => new Map(profile.roles.map((role) => [role.id, role.paths])),
    [profile],
  );

  /*
   * Outer to inner. A row can hold more than one role at the same depth; they share a ring, which
   * is the truthful reading — same depth means neither may depend on the other.
   */
  const rings = layout.rows;
  const allowedOf = (id: string) =>
    layout.edges.filter((edge) => edge.from === id).map((edge) => edge.to);

  /*
   * ⚠️ The holes. Containment says "outer reaches every inner"; these are the pairs where it does
   * not, and printing them is what keeps the picture from granting permission the profile withheld.
   */
  const exceptions = useMemo(() => {
    const found: Array<{ from: string; to: string }> = [];
    rings.forEach((ring, outer) => {
      for (const from of ring) {
        const allowed = new Set(allowedOf(from));
        for (const inner of rings.slice(outer + 1)) {
          for (const to of inner) {
            if (!allowed.has(to)) found.push({ from, to });
          }
        }
      }
    });
    return found;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rings and edges both come from layout
  }, [layout]);

  const depth = rings.length;
  const height = CORE_H + 2 * (depth - 1) * INSET_Y;
  const coreX = (depth - 1) * INSET_X;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3" data-testid="architecture-flow">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="w-full"
        aria-hidden
        data-testid="architecture-flow-svg"
      >
        <defs>
          <marker
            id="architecture-flow-inward-head"
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

        {rings.map((ring, index) => {
          const isCore = index === depth - 1;
          const x = index * INSET_X;
          const y = index * INSET_Y;
          const w = W - 2 * x;
          const h = height - 2 * y;
          return (
            <g key={ring.join('+')} data-testid={`architecture-layer-${index}`}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx="12"
                fill={isCore ? 'var(--color-indigo-a08)' : 'var(--color-panel)'}
                stroke={isCore ? 'var(--color-indigo-a46)' : 'var(--color-border-soft)'}
                strokeWidth="1"
              />
              {ring.map((id, position) => (
                <text
                  key={id}
                  /*
                   * A ring's label lives in the strip it owns — the band above its child. The core
                   * has no child, so its label sits in the middle of the space it encloses.
                   */
                  x={isCore ? W / 2 : x + 14 + position * 180}
                  y={isCore ? y + h / 2 : y + INSET_Y / 2}
                  textAnchor={isCore ? 'middle' : 'start'}
                  dominantBaseline="middle"
                  data-testid={`architecture-role-${id}`}
                >
                  <tspan
                    className={
                      isCore
                        ? 'fill-[var(--color-indigo-text-soft)] text-body font-[var(--font-weight-emphasis)]'
                        : 'fill-[var(--color-text-primary)] text-body font-[var(--font-weight-emphasis)]'
                    }
                  >
                    {roleLabel(id)}
                  </tspan>
                  <tspan
                    dx="10"
                    className="fill-[var(--color-text-quaternary)] font-mono text-caption"
                  >
                    {(pathsOf.get(id) ?? []).join('  ·  ')}
                  </tspan>
                </text>
              ))}
            </g>
          );
        })}

        {/*
          ⚠️ The arrow is the reason this reads as a flow rather than as a set of boxes. It runs
          from outside the outermost ring to the edge of the core, piercing every boundary on the
          way, so the direction of dependency is a single stroke the eye follows in one movement.
        */}
        <line
          x1={10}
          y1={height / 2}
          x2={coreX - 8}
          y2={height / 2}
          stroke="var(--color-indigo-a60)"
          strokeWidth="1.5"
          markerEnd="url(#architecture-flow-inward-head)"
          data-testid="architecture-flow-inward"
        />
      </svg>

      {/* The drawing is hidden from assistive technology, so the same facts are stated here. */}
      <ol className="sr-only">
        {rings.flat().map((id) => {
          const allowed = allowedOf(id);
          return (
            <li key={id}>
              {allowed.length === 0
                ? `${roleLabel(id)}: ${sinkLabel}`
                : reachLabel(roleLabel(id), allowed.map(roleLabel).join(', '))}
            </li>
          );
        })}
      </ol>

      <p className="text-caption text-[color:var(--color-text-quaternary)]">{directionLabel}</p>

      {exceptions.length > 0 ? (
        <ul
          className="flex flex-col gap-1 text-caption text-[color:var(--color-amber-source-a90)]"
          data-testid="architecture-nest-exceptions"
        >
          {exceptions.map(({ from, to }) => (
            <li key={`${from}->${to}`}>{exceptionLabel(roleLabel(from), roleLabel(to))}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
