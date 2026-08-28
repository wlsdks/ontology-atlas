"use client";

import { useMemo } from 'react';

import {
  buildArchitectureLayout,
  type ArchitectureProfile,
} from '@/entities/architecture-profile';
import type { ArchitectureRoleEdge } from '@/entities/architecture-record';

import { buildArchitectureGraph } from '../model/graph-layout';
import type { RoleConcept } from '../model/role-concepts';
import type { RoleSourceModule } from '../model/source-modules';
import { ArchitectureSketch } from './ArchitectureSketch';


/**
 * The architecture stage: a horizontal graph of the reviewed roles, and one panel for whichever
 * role is selected.
 *
 * ⚠️ **The diagram and the document are separate artifacts** (`docs/DECISIONS.md`, 2026-08-28 (3)).
 * This used to be a stack of full-width bands that carried their own prose, modules and concepts
 * inside them. Drawing edges onto that was tried and reverted: a 250px-tall full-width block gives
 * a stroke nothing to attach to, so every arc left and arrived at the same x and the set collapsed
 * into an unreadable bundle. The boxes are small now precisely so an edge has a side to leave
 * from, and everything they used to hold lives in the panel beside them.
 *
 * ⚠️ **A stroke has to carry something the columns cannot.** `buildArchitectureGraph` owns that
 * rule and reports which case this profile is in through `edgeSource`; the legend states it rather
 * than assuming. Under `lower-only` the permitted set is the column order restated, so it is drawn
 * as nothing at all.
 */
export function ArchitectureFlow({
  profile,
  modules,
  concepts,
  roleTraffic,
  selected,
  onSelect,
  roleLabel,
  reachLabel,
  sinkLabel,
  directionLabel,
  moduleCountLabel,
  sourceUnavailableBody,
  conceptCountLabel,
  legendPermitted,
  legendTraffic,
  legendSkipHint,
  legendShapeEnd,
  legendShapeWork,
  runLabel,
  permittedEdgeLabel,
  trafficEdgeLabel,
}: {
  profile: ArchitectureProfile;
  /**
   * Source modules per role id, from the read-only directory walk of the bound project source, or
   * `null` when this surface has no listing (browser, unbound project, still loading).
   */
  modules: Readonly<Record<string, RoleSourceModule[]>> | null;
  /** The labeled meaning layer: reviewed concepts whose `path` sits inside the role's globs. */
  concepts: Readonly<Record<string, RoleConcept[]>>;
  /**
   * Measured crossings between roles, from the persisted conformance record. Undefined where no
   * record exists; the stage then draws no traffic at all rather than guessing at any.
   */
  roleTraffic?: readonly ArchitectureRoleEdge[];
  /** The chosen role, owned by the page so the canvas and the detail can sit in different rows. */
  selected: string | null;
  onSelect: (id: string) => void;
  roleLabel: (id: string) => string;
  reachLabel: (role: string, targets: string) => string;
  sinkLabel: string;
  directionLabel: string;
  moduleCountLabel: (count: number) => string;
  /** One sentence naming why no source listing exists here, or `null` when one does. */
  sourceUnavailableBody: string | null;
  conceptCountLabel: (count: number) => string;
  legendPermitted: string;
  legendTraffic: string;
  legendSkipHint: string;
  legendShapeEnd: string;
  legendShapeWork: string;
  runLabel: string;
  permittedEdgeLabel: (from: string, to: string) => string;
  trafficEdgeLabel: (from: string, to: string, count: number) => string;
}) {
  const layout = useMemo(() => buildArchitectureLayout(profile), [profile]);
  const graph = useMemo(
    () => buildArchitectureGraph(layout, roleTraffic ?? []),
    [layout, roleTraffic],
  );

  const order = layout.rows.flat();

  const allows = useMemo(() => {
    const map = new Map<string, Set<string>>(order.map((id) => [id, new Set<string>()]));
    for (const edge of layout.edges) map.get(edge.from)?.add(edge.to);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- order is derived from layout
  }, [layout]);
  const reaches = (id: string) => allows.get(id) ?? new Set<string>();

  const moduleCounts = useMemo(() => {
    if (modules === null) return null;
    return Object.fromEntries(order.map((id) => [id, (modules[id] ?? []).length]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- order is derived from layout
  }, [modules, layout]);
  const conceptCounts = useMemo(
    () => Object.fromEntries(order.map((id) => [id, (concepts[id] ?? []).length])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- order is derived from layout
    [concepts, layout],
  );


  return (
    <div className="flex w-full flex-col gap-3" data-testid="architecture-flow">
      <div className="relative flex flex-col gap-3 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
        {sourceUnavailableBody !== null ? (
          <p
            className="break-keep rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-3 py-2.5 text-caption text-[color:var(--color-text-quaternary)]"
            data-testid="architecture-source-unavailable"
          >
            {sourceUnavailableBody}
          </p>
        ) : null}

        <ArchitectureSketch
          graph={graph}
          selected={selected !== null && order.includes(selected) ? selected : null}
          onSelect={onSelect}
          roleLabel={roleLabel}
          moduleCountLabel={moduleCountLabel}
          conceptCountLabel={conceptCountLabel}
          permittedEdgeLabel={permittedEdgeLabel}
          trafficEdgeLabel={trafficEdgeLabel}
          moduleCounts={moduleCounts}
          conceptCounts={conceptCounts}
          runLabel={runLabel}
        />

        {/*
          A legend for a mark nobody drew is noise, so each row appears only in the case that draws
          it. The arrow sentence stays whenever any stroke exists, because both kinds point.
        */}
        {graph.edges.length === 0 ? null : (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[color:var(--color-divider)] pt-3 text-caption text-[color:var(--color-text-quaternary)]">
            {/*
              ⚠️ **The shape key comes first, because the shapes are drawn before any stroke is.**
              A fresh-eyes walkthrough on 2026-08-28 read the whole legend and still could not say
              what the two shapes meant: it explained only the lines. `docs/AGENT-DESIGN-METHOD.md`
              states the rule this broke — every legend row names a mark that is on screen, and
              every mark on screen states itself somewhere readable. A shape carrying meaning with
              no key is the second half of that failing.
            */}
            <span className="flex items-center gap-1.5">
              <svg width={22} height={12} aria-hidden>
                <rect
                  x={1}
                  y={1}
                  width={20}
                  height={10}
                  rx={5}
                  fill="none"
                  stroke="var(--color-architecture-sketch-ink)"
                  strokeWidth={1.2}
                />
              </svg>
              {legendShapeEnd}
            </span>
            <span className="flex items-center gap-1.5">
              <svg width={22} height={12} aria-hidden>
                <rect
                  x={1}
                  y={1}
                  width={20}
                  height={10}
                  fill="none"
                  stroke="var(--color-architecture-sketch-ink)"
                  strokeWidth={1.2}
                />
              </svg>
              {legendShapeWork}
            </span>
            <span>{directionLabel}</span>
            {graph.edgeSource === 'permitted' || graph.edgeSource === 'both' ? (
              <span className="flex items-center gap-1.5">
                <svg width={18} height={6} aria-hidden>
                  <line
                    x1={0}
                    y1={3}
                    x2={18}
                    y2={3}
                    stroke="var(--color-indigo-a60)"
                    strokeWidth={1.5}
                  />
                </svg>
                {legendPermitted}
              </span>
            ) : null}
            {graph.edgeSource === 'traffic' || graph.edgeSource === 'both' ? (
              <span className="flex items-center gap-1.5">
                <svg width={18} height={6} aria-hidden>
                  <line
                    x1={0}
                    y1={3}
                    x2={18}
                    y2={3}
                    stroke="var(--color-indigo-a38)"
                    strokeWidth={3}
                  />
                </svg>
                {legendTraffic}
              </span>
            ) : null}
            {/* The canvas hides skips until an end is chosen, so it says so. A drawing that
                quietly withholds a fact is the same defect as one that quietly invents it. */}
            {graph.edges.some((edge) => edge.columnSpan > 1) ? (
              <span>{legendSkipHint}</span>
            ) : null}
          </p>
        )}
      </div>

      {/* The drawing is hidden from assistive technology, so the policy is stated in words here. */}
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
    </div>
  );
}
