import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { detectVaultPathDrift, suggestPathReconciliations } from './detect-drift.mjs';
import { loadVaultDocs } from './vault/documents.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '..', '..'); // mcp/src → repo root

test('detectVaultPathDrift — flags missing path: and missing path-like elements[]', () => {
  const present = new Set(['/repo/src/exists.ts', '/repo/src/owned.ts']);
  const fileExists = (abs) => present.has(abs);
  const docs = [
    { slug: 'elements/a', frontmatter: { kind: 'element', path: 'src/exists.ts' } }, // ok
    { slug: 'elements/b', frontmatter: { kind: 'element', path: 'src/gone.ts' } }, // drift
    {
      slug: 'capabilities/c',
      frontmatter: {
        kind: 'capability',
        elements: ['src/owned.ts', 'src/missing.ts', 'capabilities/x', 'vault-validator'],
      },
    },
  ];
  const r = detectVaultPathDrift({ docs, repoRoot: '/repo', fileExists });

  assert.equal(r.nodesScanned, 3);
  // path: a and b; elements: the two path-like entries; slug refs skipped.
  assert.equal(r.pathsChecked, 4);
  assert.deepEqual(
    r.drifts.map((d) => `${d.slug}:${d.key}:${d.missingPath}`).sort(),
    ['capabilities/c:elements[]:src/missing.ts', 'elements/b:path:src/gone.ts'],
  );
});

test('detectVaultPathDrift — ontology slugs and bare names in elements[] are never flagged', () => {
  const r = detectVaultPathDrift({
    docs: [{ slug: 'capabilities/c', frontmatter: { kind: 'capability', elements: ['capabilities/x', 'domains/y', 'vault-validator', 'plain-name'] } }],
    repoRoot: '/repo',
    fileExists: () => false, // everything "missing" — but none of these look like paths
  });
  assert.deepEqual(r.drifts, []);
  assert.equal(r.pathsChecked, 0);
});

test('detectVaultPathDrift — docs without kind are skipped', () => {
  const r = detectVaultPathDrift({
    docs: [{ slug: 'x', frontmatter: { path: 'src/gone.ts' } }], // no kind
    repoRoot: '/repo',
    fileExists: () => false,
  });
  assert.equal(r.nodesScanned, 0);
  assert.deepEqual(r.drifts, []);
});

test('detectVaultPathDrift — uses doc.slug when frontmatter.slug absent', () => {
  const r = detectVaultPathDrift({
    docs: [{ slug: 'elements/from-path', frontmatter: { kind: 'element', path: 'gone.ts' } }],
    repoRoot: '/repo',
    fileExists: () => false,
  });
  assert.equal(r.drifts[0].slug, 'elements/from-path');
});

test('suggestPathReconciliations — unique same-basename file → suggestedPath', () => {
  const drifts = [
    { slug: 'elements/b', kind: 'element', key: 'path', missingPath: 'src/foo/Bar.tsx' },
  ];
  const repoFiles = ['src/baz/Bar.tsx', 'src/lib/util.ts'];
  const out = suggestPathReconciliations(drifts, repoFiles);
  assert.equal(out[0].suggestedPath, 'src/baz/Bar.tsx');
  assert.equal(out[0].slug, 'elements/b');
  assert.equal(out[0].missingPath, 'src/foo/Bar.tsx');
});

test('suggestPathReconciliations — no same-basename file → unchanged (no suggestedPath)', () => {
  const drifts = [
    { slug: 'elements/b', kind: 'element', key: 'path', missingPath: 'src/foo/Bar.tsx' },
  ];
  const out = suggestPathReconciliations(drifts, ['src/lib/util.ts']);
  assert.equal('suggestedPath' in out[0], false);
});

test('suggestPathReconciliations — ambiguous basename (>1 match) → no suggestion', () => {
  const drifts = [
    { slug: 'elements/b', kind: 'element', key: 'path', missingPath: 'src/a/index.ts' },
  ];
  const out = suggestPathReconciliations(drifts, ['src/x/index.ts', 'src/y/index.ts']);
  assert.equal('suggestedPath' in out[0], false);
});

test('suggestPathReconciliations — empty inputs are safe no-ops', () => {
  assert.deepEqual(suggestPathReconciliations([], ['src/x.ts']), []);
  const drifts = [{ slug: 's', kind: 'element', key: 'path', missingPath: 'a.ts' }];
  assert.deepEqual(suggestPathReconciliations(drifts, []), drifts);
});

// The dogfood vault must be drift-0, the contract `pnpm vault:audit` enforces.
test('detectVaultPathDrift — dogfood vault docs/ontology is drift-0 against the real repo', () => {
  const docs = loadVaultDocs(resolve(REPO, 'docs/ontology'));
  const r = detectVaultPathDrift({ docs, repoRoot: REPO }); // real existsSync
  assert.equal(r.drifts.length, 0, `unexpected drift: ${JSON.stringify(r.drifts)}`);
  assert.ok(r.nodesScanned > 0, 'should scan the dogfood nodes');
});
