import {
  scopeReaches,
  type CoverageColumn,
  type ScopeDeclaration,
} from './coverage-scopes';

/**
 * **Crossing what the repository declares with what the vault knows the repository is for.**
 *
 * Every tool in this category scores a repository out of its files, and the one team that built one
 * and audited it against 21 real repositories found it gave an official reference implementation
 * the same verdict as an abandoned toy, because a file scan cannot tell "this is missing" from
 * "this is correctly absent". Telling those apart needs to know what a part of the repository is
 * **for**, and that is the one thing a vault records and a scanner cannot derive.
 *
 * So this module never grades. It joins two lists of facts:
 *
 * - **From the vault**: the domains recorded in files a person can read, correct and reject in a
 *   diff, each with the implementation paths its capabilities point at and the sentence saying what
 *   the domain is for. Not "approved": the vault's own approval keys are used by one node in 105,
 *   and the claim this screen may make is that the meaning is owned and overrulable, not signed.
 * - **From the repository**: files that declare a path scope (`coverage-scopes.ts`).
 *
 * A declaration lands in an area when a path it declares reaches a path the vault records for that
 * area. Nothing else puts it there. The output carries the declaration text with every entry so the
 * attribution is checkable, and it carries the empty cells as first-class results, because an empty
 * cell beside a sentence saying what the area is for is the only thing here a file scanner cannot
 * write.
 *
 * **No score, no grade, no percentage, no maturity level.** Counts are a census of what was found;
 * the judgement stays with the person reading it.
 */

/** One capability the vault records, reduced to what the join needs. */
export interface CoverageCapability {
  slug: string;
  title: string;
  /** The canonical repo-relative implementation entrypoint the vault records. */
  path: string;
}

/** One area of the repository, as the vault defines it. */
export interface CoverageAreaInput {
  slug: string;
  title: string;
  /**
   * What this area is for, in the vault's own words. It is what makes an empty cell readable: "this
   * area does X and no check names it" rather than "a file is absent".
   */
  purpose: string;
  capabilities: readonly CoverageCapability[];
}

export interface CoverageAreaRow extends CoverageAreaInput {
  told: readonly ScopeDeclaration[];
  gated: readonly ScopeDeclaration[];
  watched: readonly ScopeDeclaration[];
  /**
   * Test files sitting under this area's recorded paths, found by a runner's own discovery rather
   * than by being named in a command. The second half of what an empty Watched cell means.
   */
  discoveredTests: number;
}

export interface CoverageMatrix {
  areas: readonly CoverageAreaRow[];
  /**
   * Declarations that name no path at all. They reach every area by declaration, and are listed
   * once rather than repeated down a column — repeating them would make eight identical hits look
   * like eight separate findings.
   */
  everywhere: Readonly<Record<CoverageColumn, readonly ScopeDeclaration[]>>;
  /** Areas with nothing in the Watched column. The one count the matrix makes possible. */
  unwatchedAreas: readonly string[];
  /** Areas with nothing in the Gated column. */
  ungatedAreas: readonly string[];
  /**
   * Capabilities no scoped guide reaches. A blank here is a finding about the repository, not about
   * the mapping — and on a repository where it is empty, that is worth saying out loud.
   */
  unreachedCapabilities: readonly CoverageCapability[];
  /**
   * Declarations that name a path reaching none of the recorded areas. Neither universal nor
   * attached to a row, so they are held here rather than silently dropped: a check scoped to a
   * folder no capability points at is a fact about the vault's coverage of its own repository.
   */
  outsideAreas: readonly ScopeDeclaration[];
}

const COLUMNS: readonly CoverageColumn[] = ['told', 'gated', 'watched'];

function sortDeclarations(list: ScopeDeclaration[]): ScopeDeclaration[] {
  return list.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Areas × declarations. Pure, and the only place the join rule lives, so the screen, the tests and
 * the contract read the same answer.
 */
export function buildCoverageMatrix(
  declarations: readonly ScopeDeclaration[],
  areas: readonly CoverageAreaInput[],
  testFiles: readonly string[] = [],
): CoverageMatrix {
  /*
   * A scope that reaches every recorded area is universal in fact even though it declares a path,
   * and it belongs in the strip for the same reason a path-less one does: printed in every row it
   * turns one fact into eight findings. Measured here — `pre-push`'s `^(src|app)/` reached all
   * eight of this repository's domains, so the Gated column said one bit eight times and read as
   * decoration (design-lead, 2026-09-13).
   */
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
