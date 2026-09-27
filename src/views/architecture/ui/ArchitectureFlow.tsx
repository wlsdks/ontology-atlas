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
 * The architecture canvas: a graph of reviewed roles with a dock for the selected one. The
 * diagram and the document are separate artifacts (`docs/DECISIONS.md`, 2026-08-28 (3)): boxes
 * stay small so an edge has a side to leave from. `buildArchitectureGraph` decides which strokes
 * earn a line and reports it through `edgeSource`.
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
  deltaUnknownLabel,
  contractTrackLabel,
  observationTrackLabel,
  deltaTrackLabel,
  deltaColumnHint,
  observationMissingLabel,
  observationEmptyTitle,
  observationEmptyBody,
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
  /** Measured crossings from the persisted record; undefined draws no traffic rather than guessing. */
  roleTraffic?: readonly ArchitectureRoleEdge[];
  /** Only each role's own outgoing edges are read here; the profile verdict stays in the evidence summary. */
  record?: ArchitectureRecord | null;
  /** The profile's own sentence for a role, or null; the box prints it in place of counts. */
  roleSummary: (id: string) => string | null;
  edgeSentence: (edge: SentenceEdge) => string;
  ledgerStatusLabel: (ledger: RoleLedger) => string;
  /** `from>to` for each crossing the receipt counted as a violation; drawn apart from the rest. */
  violatedPairs: ReadonlySet<string>;
  ledgerImportsLabel: (count: number) => string;
  /** What the comparison mark says before any source has been observed. */
  deltaUnknownLabel: string;
  contractTrackLabel: string;
  observationTrackLabel: string;
  deltaTrackLabel: string;
  deltaColumnHint: string;
  observationMissingLabel: string;
  /** The one empty state the measured columns show before any source was inspected. */
  observationEmptyTitle: string;
  observationEmptyBody: string;
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
          deltaUnknownLabel={deltaUnknownLabel}
          contractTrackLabel={contractTrackLabel}
          observationTrackLabel={observationTrackLabel}
          deltaTrackLabel={deltaTrackLabel}
          deltaColumnHint={deltaColumnHint}
          observationMissingLabel={observationMissingLabel}
          observationEmptyTitle={observationEmptyTitle}
          observationEmptyBody={observationEmptyBody}
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
