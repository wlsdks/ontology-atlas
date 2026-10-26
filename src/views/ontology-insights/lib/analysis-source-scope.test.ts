import { describe, expect, it } from 'vitest';
import { resolveEvidenceStates } from '@/shared/lib/git/evidence-states';
import { linearAnalysisSourceScopes } from './analysis-source-scope';

describe('analysis source scopes', () => {
  it('keeps unavailable evidence unknown and counts capabilities only once', () => {
    const scopes = linearAnalysisSourceScopes(['pay', 'refund', 'pay'], null);
    expect([...scopes.all]).toEqual(['pay', 'refund']);
    expect([...scopes.unknown]).toEqual(['pay', 'refund']);
    expect(scopes.moved.size).toBe(0);
    expect(scopes.missing.size).toBe(0);
    expect(linearAnalysisSourceScopes([], null).unknown.size).toBe(0);
  });

  it('uses the existing verdict precedence and keeps partial and folder evidence unknown', () => {
    const ids = ['current', 'moved', 'missing', 'dirty', 'folder', 'omitted'];
    const concepts = ids.slice(0, -1).map(id => ({ id, docPath: `${id}.md`, evidencePaths: [`src/${id}`] }));
    const changes = new Map(ids.map(id => [`${id}.md`, { exists: true, lastChangedAt: '2026-01-02T00:00:00Z' }]));
    const source = new Map([
      ['src/current', { exists: true, lastChangedAt: '2026-01-01T00:00:00Z' }],
      ['src/moved', { exists: true, lastChangedAt: '2026-01-03T00:00:00Z' }],
      ['src/missing', { exists: false, lastChangedAt: null }],
      ['src/dirty', { exists: true, lastChangedAt: null }],
      ['src/folder', { exists: true, isDir: true, lastChangedAt: '2026-01-03T00:00:00Z' }],
    ]);
    const evidence = resolveEvidenceStates(concepts, changes, source);
    const scopes = linearAnalysisSourceScopes(ids, evidence);
    expect([...scopes.moved]).toEqual(['moved']);
    expect([...scopes.missing]).toEqual(['missing']);
    expect([...scopes.unknown]).toEqual(['dirty', 'folder', 'omitted']);
    expect(scopes.all.size).toBe(6);
    expect(linearAnalysisSourceScopes(['current'], evidence).moved.size).toBe(0);
  });

  it('partitions a large capability set without counting unrelated evidence', () => {
    const ids = Array.from({ length: 10_000 }, (_, i) => `ability-${i}`);
    const scopes = linearAnalysisSourceScopes(ids, { current: new Set(ids.slice(0, 2500)), stale: new Set([...ids.slice(2500, 5000), 'element']), missing: new Set(ids.slice(5000, 7500)), unknown: new Set(ids.slice(7500)), folderOnly: new Set(), rows: [] });
    expect([scopes.all.size, scopes.moved.size, scopes.missing.size, scopes.unknown.size]).toEqual([10_000, 2500, 2500, 2500]);
    expect(scopes.moved.has('element')).toBe(false);
  });
});
