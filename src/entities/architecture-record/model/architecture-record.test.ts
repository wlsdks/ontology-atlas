import { describe, expect, it } from 'vitest';

import { parseArchitectureProfile } from '@/entities/architecture-profile';
import { parseArchitectureRecord } from './architecture-record';

const HEX_64 = 'ab'.repeat(32);

function gitRecord(overrides: {
  source?: Record<string, unknown>;
  conformance?: Record<string, unknown>;
} = {}) {
  return {
    contract: 'architectureRecord:v1',
    profile: {
      uid: 'e9f5fe88-3711-4b3c-9f77-3b6f809db82c',
      slug: 'atlas-web',
      contentHash: `sha256:${HEX_64}`,
    },
    brief: {
      contract: 'architectureBrief:v1',
      sideEffect: 0,
      measured: {
        at: '2026-08-27T09:30:00.000Z',
        tool: { name: 'ontology-atlas', version: '1.0.0-rc.16' },
        source: overrides.source ?? { kind: 'git', revision: 'a8df66d', dirty: false },
      },
      conformance: {
        status: 'violated',
        violationCount: 3,
        violations: [],
        typeOnlyEdgeCount: 18,
        unknown: { coverageIncomplete: false, unmappedEdges: 2, unruledEdges: 0, emptyRoles: [] },
        ...overrides.conformance,
      },
    },
  };
}

describe('parseArchitectureRecord', () => {
  it('returns a valid git-source receipt unrewritten', () => {
    const value = gitRecord();
    const record = parseArchitectureRecord(value);
    expect(record).toBe(value);
    expect(record.brief.measured.source).toEqual({ kind: 'git', revision: 'a8df66d', dirty: false });
    expect(record.brief.conformance.typeOnlyEdgeCount).toBe(18);
  });

  it('accepts a folder-source receipt with a sha256 fingerprint, and no typeOnlyEdgeCount', () => {
    const value = gitRecord({
      source: { kind: 'folder', fingerprint: `sha256:${HEX_64}` },
      conformance: { status: 'conforms', violationCount: 0, typeOnlyEdgeCount: undefined },
    });
    const record = parseArchitectureRecord(value);
    expect(record.brief.measured.source.kind).toBe('folder');
    expect(record.brief.conformance.typeOnlyEdgeCount).toBeUndefined();
  });

  /*
   * ⚠️ **The two parsers reject each other by contract** (2026-08-27 council, verification set:
   * "record parser rejects rule fields"). A reviewed profile must never be read as a measurement
   * receipt — each profile-marking key alone is enough to refuse.
   */
  it.each([
    ['architecture_schema', { architecture_schema: 'architecture-profile/v1' }],
    ['profile_uid', { profile_uid: 'e9f5fe88-3711-4b3c-9f77-3b6f809db82c' }],
    ['role_* keys', { role_shared: ['src/shared/**'] }],
  ])('throws on profile-shaped input carrying %s', (_name, marker) => {
    expect(() => parseArchitectureRecord({ ...gitRecord(), ...marker })).toThrow(/profile/);
  });

  it('throws on a whole profile document, not just on mixed shapes', () => {
    expect(() =>
      parseArchitectureRecord({
        architecture_schema: 'architecture-profile/v1',
        profile_uid: 'e9f5fe88-3711-4b3c-9f77-3b6f809db82c',
        profile_slug: 'atlas-web',
        role_app: ['src/app/**'],
        role_shared: ['src/shared/**'],
        allow_app: ['shared'],
      }),
    ).toThrow(/architectureRecord:v1/);
  });

  /* No absolute machine path leaves the sidecar — a surviving rootPath is invalid, not untidy. */
  it('throws when rootPath survives anywhere in the envelope', () => {
    const leaked = gitRecord({
      conformance: { source: { rootPath: '/Users/someone/dev/repo', filesScanned: 193 } },
    });
    expect(() => parseArchitectureRecord(leaked)).toThrow(/rootPath/);
  });

  it.each<[string, (r: ReturnType<typeof gitRecord>) => unknown]>([
    ['a wrong contract', (r) => ({ ...r, contract: 'architectureBrief:v1' })],
    ['a missing measured stamp', (r) => ({
      ...r,
      brief: { ...r.brief, measured: undefined },
    })],
    ['an unknown status word', (r) => ({
      ...r,
      brief: { ...r.brief, conformance: { ...r.brief.conformance, status: 'green' } },
    })],
    ['an unprefixed content hash', (r) => ({
      ...r,
      profile: { ...r.profile, contentHash: HEX_64 },
    })],
    ['a git source without a dirty flag', (r) => ({
      ...r,
      brief: {
        ...r.brief,
        measured: { ...r.brief.measured, source: { kind: 'git', revision: 'a8df66d' } },
      },
    })],
    ['a folder source with no fingerprint', (r) => ({
      ...r,
      brief: { ...r.brief, measured: { ...r.brief.measured, source: { kind: 'folder' } } },
    })],
  ])('throws on %s', (_name, mutate) => {
    expect(() => parseArchitectureRecord(mutate(gitRecord()))).toThrow();
  });
});

/*
 * The web half of the type-only measurement contract (2026-08-27 council, point 1). The
 * cross-surface parity test owns web-versus-MCP equality; this pins the web parser's own
 * default and its exact refusal wording, which that deep-equality cannot see.
 */
describe('parseArchitectureRecord — observed role traffic', () => {
  /*
   * The traffic between roles is measured by the scanner and already written into every record
   * `atlas architecture --record` produces (verified 2026-08-28: 26 rows on this repository).
   * The type simply never declared it, so the surface that reads the record threw it away.
   */
  it('reads the role edges a record already carries, and tolerates their absence', () => {
    const base = gitRecord();
    const withEdges = parseArchitectureRecord({
      ...base,
      brief: {
        ...base.brief,
        conformance: {
          ...base.brief.conformance,
          observedRoleEdges: [
            { fromRole: 'views', toRole: 'shared', count: 260, evidence: [{ from: 'a', to: 'b' }] },
            { fromRole: 'routing', toRole: 'widgets', count: 1 },
          ],
        },
      },
    });
    const edges = withEdges.brief.conformance.observedRoleEdges ?? [];
    expect(edges.map((edge) => [edge.fromRole, edge.toRole, edge.count])).toEqual([
      ['views', 'shared', 260],
      ['routing', 'widgets', 1],
    ]);

    expect(parseArchitectureRecord(gitRecord()).brief.conformance.observedRoleEdges).toBeUndefined();
  });

  it('refuses a role edge whose count is not a count', () => {
    const base = gitRecord();
    expect(() =>
      parseArchitectureRecord({
        ...base,
        brief: {
          ...base.brief,
          conformance: {
            ...base.brief.conformance,
            observedRoleEdges: [{ fromRole: 'views', toRole: 'shared', count: -1 }],
          },
        },
      }),
    ).toThrow(/observedRoleEdges/);
  });

  it('refuses a role edge that does not name both of its ends', () => {
    const base = gitRecord();
    expect(() =>
      parseArchitectureRecord({
        ...base,
        brief: {
          ...base.brief,
          conformance: {
            ...base.brief.conformance,
            observedRoleEdges: [{ fromRole: 'views', count: 3 }],
          },
        },
      }),
    ).toThrow(/observedRoleEdges\[0\]\.toRole/);
  });
});

describe('parseArchitectureProfile — type_only_dependencies', () => {
  const base = {
    architecture_schema: 'architecture-profile/v1',
    profile_uid: 'e9f5fe88-3711-4b3c-9f77-3b6f809db82c',
    profile_slug: 'atlas-web',
    project_uid: '8c48b61f-1f75-448e-87a5-6ea2a7b02cf8',
    title: 'Atlas Web Workbench',
    patterns: ['source-organization:feature-sliced-design'],
    scope_paths: ['src/**'],
    role_app: ['src/app/**'],
    role_shared: ['src/shared/**'],
    evidence: ['docs/ARCHITECTURE.md#fsd-layers'],
  };

  it('defaults to free when the key is absent', () => {
    expect(parseArchitectureProfile(base).typeOnlyDependencies).toBe('free');
  });

  it('parses ruled', () => {
    expect(
      parseArchitectureProfile({ ...base, type_only_dependencies: 'ruled' }).typeOnlyDependencies,
    ).toBe('ruled');
  });

  it('refuses any other value with the exact contract message', () => {
    expect(() => parseArchitectureProfile({ ...base, type_only_dependencies: 'strict' })).toThrow(
      'type_only_dependencies must be ruled or free.',
    );
  });
});
