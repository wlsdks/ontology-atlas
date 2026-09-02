"use client";

import { useMemo } from 'react';

import {
  buildArchitectureLayout,
  type ArchitectureProfile,
} from '@/entities/architecture-profile';
import type { ArchitectureRecord, ArchitectureRoleEdge } from '@/entities/architecture-record';

import { buildArchitectureGraph } from '../model/graph-layout';
import type { SentenceEdge } from '../model/edge-sentences';
import { buildRoleLedgers, type RoleLedger } from '../model/role-ledger';
import type { RoleConcept } from '../model/role-concepts';
import type { RoleSourceModule } from '../model/source-modules';
import { ArchitectureSketch } from './ArchitectureSketch';


/**
 * The architecture canvas: a measured graph of reviewed roles with an adjacent dock for the role
 * a person selects.
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
 * than assuming. Under `lower-only`, adjacent roles keep the readable spine while skip rules are
 * withheld until selection because the column order already carries them.
 */
export function ArchitectureFlow({
  profile,
  modules,
  concepts,
  roleTraffic,
  record,
  roleSummary,
  edgeSentence,
  ledgerStatusLabel,
  ledgerImportsLabel,
  contractTrackLabel,
  observationTrackLabel,
  deltaTrackLabel,
  observationMissingLabel,
  violatedPairs,
  selected,
  roleInspectorOpen,
  onSelect,
  roleLabel,
  reachLabel,
  sinkLabel,
  moduleCountLabel,
  conceptCountLabel,
  hiddenRightLabel,
  hiddenLeftLabel,
  hiddenAboveLabel,
  hiddenBelowLabel,
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
   * record exists; the canvas then draws no traffic at all rather than guessing at any.
   */
  roleTraffic?: readonly ArchitectureRoleEdge[];
  /**
   * The persisted receipt, or null. Only what each role's own outgoing edges did is read from it
   * here; the whole-profile verdict stays where it already is, in the evidence summary.
   */
  record?: ArchitectureRecord | null;
  /** The profile's own sentence for a role, or null; the box prints it in place of counts. */
  roleSummary: (id: string) => string | null;
  edgeSentence: (edge: SentenceEdge) => string;
  ledgerStatusLabel: (ledger: RoleLedger) => string;
  /** `from>to` for each crossing the receipt counted as a violation; drawn apart from the rest. */
  violatedPairs: ReadonlySet<string>;
  ledgerImportsLabel: (count: number) => string;
  contractTrackLabel: string;
  observationTrackLabel: string;
  deltaTrackLabel: string;
  observationMissingLabel: string;
  /** The chosen role, owned by the page so the canvas and the detail can sit in different rows. */
  selected: string | null;
  roleInspectorOpen: boolean;
  onSelect: (id: string, trigger: SVGGElement) => void;
  roleLabel: (id: string) => string;
  reachLabel: (role: string, targets: string) => string;
  sinkLabel: string;
  moduleCountLabel: (count: number) => string;
  conceptCountLabel: (count: number) => string;
  hiddenRightLabel: (count: number) => string;
  hiddenLeftLabel: (count: number) => string;
  hiddenAboveLabel: (count: number) => string;
  hiddenBelowLabel: (count: number) => string;
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
  const ledgers = useMemo(
    () => buildRoleLedgers(order, record ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- order is derived from layout
    [record, layout],
  );
  const conceptCounts = useMemo(
    () => Object.fromEntries(order.map((id) => [id, (concepts[id] ?? []).length])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- order is derived from layout
    [concepts, layout],
  );


  return (
    <div
      className="architecture-canvas-ground flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-panel border border-[color:var(--color-border-soft)]"
      data-testid="architecture-flow"
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <ArchitectureSketch
          graph={graph}
          selected={selected !== null && order.includes(selected) ? selected : null}
          roleInspectorOpen={roleInspectorOpen}
          onSelect={onSelect}
          roleLabel={roleLabel}
          ledgers={ledgers}
          roleSummary={roleSummary}
          edgeSentence={edgeSentence}
          violatedPairs={violatedPairs}
          ledgerStatusLabel={ledgerStatusLabel}
          ledgerImportsLabel={ledgerImportsLabel}
          contractTrackLabel={contractTrackLabel}
          observationTrackLabel={observationTrackLabel}
          deltaTrackLabel={deltaTrackLabel}
          observationMissingLabel={observationMissingLabel}
          moduleCountLabel={moduleCountLabel}
          conceptCountLabel={conceptCountLabel}
          moduleCounts={moduleCounts}
          conceptCounts={conceptCounts}
          hiddenRightLabel={hiddenRightLabel}
          hiddenLeftLabel={hiddenLeftLabel}
          hiddenAboveLabel={hiddenAboveLabel}
          hiddenBelowLabel={hiddenBelowLabel}
        />
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
