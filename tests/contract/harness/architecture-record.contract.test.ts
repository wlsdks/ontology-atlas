import { describe, expect, it } from 'vitest';

import GOLDEN from '../../fixtures/architecture-golden.json';
import {
  FSD_PROFILE_FRONTMATTER,
  HEXAGONAL_PROFILE_FRONTMATTER,
} from '../../fixtures/architecture-profile-cases.mjs';
import { parseArchitectureRecord } from '@/entities/architecture-record';

/*
 * `architectureRecord:v1` contract: the web reads sidecar file bytes through its own parser. The
 * record in `tests/fixtures/architecture-golden.json` is what the script server's builder wrote for
 * the hexagonal fixture, recorded 2026-11-28; the web
 * parser takes it whole, and profile-shaped documents are rejected.
 */

const MEASURED_FINGERPRINT = `sha256:${'0f'.repeat(32)}`;

describe('architectureRecord:v1 contract', () => {
  it('the recorded record parses whole in the web parser', () => {
    // Round-trip through JSON: the web parser reads sidecar file bytes.
    const stored = JSON.parse(JSON.stringify(GOLDEN.hexagonalRecord)) as unknown;
    const parsed = parseArchitectureRecord(stored);
    expect(parsed).toEqual(GOLDEN.hexagonalRecord);
    /* `excludedByUsage` counts what a profile's own declaration removed, whatever the usage. */
    expect(parsed.brief.conformance.excludedByUsage).toBe(1);
    expect(parsed.brief.measured.source).toEqual({
      kind: 'folder',
      fingerprint: MEASURED_FINGERPRINT,
    });
  });

  it('rejects profile-shaped input outright', () => {
    expect(() => parseArchitectureRecord(FSD_PROFILE_FRONTMATTER)).toThrow();
    expect(() => parseArchitectureRecord(HEXAGONAL_PROFILE_FRONTMATTER)).toThrow();
    expect(() => parseArchitectureRecord({ contract: 'architectureRecord:v1', profile_uid: 'x' })).toThrow();
    expect(() => parseArchitectureRecord({ contract: 'architectureRecord:v1', role_core: ['src/**'] })).toThrow();
  });

  it('rejects a record that leaks a machine rootPath', () => {
    const leaked = JSON.parse(JSON.stringify(GOLDEN.hexagonalRecord));
    leaked.brief.conformance.source.rootPath = '/machine/path/repo';
    expect(() => parseArchitectureRecord(leaked)).toThrow();
  });
});
