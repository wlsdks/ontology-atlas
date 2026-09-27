import {
  scopeReaches,
  type CoverageAreaRow,
  type CoverageCapability,
  type CoverageColumn,
  type ScopeDeclaration,
} from '@/entities/agent-files';

interface HarnessDeclarationEvidence {
  /** The exact declaration object emitted by the repository scan and matrix join. */
  declaration: ScopeDeclaration;
  /** Only the capability entrypoints this declaration reaches through the canonical predicate. */
  matchedCapabilities: readonly CoverageCapability[];
}

interface HarnessRoleEvidence {
  column: CoverageColumn;
  declarations: readonly HarnessDeclarationEvidence[];
}

interface HarnessAreaEvidence {
  slug: string;
  title: string;
  purpose: string;
  capabilities: readonly CoverageCapability[];
  discoveredTests: number;
  roles: Readonly<Record<CoverageColumn, HarnessRoleEvidence>>;
}

export interface HarnessCoverageEvidence {
  areas: readonly HarnessAreaEvidence[];
  /** Unscoped or universal declarations, listed once rather than per area. */
  everywhere: Readonly<Record<CoverageColumn, readonly ScopeDeclaration[]>>;
  /** Scoped declarations whose paths reach none of the ontology-recorded areas. */
  outsideAreas: readonly ScopeDeclaration[];
  unreachedCapabilities: readonly CoverageCapability[];
}

export interface HarnessCoverageProjectionInput {
  areas: readonly CoverageAreaRow[];
  everywhere: Readonly<Record<CoverageColumn, readonly ScopeDeclaration[]>>;
  outsideAreas: readonly ScopeDeclaration[];
  unreachedCapabilities: readonly CoverageCapability[];
}

/**
 * Adds display evidence to the matrix without rescanning or changing its join: the same exported predicate names
 * which capability entrypoints justified each attribution. It does not check paths on disk or claim a hook ran.
 */
export function projectHarnessCoverageEvidence(
  matrix: HarnessCoverageProjectionInput,
): HarnessCoverageEvidence {
  return {
    areas: matrix.areas.map((area) => {
      const projectRole = (column: CoverageColumn): HarnessRoleEvidence => ({
        column,
        declarations: area[column].map((declaration) => ({
          declaration,
          matchedCapabilities: area.capabilities.filter((capability) =>
            declaration.scopes.some((scope) => scopeReaches(scope, capability.path)),
          ),
        })),
      });
      const roles: Readonly<Record<CoverageColumn, HarnessRoleEvidence>> = {
        told: projectRole('told'),
        gated: projectRole('gated'),
        watched: projectRole('watched'),
      };
      return {
        slug: area.slug,
        title: area.title,
        purpose: area.purpose,
        capabilities: area.capabilities,
        discoveredTests: area.discoveredTests,
        roles,
      };
    }),
    everywhere: matrix.everywhere,
    outsideAreas: matrix.outsideAreas,
    unreachedCapabilities: matrix.unreachedCapabilities,
  };
}
