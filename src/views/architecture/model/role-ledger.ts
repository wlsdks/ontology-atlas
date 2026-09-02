import type { ArchitectureRecord } from '@/entities/architecture-record';

/**
 * What one role box can honestly say about itself.
 *
 * ⚠️ **A rollup, and it says so in edge terms** (2026-08-29, direction B). The reference this came
 * from — a workflow graph — gives every node a status because every node had a *run*. We have no
 * runs, and the one verdict this product owns (`conforms` / `violated` / `unknown`) is per profile,
 * which is exactly as global as the evidence summary that already shows it. So a box never claims a
 * per-role verdict. It states what its own **outgoing edges** did, which is a grouping of facts the
 * receipt already carries, and the wording stays edge-shaped so the two can never be confused.
 *
 * Three limits of the receipt shape this file, and each one is a thing the screen must not say:
 *
 * 1. **The violation list is a sample.** `mcp/src/architecture-profile.mjs` keeps the first 50 and
 *    sets `violationsLimited`. Counting a role's violations out of a truncated list understates it,
 *    so a limited sample is reported as "at least N" rather than as a count.
 * 2. **Unmeasured is not a per-role fact.** `unmappedEdges` and `unruledEdges` are profile-wide
 *    totals with no role attached. A box therefore never says "unmeasured" — that belongs to the
 *    evidence summary, which already carries it.
 * 3. **Only `emptyRoles` names roles.** A role that matched no source file is the one absence the
 *    receipt attributes, so it is the one absence a box states.
 */

export interface RoleLedger {
  /** Named through `RoleLedger['state']` at every use, so the union has no separate export. */
  state: 'clean' | 'violated' | 'no-source';
  /** Outgoing violated edges found in the sample. */
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

/**
 * ⚠️ **No record, no ledger.** Returning an empty map rather than a row of zeros is the point: a
 * box with nothing measured behind it must stay the size it is and say nothing, exactly as it does
 * today in a browser. A zero here would read as "no violations", which is a claim about source
 * nobody has looked at.
 */
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
    // Same-role imports are legal by the scanner's first rule and are the largest count on any
    // repository; a role's own internals are not a crossing and must not be counted as traffic out.
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
