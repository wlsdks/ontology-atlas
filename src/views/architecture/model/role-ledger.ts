import type { ArchitectureRecord } from '@/entities/architecture-record';

/**
 * What one role box can honestly say: what its outgoing edges did, never a per-role verdict (the
 * verdict is per profile). The violation list is a 50-item sample, so a limited sample is a floor;
 * unmapped and unruled edges carry no role; only `emptyRoles` names a role's absence.
 */

export interface RoleLedger {
  /** Named through `RoleLedger['state']` at every use, so the union has no separate export. */
  state: 'clean' | 'violated' | 'no-source';
  violated: number;
  /** Distinct outgoing measured crossings, same-role excluded. */
  outgoing: number;
  /** The sample was truncated, so `violated` is a floor rather than a count. */
  sampleLimited: boolean;
  /** Imports leaving this role, same-role excluded — the count a stroke width can only approximate. */
  importsOut: number;
}

interface ViolationRow {
  fromRole: string;
}

function violationRows(value: unknown): ViolationRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is ViolationRow =>
      typeof row === 'object' &&
      row !== null &&
      typeof (row as { fromRole?: unknown }).fromRole === 'string',
  );
}

/** No record, no ledger: a row of zeros would claim "no violations" about unread source. */
export function buildRoleLedgers(
  roleIds: readonly string[],
  record: ArchitectureRecord | null | undefined,
): Record<string, RoleLedger> {
  const conformance = record?.brief.conformance;
  if (!conformance) return {};

  const sampleLimited =
    (conformance as { violationsLimited?: unknown }).violationsLimited === true;
  const emptyRoles = new Set(conformance.unknown?.emptyRoles ?? []);
  const violatedByRole = new Map<string, number>();
  for (const row of violationRows(conformance.violations)) {
    violatedByRole.set(row.fromRole, (violatedByRole.get(row.fromRole) ?? 0) + 1);
  }

  const outgoingByRole = new Map<string, { edges: number; imports: number }>();
  for (const edge of conformance.observedRoleEdges ?? []) {
    // Same-role imports are always legal and are the largest counts; they are not traffic out.
    if (edge.fromRole === edge.toRole) continue;
    const seen = outgoingByRole.get(edge.fromRole) ?? { edges: 0, imports: 0 };
    seen.edges += 1;
    seen.imports += edge.count;
    outgoingByRole.set(edge.fromRole, seen);
  }

  const ledgers: Record<string, RoleLedger> = {};
  for (const id of roleIds) {
    const violated = violatedByRole.get(id) ?? 0;
    const out = outgoingByRole.get(id) ?? { edges: 0, imports: 0 };
    ledgers[id] = {
      state: emptyRoles.has(id) ? 'no-source' : violated > 0 ? 'violated' : 'clean',
      violated,
      outgoing: out.edges,
      sampleLimited,
      importsOut: out.imports,
    };
  }
  return ledgers;
}
