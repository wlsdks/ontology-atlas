import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceConceptsFromDocs, resolveEvidenceStates } from './evidence-drift.mjs';

const docs = [
  { slug: 'capabilities/pay', relativePath: 'capabilities/pay.md', frontmatter: { kind: 'capability', slug: 'capabilities/pay', path: 'src/pay.ts', elements: ['elements/pay-ui', 'src/legacy/pay.js'] } },
  { slug: 'elements/pay-ui', relativePath: 'elements/pay-ui.md', frontmatter: { kind: 'element', slug: 'elements/pay-ui', path: 'src/pay-ui.tsx' } },
  { slug: 'domains/orders', relativePath: 'domains/orders.md', frontmatter: { kind: 'domain', slug: 'domains/orders' } },
  { slug: 'project', relativePath: 'project.md', frontmatter: { kind: 'project', slug: 'project' } },
];

test('evidenceConceptsFromDocs collects own path, element paths and bare source refs', () => {
  const concepts = evidenceConceptsFromDocs(docs);
  assert.deepEqual(concepts.map((c) => c.slug), ['capabilities/pay', 'elements/pay-ui', 'domains/orders']);
  assert.deepEqual(concepts[0].evidencePaths, ['src/pay.ts', 'src/pay-ui.tsx', 'src/legacy/pay.js']);
  assert.equal(concepts[0].docPath, 'capabilities/pay.md');
  assert.deepEqual(concepts[2].evidencePaths, []);
});

test('resolveEvidenceStates sorts rows by slug so two runtimes report one order', () => {
  const shuffled = [...evidenceConceptsFromDocs(docs)].reverse();
  const changes = new Map([
    ['capabilities/pay.md', { exists: true, lastChangedAt: '2026-09-10T00:00:00Z' }],
    ['elements/pay-ui.md', { exists: true, lastChangedAt: '2026-09-10T00:00:00Z' }],
    ['domains/orders.md', { exists: true, lastChangedAt: '2026-09-10T00:00:00Z' }],
    ['src/pay.ts', { exists: true, lastChangedAt: '2026-09-12T00:00:00Z' }],
    ['src/pay-ui.tsx', { exists: true, lastChangedAt: '2026-09-12T00:00:00Z' }],
    ['src/legacy/pay.js', { exists: true, lastChangedAt: '2026-09-01T00:00:00Z' }],
  ]);
  const states = resolveEvidenceStates(shuffled, changes);
  assert.deepEqual(states.stale.map((row) => row.slug), ['capabilities/pay', 'elements/pay-ui']);
});

test('resolveEvidenceStates states current, stale, missing and unknown from change times', () => {
  const concepts = evidenceConceptsFromDocs(docs);
  const changes = new Map([
    ['capabilities/pay.md', { exists: true, lastChangedAt: '2026-09-10T00:00:00Z' }],
    ['elements/pay-ui.md', { exists: true, lastChangedAt: '2026-09-10T00:00:00Z' }],
    ['src/pay.ts', { exists: true, lastChangedAt: '2026-09-12T00:00:00Z' }],
    ['src/pay-ui.tsx', { exists: true, lastChangedAt: '2026-09-01T00:00:00Z' }],
    ['src/legacy/pay.js', { exists: true, lastChangedAt: '2026-09-01T00:00:00Z' }],
  ]);
  const states = resolveEvidenceStates(concepts, changes);
  changes.set('src/pay-ui.tsx', { exists: true, isDir: true, lastChangedAt: '2026-09-15T00:00:00Z' });
  const folderOnly = resolveEvidenceStates(concepts, changes).unknown.find((row) => row.slug === 'elements/pay-ui');
  assert.equal(folderOnly?.reason, 'folder-only');
  assert.deepEqual(folderOnly?.folders, [{ path: 'src/pay-ui.tsx', changedAt: '2026-09-15T00:00:00Z' }]);
  changes.set('src/pay-ui.tsx', { exists: true, lastChangedAt: '2026-09-01T00:00:00Z' });
  assert.deepEqual(states.stale.map((row) => row.slug), ['capabilities/pay']);
  assert.deepEqual(states.stale[0].moved, [{ path: 'src/pay.ts', changedAt: '2026-09-12T00:00:00Z' }]);
  assert.deepEqual(states.current.map((row) => row.slug), ['elements/pay-ui']);
  assert.deepEqual(states.unknown, [{ slug: 'domains/orders', kind: 'domain', reason: 'no-evidence' }]);

  changes.set('src/pay.ts', { exists: false, lastChangedAt: '2026-09-12T00:00:00Z' });
  assert.deepEqual(resolveEvidenceStates(concepts, changes).missing, [
    { slug: 'capabilities/pay', kind: 'capability', gone: ['src/pay.ts'] },
  ]);

  changes.set('src/pay.ts', { exists: true, lastChangedAt: null });
  const unknownTime = resolveEvidenceStates(concepts, changes).unknown.find((row) => row.slug === 'capabilities/pay');
  assert.equal(unknownTime?.reason, 'path-time-unknown');
});
