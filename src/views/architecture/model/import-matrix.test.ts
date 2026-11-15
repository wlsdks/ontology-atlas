import { describe, expect, it } from 'vitest';

import { parseArchitectureProfile } from '@/entities/architecture-profile';
import type { ArchitectureRoleEdge } from '@/entities/architecture-record';

import {
  FSD_PROFILE_FRONTMATTER,
  HEXAGONAL_PROFILE_FRONTMATTER,
} from '../../../../tests/fixtures/architecture-profile-cases.mjs';
import { arrivalRole, buildImportMatrix, fillStep, roleImports } from './import-matrix';

const fsd = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
const hexagonal = parseArchitectureProfile(HEXAGONAL_PROFILE_FRONTMATTER);

const EDGES: ArchitectureRoleEdge[] = [
  { fromRole: 'views', toRole: 'widgets', count: 56 },
  { fromRole: 'views', toRole: 'shared', count: 61 },
  { fromRole: 'views', toRole: 'views', count: 300 },
  { fromRole: 'features', toRole: 'shared', count: 97 },
  { fromRole: 'shared', toRole: 'features', count: 3 },
  { fromRole: 'shared', toRole: 'entities', count: 2 },
  { fromRole: 'ghost', toRole: 'shared', count: 40 },
];
const VIOLATIONS = [
  { fromRole: 'shared', toRole: 'features', from: 'src/shared/lib/x.ts', to: 'src/features/cart/index.ts' },
  { fromRole: 'shared', toRole: 'features', from: 'src/shared/lib/y.ts', to: 'src/features/cart/index.ts' },
  { note: 'a row without roles is skipped' },
];

function cell(matrix: ReturnType<typeof buildImportMatrix>, from: string, to: string) {
  return matrix.cells[matrix.order.indexOf(from)]![matrix.order.indexOf(to)]!;
}

describe('the import table', () => {
  const matrix = buildImportMatrix(fsd, EDGES, VIOLATIONS);

  it('puts the roles in profile order on both axes', () => {
    expect(matrix.order).toEqual(['routing', 'app', 'views', 'widgets', 'features', 'entities', 'shared']);
    expect(matrix.cells).toHaveLength(7);
    expect(matrix.cells.every((row) => row.length === 7)).toBe(true);
  });

  it('counts imports per pair, row into column, and ignores roles the profile lacks', () => {
    expect(cell(matrix, 'views', 'widgets')).toMatchObject({ kind: 'observed', count: 56 });
    expect(cell(matrix, 'widgets', 'views')).toMatchObject({ kind: 'forbidden', count: 0 });
    expect(matrix.crossRoleImports).toBe(56 + 61 + 97 + 3 + 2);
    expect(matrix.maxCount).toBe(97);
  });

  it('marks the diagonal as same-role, never counted', () => {
    expect(cell(matrix, 'views', 'views')).toMatchObject({ kind: 'self', allowed: false, count: 300 });
  });

  it('allows only lower roles under a lower-only rule, and shows an allowed pair with nothing observed', () => {
    expect(cell(matrix, 'routing', 'shared')).toMatchObject({ kind: 'allowed', allowed: true, count: 0 });
    expect(cell(matrix, 'shared', 'routing')).toMatchObject({ kind: 'forbidden', allowed: false });
  });

  it('turns a pair the record counted against the rules into a violation with its evidence', () => {
    expect(cell(matrix, 'shared', 'features')).toMatchObject({
      kind: 'violation',
      count: 3,
      violations: 2,
      evidence: [
        { from: 'src/shared/lib/x.ts', to: 'src/features/cart/index.ts' },
        { from: 'src/shared/lib/y.ts', to: 'src/features/cart/index.ts' },
      ],
    });
  });

  it('keeps a forbidden pair that was observed but not counted apart from a violation', () => {
    expect(cell(matrix, 'shared', 'entities')).toMatchObject({ kind: 'uncounted', count: 2, violations: 0 });
  });

  it('draws only the rules before any record exists', () => {
    const empty = buildImportMatrix(fsd, [], []);
    expect(empty.crossRoleImports).toBe(0);
    expect(cell(empty, 'views', 'shared').kind).toBe('allowed');
    expect(cell(empty, 'shared', 'views').kind).toBe('forbidden');
  });

  it("follows each role's declared reach under an explicit rule, wherever it falls", () => {
    const explicit = buildImportMatrix(hexagonal, [{ fromRole: 'adapter', toRole: 'application', count: 4 }], []);
    expect(cell(explicit, 'adapter', 'application')).toMatchObject({ kind: 'observed', count: 4 });
    expect(cell(explicit, 'adapter', 'domain').kind).toBe('allowed');
    expect(cell(explicit, 'application', 'adapter').kind).toBe('forbidden');
    expect(cell(explicit, 'port', 'application').kind).toBe('forbidden');
  });
});

describe('the fill step of an observed count', () => {
  it.each([
    [0, 100, 0],
    [1, 100, 1],
    [25, 100, 4],
    [100, 100, 8],
  ])('%i of %i is step %i of 8', (count, max, step) => {
    expect(fillStep(count, max, 8)).toBe(step);
  });
});

describe('the role selected on arrival', () => {
  it('is the source of the first violation', () => {
    const matrix = buildImportMatrix(fsd, EDGES, VIOLATIONS);
    expect(arrivalRole(matrix, VIOLATIONS)).toBe('shared');
  });

  it('is the first role that imports another when nothing is violated', () => {
    const matrix = buildImportMatrix(fsd, EDGES, []);
    expect(arrivalRole(matrix, [])).toBe('views');
  });

  it('is the first role when nothing was observed', () => {
    expect(arrivalRole(buildImportMatrix(fsd, [], []), [])).toBe('routing');
  });
});

describe("a role's imports", () => {
  const matrix = buildImportMatrix(fsd, EDGES, VIOLATIONS);

  it('lists what it imports, violations first, then busiest', () => {
    expect(roleImports(matrix, 'shared', 'out').map((entry) => [entry.to, entry.count])).toEqual([
      ['features', 3],
      ['entities', 2],
    ]);
  });

  it('lists who imports it, busiest first, without itself', () => {
    expect(roleImports(matrix, 'shared', 'in').map((entry) => [entry.from, entry.count])).toEqual([
      ['features', 97],
      ['views', 61],
    ]);
  });
});
