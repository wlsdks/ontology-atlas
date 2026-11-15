import { buildArchitectureLayout, type ArchitectureProfile } from '@/entities/architecture-profile';
import type { ArchitectureRoleEdge } from '@/entities/architecture-record';

/**
 * - `self`: the diagonal; imports inside one role are always allowed and not counted.
 * - `violation`: the record counted imports on this pair against the rules.
 * - `observed`: the rules allow the pair and imports were seen.
 * - `allowed`: the rules allow the pair and nothing was seen (or nothing was measured yet).
 * - `uncounted`: the rules forbid the pair, imports were seen, but none was counted as a violation
 *   (an import usage the profile does not govern, such as type-only).
 * - `forbidden`: the rules forbid the pair and nothing was seen.
 */
export type ImportCellKind = 'self' | 'violation' | 'observed' | 'allowed' | 'uncounted' | 'forbidden';

/** One violating import as the record sampled it: the importing file and the imported one. */
export interface ViolationEvidence {
  from: string;
  to: string;
}

export interface ImportCell {
  from: string;
  to: string;
  kind: ImportCellKind;
  allowed: boolean;
  /** Imports observed from `from` into `to`; 0 without a record. */
  count: number;
  /** Violation rows the record carries for this pair. */
  violations: number;
  evidence: ViolationEvidence[];
}

export interface ImportMatrix {
  /** Role ids in profile order: both the rows and the columns. */
  order: string[];
  /** `cells[row][column]`: imports from the row's role into the column's. */
  cells: ImportCell[][];
  /** The busiest cross-role pair, which the fill ladder is scaled against. */
  maxCount: number;
  /** Imports observed between two different roles. */
  crossRoleImports: number;
}

interface ViolationRow {
  fromRole: string;
  toRole: string;
  from: string | null;
  to: string | null;
}

/** The record's violation rows that name both roles; `violations` is `unknown[]` by contract. */
export function readViolationRows(violations: readonly unknown[]): ViolationRow[] {
  const rows: ViolationRow[] = [];
  for (const row of violations) {
    if (!row || typeof row !== 'object') continue;
    const { fromRole, toRole, from, to } = row as Record<string, unknown>;
    if (typeof fromRole !== 'string' || typeof toRole !== 'string') continue;
    rows.push({
      fromRole,
      toRole,
      from: typeof from === 'string' ? from : null,
      to: typeof to === 'string' ? to : null,
    });
  }
  return rows;
}

/**
 * The roles-by-roles import table. Building it is O(R² + E + V) for R roles, E observed edges and
 * V violation rows: one pass fills an R×R array, each edge and row is one keyed lookup.
 */
export function buildImportMatrix(
  profile: ArchitectureProfile,
  edges: readonly ArchitectureRoleEdge[],
  violations: readonly unknown[],
): ImportMatrix {
  const order = profile.roles.map((role) => role.id);
  const indexOf = new Map(order.map((id, index) => [id, index]));
  const allowed = new Set(buildArchitectureLayout(profile).edges.map((edge) => `${edge.from}>${edge.to}`));

  const cells: ImportCell[][] = order.map((from) =>
    order.map((to) => ({
      from,
      to,
      kind: 'forbidden' as ImportCellKind,
      allowed: from !== to && allowed.has(`${from}>${to}`),
      count: 0,
      violations: 0,
      evidence: [],
    })),
  );
  const cellOf = (from: string, to: string): ImportCell | null => {
    const row = indexOf.get(from);
    const column = indexOf.get(to);
    return row === undefined || column === undefined ? null : cells[row]![column]!;
  };

  for (const edge of edges) {
    const cell = cellOf(edge.fromRole, edge.toRole);
    if (cell) cell.count += edge.count;
  }
  for (const row of readViolationRows(violations)) {
    const cell = cellOf(row.fromRole, row.toRole);
    if (!cell || cell.from === cell.to) continue;
    cell.violations += 1;
    if (row.from && row.to) cell.evidence.push({ from: row.from, to: row.to });
  }

  let maxCount = 0;
  let crossRoleImports = 0;
  for (const row of cells) {
    for (const cell of row) {
      cell.kind = cellKind(cell);
      if (cell.from === cell.to) continue;
      crossRoleImports += cell.count;
      maxCount = Math.max(maxCount, cell.count);
    }
  }
  return { order, cells, maxCount, crossRoleImports };
}

function cellKind(cell: ImportCell): ImportCellKind {
  if (cell.from === cell.to) return 'self';
  if (cell.violations > 0) return 'violation';
  if (cell.allowed) return cell.count > 0 ? 'observed' : 'allowed';
  return cell.count > 0 ? 'uncounted' : 'forbidden';
}

/**
 * The fill step for an observed count, 1..steps: by the square root of its share of the busiest
 * pair, so one busy crossing does not flatten the rest. 0 for no imports.
 */
export function fillStep(count: number, maxCount: number, steps: number): number {
  if (count <= 0 || maxCount <= 0 || steps <= 0) return 0;
  return Math.max(1, Math.min(steps, Math.ceil(Math.sqrt(count / maxCount) * steps)));
}

/**
 * The role a person arriving should see: the source of the first violation, else the first role
 * that imports another, else the first role. O(R² + V).
 */
export function arrivalRole(matrix: ImportMatrix, violations: readonly unknown[]): string | null {
  const first = readViolationRows(violations).find((row) => matrix.order.includes(row.fromRole));
  if (first) return first.fromRole;
  const importing = matrix.cells.find((row) => row.some((cell) => cell.from !== cell.to && cell.count > 0));
  return importing?.[0]?.from ?? matrix.order[0] ?? null;
}

/** A role's imports out of (`row`) or into (`column`) it, busiest first, with violations kept. */
export function roleImports(matrix: ImportMatrix, roleId: string, direction: 'out' | 'in'): ImportCell[] {
  const index = matrix.order.indexOf(roleId);
  if (index === -1) return [];
  const line =
    direction === 'out' ? matrix.cells[index]! : matrix.cells.map((row) => row[index]!);
  return line
    .filter((cell) => cell.from !== cell.to && (cell.count > 0 || cell.violations > 0))
    .sort((a, b) => b.violations - a.violations || b.count - a.count);
}
