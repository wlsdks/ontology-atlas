import {
  scopeReaches,
  type CoverageColumn,
  type ScopeDeclaration,
} from './coverage-scopes';

/**
 * Joins vault areas (what each part is for) with path scopes files declare. Empty cells are
 * results, and nothing is scored or graded.
 */

export interface CoverageCapability {
  slug: string;
  title: string;
  /** The canonical implementation entrypoint the vault records. */
  path: string;
}

export interface CoverageAreaInput {
  slug: string;
  title: string;
  /** The vault's sentence for this area, which makes an empty cell readable. */
  purpose: string;
  capabilities: readonly CoverageCapability[];
}

export interface CoverageAreaRow extends CoverageAreaInput {
  told: readonly ScopeDeclaration[];
  gated: readonly ScopeDeclaration[];
  watched: readonly ScopeDeclaration[];
  /** Test files a runner discovers under this area's paths. */
  discoveredTests: number;
}

export interface CoverageMatrix {
  areas: readonly CoverageAreaRow[];
  /** Path-less declarations, listed once instead of repeated down a column. */
  everywhere: Readonly<Record<CoverageColumn, readonly ScopeDeclaration[]>>;
  /** Areas with nothing in the Watched column. */
  unwatchedAreas: readonly string[];
  /** Areas with nothing in the Gated column. */
  ungatedAreas: readonly string[];
  /** Capabilities no scoped guide reaches. */
  unreachedCapabilities: readonly CoverageCapability[];
  /** Declarations whose paths reach no recorded area, kept rather than dropped. */
  outsideAreas: readonly ScopeDeclaration[];
}

const COLUMNS: readonly CoverageColumn[] = ['told', 'gated', 'watched'];

function sortDeclarations(list: ScopeDeclaration[]): ScopeDeclaration[] {
  return list.sort((a, b) => a.label.localeCompare(b.label));
}

/** The only place the join rule lives. */
export function buildCoverageMatrix(
  declarations: readonly ScopeDeclaration[],
  areas: readonly CoverageAreaInput[],
  testFiles: readonly string[] = [],
): CoverageMatrix {
  /* A scope reaching every area is universal in fact and goes to the strip, not every row. */
  const reachesEveryArea = (entry: ScopeDeclaration) =>
    areas.length > 1 &&
    areas.every((area) =>
      area.capabilities.some((capability) =>
        entry.scopes.some((scope) => scopeReaches(scope, capability.path)),
      ),
    );
  const scoped = declarations.filter(
    (entry) => entry.declaresPath && entry.scopes.length > 0 && !reachesEveryArea(entry),
  );
  const everywhere: Record<CoverageColumn, ScopeDeclaration[]> = {
    told: [],
    gated: [],
    watched: [],
  };
  for (const entry of declarations) {
    if (!entry.declaresPath || reachesEveryArea(entry)) everywhere[entry.column].push(entry);
  }
  for (const column of COLUMNS) sortDeclarations(everywhere[column]);

  const rows: CoverageAreaRow[] = areas.map((area) => {
    const buckets: Record<CoverageColumn, ScopeDeclaration[]> = {
      told: [],
      gated: [],
      watched: [],
    };
    for (const entry of scoped) {
      const hits = area.capabilities.some((capability) =>
        entry.scopes.some((scope) => scopeReaches(scope, capability.path)),
      );
      if (hits) buckets[entry.column].push(entry);
    }
    for (const column of COLUMNS) sortDeclarations(buckets[column]);
    const discoveredTests = testFiles.filter((file) =>
      area.capabilities.some(
        (capability) => file === capability.path || file.startsWith(`${capability.path}/`),
      ),
    ).length;
    return {
      ...area,
      told: buckets.told,
      gated: buckets.gated,
      watched: buckets.watched,
      discoveredTests,
    };
  });

  const unreachedCapabilities: CoverageCapability[] = [];
  for (const area of areas) {
    for (const capability of area.capabilities) {
      const reached = scoped.some(
        (entry) =>
          entry.column === 'told' &&
          entry.scopes.some((scope) => scopeReaches(scope, capability.path)),
      );
      if (!reached) unreachedCapabilities.push(capability);
    }
  }

  const attached = new Set<string>();
  for (const row of rows) {
    for (const column of COLUMNS) for (const entry of row[column]) attached.add(entry.id);
  }

  return {
    areas: rows,
    everywhere,
    outsideAreas: scoped.filter((entry) => !attached.has(entry.id)),
    unwatchedAreas: rows.filter((row) => row.watched.length === 0).map((row) => row.slug),
    ungatedAreas: rows.filter((row) => row.gated.length === 0).map((row) => row.slug),
    unreachedCapabilities,
  };
}
