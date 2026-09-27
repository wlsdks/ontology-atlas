import { describe, expect, it } from 'vitest';

import { buildRoleLedgers } from './role-ledger';

function record(conformance: Record<string, unknown>) {
  return {
    contract: 'architectureRecord:v1',
    profile: { uid: 'u', slug: 's', contentHash: 'sha256:aa' },
    brief: {
      contract: 'architectureBrief:v1',
      measured: {
        at: '2026-08-29T00:00:00Z',
        tool: { name: 'ontology-atlas', version: '1.0.0' },
        source: { kind: 'git', revision: 'abc1234', dirty: false },
      },
      conformance: { status: 'conforms', violationCount: 0, violations: [], ...conformance },
    },
  } as never;
}

describe('buildRoleLedgers', () => {
  const roles = ['views', 'widgets', 'shared'];

  it('returns no ledgers at all when there is no record', () => {
    expect(buildRoleLedgers(roles, null)).toEqual({});
    expect(buildRoleLedgers(roles, undefined)).toEqual({});
  });

  it('counts imports out and crossings out, with same-role traffic excluded', () => {
    const ledgers = buildRoleLedgers(
      roles,
      record({
        observedRoleEdges: [
          { fromRole: 'widgets', toRole: 'shared', count: 314 },
          { fromRole: 'widgets', toRole: 'entities', count: 20 },
          // Same-role imports are always legal and are not traffic out.
          { fromRole: 'widgets', toRole: 'widgets', count: 240 },
        ],
      }),
    );
    expect(ledgers.widgets).toMatchObject({ importsOut: 334, outgoing: 2, state: 'clean' });
    expect(ledgers.shared).toMatchObject({ importsOut: 0, outgoing: 0, state: 'clean' });
  });

  it('groups violations by the role they leave, never by the role they land on', () => {
    const ledgers = buildRoleLedgers(
      roles,
      record({
        status: 'violated',
        violationCount: 3,
        violations: [
          { fromRole: 'shared', toRole: 'views', from: 'a.ts', to: 'b.ts' },
          { fromRole: 'shared', toRole: 'widgets', from: 'c.ts', to: 'd.ts' },
          { fromRole: 'widgets', toRole: 'views', from: 'e.ts', to: 'f.ts' },
        ],
      }),
    );
    expect(ledgers.shared).toMatchObject({ state: 'violated', violated: 2 });
    expect(ledgers.widgets).toMatchObject({ state: 'violated', violated: 1 });
    expect(ledgers.views).toMatchObject({ state: 'clean', violated: 0 });
  });

  it('carries the sample-limited flag so a truncated count is never stated as a total', () => {
    const ledgers = buildRoleLedgers(
      roles,
      record({
        status: 'violated',
        violationCount: 120,
        violationsLimited: true,
        violations: [{ fromRole: 'shared', toRole: 'views', from: 'a.ts', to: 'b.ts' }],
      }),
    );
    expect(ledgers.shared).toMatchObject({ violated: 1, sampleLimited: true });
    expect(ledgers.views.sampleLimited).toBe(true);
  });

  it('states no-source only for the roles the receipt names, and outranks a clean count', () => {
    const ledgers = buildRoleLedgers(
      roles,
      record({
        status: 'unknown',
        unknown: { emptyRoles: ['views'], unmappedEdges: 77, unruledEdges: 4 },
        observedRoleEdges: [{ fromRole: 'widgets', toRole: 'shared', count: 3 }],
      }),
    );
    expect(ledgers.views.state).toBe('no-source');
    expect(ledgers.widgets.state).toBe('clean');
    expect(Object.values(ledgers).every((l) => l.state !== ('unmeasured' as never))).toBe(true);
  });

  it('ignores violation rows that carry no role, rather than guessing one', () => {
    const ledgers = buildRoleLedgers(
      roles,
      record({ status: 'violated', violationCount: 2, violations: [{ from: 'a.ts' }, null, 7] }),
    );
    expect(Object.values(ledgers).every((l) => l.violated === 0)).toBe(true);
  });
});
