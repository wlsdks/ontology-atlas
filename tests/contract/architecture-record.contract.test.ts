import { describe, expect, it } from 'vitest';

import {
  FSD_PROFILE_FRONTMATTER,
  HEXAGONAL_ALLOWED_EDGES,
  HEXAGONAL_PROFILE_FRONTMATTER,
} from '../fixtures/architecture-profile-cases.mjs';
import {
  buildArchitectureBrief,
  buildArchitectureMeasuredStamp,
  parseArchitectureProfile,
} from '../../mcp/src/architecture-profile.mjs';
import {
  assertArchitectureRecord,
  buildArchitectureRecord,
} from '../../mcp/src/architecture-record.mjs';
import { parseArchitectureRecord } from '@/entities/architecture-record';

/*
 * architectureRecord:v1 cross-surface contract (2026-08-27 decision).
 *
 * The CLI writes the record through the MCP package's builder/validator; the
 * web /architecture surface reads the same sidecar file through its own
 * parser. One fixture record must validate identically on both sides, and a
 * profile-shaped document must be rejected by both — a reviewed profile and a
 * machine receipt are never interchangeable.
 */

const MEASURED_STAMP_INPUT = {
  kind: 'folder' as const,
  fingerprint: `sha256:${'0f'.repeat(32)}`,
};

function makeRecordFixture() {
  const profile = parseArchitectureProfile(HEXAGONAL_PROFILE_FRONTMATTER);
  const measured = buildArchitectureMeasuredStamp(MEASURED_STAMP_INPUT, {
    at: '2026-08-27T00:00:00.000Z',
    toolName: 'ontology-atlas',
    toolVersion: '0.0.0-contract',
  });
  const brief = buildArchitectureBrief(
    profile,
    {
      rootPath: '/machine/path/repo',
      edges: [
        ...HEXAGONAL_ALLOWED_EDGES.map((edge) => ({ ...edge, importUsage: 'value' })),
        {
          from: 'src/payments/domain/payment.ts',
          to: 'src/payments/adapters/postgres.ts',
          kind: 'static',
          importUsage: 'type_only',
        },
      ],
      filesScanned: 8,
      coverage: { allDetectedLanguagesSupported: true, supportedLanguages: ['typescript'] },
    },
    { measured },
  );
  return buildArchitectureRecord(brief, {
    profileUid: HEXAGONAL_PROFILE_FRONTMATTER.profile_uid,
    profileSlug: HEXAGONAL_PROFILE_FRONTMATTER.profile_slug,
    profileContentHash: `sha256:${'ab'.repeat(32)}`,
  });
}

describe('architectureRecord:v1 cross-surface contract', () => {
  it('one record fixture validates identically in the MCP validator and the web parser', () => {
    const record = makeRecordFixture();
    // Round-trip through JSON: the web parser reads sidecar file bytes.
    const stored = JSON.parse(JSON.stringify(record)) as unknown;

    expect(() => assertArchitectureRecord(stored)).not.toThrow();
    const parsed = parseArchitectureRecord(stored);
    expect(parsed).toEqual(record);
    expect(parsed.brief.conformance.typeOnlyEdgeCount).toBe(1);
    expect(parsed.brief.measured.source).toEqual({
      kind: 'folder',
      fingerprint: MEASURED_STAMP_INPUT.fingerprint,
    });
  });

  it.each([
    ['mcp', (value: unknown) => assertArchitectureRecord(value)],
    ['web', (value: unknown) => parseArchitectureRecord(value)],
  ])('%s rejects profile-shaped input outright', (_surface, validate) => {
    expect(() => validate(FSD_PROFILE_FRONTMATTER)).toThrow();
    expect(() => validate(HEXAGONAL_PROFILE_FRONTMATTER)).toThrow();
    expect(() => validate({ contract: 'architectureRecord:v1', profile_uid: 'x' })).toThrow();
    expect(() => validate({ contract: 'architectureRecord:v1', role_core: ['src/**'] })).toThrow();
  });

  it.each([
    ['mcp', (value: unknown) => assertArchitectureRecord(value)],
    ['web', (value: unknown) => parseArchitectureRecord(value)],
  ])('%s rejects a record that leaks a machine rootPath', (_surface, validate) => {
    const leaked = JSON.parse(JSON.stringify(makeRecordFixture()));
    leaked.brief.conformance.source.rootPath = '/machine/path/repo';
    expect(() => validate(leaked)).toThrow();
  });
});
