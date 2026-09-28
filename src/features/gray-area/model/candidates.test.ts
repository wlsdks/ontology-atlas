import { describe, expect, it } from 'vitest';
import type { GrayAreaSnapshot } from '@/shared/lib/tauri-gray-area';
import { buildGrayAreaCandidates, grayAreaCandidatePage, formatRecordedPath } from './candidates';

function snapshot(): GrayAreaSnapshot {
  return {
    contract: 'grayAreaEvidence:v1', snapshotId: 'sha256:one', measuredAt: '2026-09-28',
    basis: { projectSlug: 'project', selectedUids: ['a'], sourceId: 'repo', sourceFingerprint: 'source', graphDigest: 'graph', bodyDigest: 'body', bindingDigest: 'binding' },
    nodes: [
      { uid: 'a', slug: 'capabilities/a', title: 'A', kind: 'capability', path: 'src/a.ts', body: 'A', bodyDigest: 'a' },
      { uid: 'b', slug: 'elements/b', title: 'B', kind: 'element', path: 'src/b.ts', body: '## Uncertainty\n- src/b.ts was not read.', bodyDigest: 'b' },
      { uid: 'c', slug: 'elements/c', title: 'C', kind: 'element', path: 'src/c.ts', body: 'C', bodyDigest: 'c' },
    ],
    edges: [{ from: 'capabilities/a', to: 'elements/b', via: 'dependencies' }],
    imports: [{ from: 'src/a.ts', to: 'src/c.ts', kind: 'static', sourceRole: 'production', importUsage: 'value' }],
    drift: [{ slug: 'elements/b', path: 'src/b.ts', documentChangedAt: '2026-09-01', sourceChangedAt: '2026-09-20' }],
    recordedReads: [{ slug: 'elements/b', kind: 'unread-file', statement: 'src/b.ts was not read.', paths: ['src/b.ts'], ranges: [] }], witnesses: [],
    coverage: { filesScanned: 3, maxFiles: 2000, importsAvailable: true, importsLimited: false, unresolvedImports: 0, unsupported: [], readsLimited: false, recordedReadsTotal: 1, limits: [] },
  };
}
describe('bounded gray-area candidates', () => {
  it('joins exact code paths to known identities without making a missing import a graph edge', () => {
    const s = snapshot(); const rows = buildGrayAreaCandidates(s);
    const c = rows.find(r => r.kind === 'missing-link');
    expect(c).toMatchObject({ slug: 'capabilities/a', relatedSlug: 'elements/c', currency: 'observed', sourcePaths: ['src/a.ts', 'src/c.ts'] });
    expect(c?.path).toEqual(['capabilities/a']);
    expect(s.edges).toHaveLength(1);
  });
  it('surfaces source change only with a real recorded dependent and a selected dependency path', () => {
    const s = snapshot(); expect(buildGrayAreaCandidates(s).find(r => r.kind === 'changed-source')?.path).toEqual(['capabilities/a', 'elements/b']);
    s.edges = []; expect(buildGrayAreaCandidates(s).some(r => r.kind === 'changed-source')).toBe(false);
  });
  it('keeps authored uncertainty explicitly unverified instead of asserting an active defect', () => {
    expect(buildGrayAreaCandidates(snapshot()).find(r => r.kind === 'recorded-gap')).toMatchObject({ currency: 'recorded-unverified', statement: 'src/b.ts was not read.' });
  });
  it('does not revive a statement removed from the current body', () => {
    const s = snapshot(); s.nodes[1].body = '## Uncertainty\n- Resolved: src/b.ts was read in full.';
    expect(buildGrayAreaCandidates(s).some(r => r.kind === 'recorded-gap')).toBe(false);
  });
  it('keeps a current gap when a later unrelated note is resolved', () => {
    const s = snapshot(); s.nodes[1].body += '\n- The deployment gap resolved after reading src/deploy.ts.';
    expect(buildGrayAreaCandidates(s).some(r => r.kind === 'recorded-gap')).toBe(true);
  });
  it('never promotes type-only, test, unknown or dynamic edges into the initial missing-link signal', () => {
    for (const change of [{ importUsage: 'type_only' }, { sourceRole: 'test' }, { sourceRole: 'unknown' }, { kind: 'dynamic' }]) {
      const s = snapshot(); Object.assign(s.imports[0], change);
      expect(buildGrayAreaCandidates(s).some(r => r.kind === 'missing-link')).toBe(false);
    }
  });
  it('refuses an ambiguous source endpoint and already recorded dependency', () => {
    const s = snapshot(); s.nodes.push({ ...s.nodes[2], uid: 'd', slug: 'elements/d' });
    expect(buildGrayAreaCandidates(s).some(r => r.kind === 'missing-link')).toBe(false);
    const t = snapshot(); t.edges.push({ from: 'capabilities/a', to: 'elements/c', via: 'dependencies' });
    expect(buildGrayAreaCandidates(t).some(r => r.kind === 'missing-link')).toBe(false);
  });
  it('binds dismissible candidate identity to full snapshot evidence, including body changes', () => {
    const s = snapshot(); const first = buildGrayAreaCandidates(s)[0]?.id;
    s.snapshotId = 'sha256:body-changed'; expect(buildGrayAreaCandidates(s)[0]?.id).not.toBe(first);
  });
  it('keeps unrelated components out and returns at most three explainable candidates', () => {
    const s = snapshot(); s.basis.selectedUids = ['c'];
    expect(buildGrayAreaCandidates(s).some(r => r.kind === 'recorded-gap' || r.kind === 'changed-source')).toBe(false);
    expect(grayAreaCandidatePage(snapshot()).candidates.length).toBeLessThanOrEqual(3);
    expect(formatRecordedPath(snapshot(),['elements/b','capabilities/a'],s=>s)).toBe('elements/b ← capabilities/a');
  });
  it('uses selected group containment as scope, without inventing an impact edge', () => {
    const s=snapshot();s.nodes.push({uid:'domain',slug:'domains/x',kind:'domain',title:'X',body:'X',bodyDigest:'x'});
    s.edges.push({from:'capabilities/a',to:'domains/x',via:'domain'});s.basis.selectedUids=['domain'];
    const candidate=buildGrayAreaCandidates(s).find(r=>r.kind==='missing-link');expect(candidate?.slug).toBe('capabilities/a');expect(candidate?.path).toEqual(['capabilities/a']);
  });

  it('folding the first three exposes the fourth instead of hiding it forever',()=>{
    const s=snapshot();s.nodes[0].body='## Uncertainty\n- src/a.ts was not verified.';
    s.recordedReads.push({slug:'capabilities/a',kind:'unverified-claim',statement:'src/a.ts was not verified.',paths:['src/a.ts'],ranges:[]});
    const first=grayAreaCandidatePage(s);expect(first.total).toBe(4);expect(first.omitted).toBe(1);
    const folded=new Set(first.candidates.map(c=>c.id));const next=grayAreaCandidatePage(s,folded);
    expect(next.total).toBe(1);expect(next.candidates).toHaveLength(1);expect(next.omitted).toBe(0);
    s.snapshotId='new-current-body';expect(grayAreaCandidatePage(s,folded).total).toBe(4);
  });

});
