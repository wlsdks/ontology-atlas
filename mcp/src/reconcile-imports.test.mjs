// reconcile-imports — unit test (node:test). Atlas roadmap Track A #1.
// Diff code-derived import edges (inferImports moduleEdges) against compiled
// vault depends_on edges. Validators (planner team 2026-05-31) insisted the
// alias-normalization (aliasToSlug + ambiguous-alias) case be first-class, not
// a follow-up — so it is fixture #1 below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileImportEdges } from './reconcile-imports.mjs';
import { compileOntology } from './ontology-compiler.mjs';

// In-memory fixtures (no fs) — matches the lightweight contract-test style.
const moduleEdges = [
  { from: 'capabilities/a', to: 'capabilities/b', count: 3, kindCounts: { static: 3 } }, // in both
  { from: 'capabilities/a', to: 'elements/src/x', count: 1, kindCounts: { static: 1 } }, // code-only → candidate add_relation
  { from: 'alias-src', to: 'b', count: 2, kindCounts: { static: 2 } }, // alias-src→capabilities/a, b→capabilities/b ⇒ normalizes to a→b (dupe of inBoth)
];
// `via: 'dependencies'` is what the compiler ACTUALLY emits for a depends_on
// frontmatter key (canonicalized). Matching 'depends_on' here was the bug the
// adversarial gate caught — the compiler never emits that literal.
const compiledEdges = [
  { from: 'capabilities/a', to: 'capabilities/b', via: 'dependencies', ref: 'b', resolved: true }, // in both
  { from: 'capabilities/a', to: 'capabilities/c', via: 'dependencies', ref: 'c', resolved: true }, // vault-only → candidate stale
  { from: 'capabilities/a', to: 'domains/d', via: 'domain', ref: 'd', resolved: true }, // non-dependency → ignored
];
const aliasToSlug = new Map([
  ['alias-src', 'capabilities/a'],
  ['b', 'capabilities/b'],
  ['c', 'capabilities/c'],
]);

test('reconcileImportEdges — three buckets, depends_on only', () => {
  const r = reconcileImportEdges({ moduleEdges, compiledEdges, aliasToSlug });

  // inBoth: a→b (the alias-src→b edge normalizes to a→b and must NOT duplicate it)
  assert.deepEqual(
    r.inBoth.map((e) => `${e.from}→${e.to}`).sort(),
    ['capabilities/a→capabilities/b'],
  );

  // inCodeMissingFromVault: a→elements/src/x, with an actionable add_relation proposedAction
  assert.equal(r.inCodeMissingFromVault.length, 1);
  const miss = r.inCodeMissingFromVault[0];
  assert.equal(miss.from, 'capabilities/a');
  assert.equal(miss.to, 'elements/src/x');
  assert.deepEqual(miss.proposedAction, {
    tool: 'add_relation',
    from: 'capabilities/a',
    to: 'elements/src/x',
    type: 'depends_on',
  });

  // inVaultNotInCode: a→c (depends_on edge with no matching import); belongs_to ignored
  assert.deepEqual(
    r.inVaultNotInCode.map((e) => `${e.from}→${e.to}`).sort(),
    ['capabilities/a→capabilities/c'],
  );
});

test('reconcileImportEdges — accepts aliasToSlug as plain object too', () => {
  const r = reconcileImportEdges({
    moduleEdges: [{ from: 'alias-src', to: 'b', count: 1 }],
    compiledEdges: [{ from: 'capabilities/a', to: 'capabilities/b', via: 'depends_on', ref: 'b' }],
    aliasToSlug: { 'alias-src': 'capabilities/a', b: 'capabilities/b' },
  });
  assert.equal(r.inBoth.length, 1);
  assert.equal(r.inCodeMissingFromVault.length, 0);
  assert.equal(r.inVaultNotInCode.length, 0);
});

// Anti-drift guard (the gate's required fix): run the reconciler against REAL
// compileOntology output, not synthetic via strings. The compiler canonicalizes
// the `depends_on` frontmatter key to via:'dependencies' — if the reconciler's
// filter ever drifts off that, inBoth/inVaultNotInCode silently go to 0 and this
// test fails loudly.
test('reconcileImportEdges — matches REAL compileOntology depends_on edges (via=dependencies)', () => {
  const docs = [
    { slug: 'capabilities/a', frontmatter: { kind: 'capability', title: 'A', depends_on: ['capabilities/b', 'capabilities/stale'] }, body: '', mtime: 1 },
    { slug: 'capabilities/b', frontmatter: { kind: 'capability', title: 'B' }, body: '', mtime: 1 },
    { slug: 'capabilities/stale', frontmatter: { kind: 'capability', title: 'Stale' }, body: '', mtime: 1 },
  ];
  const art = compileOntology(docs, { includeIndexes: true });
  // sanity: the compiler really emits via:'dependencies', not 'depends_on'
  assert.ok(art.edges.some((e) => e.via === 'dependencies'), 'compiler should emit via:dependencies');
  assert.ok(!art.edges.some((e) => e.via === 'depends_on'), 'compiler should NOT emit via:depends_on');

  const nodeSlugs = new Set((art.nodes ?? []).map((n) => n.slug));
  // code import graph has a→b only (a→stale exists in vault but not code)
  const r = reconcileImportEdges({
    moduleEdges: [{ from: 'capabilities/a', to: 'capabilities/b', count: 1 }],
    compiledEdges: art.edges,
    aliasToSlug: art.indexes?.aliasToSlug,
    nodeSlugs,
  });
  assert.deepEqual(r.inBoth.map((e) => `${e.from}→${e.to}`), ['capabilities/a→capabilities/b']);
  assert.deepEqual(
    r.inVaultNotInCode.map((e) => `${e.from}→${e.to}`),
    ['capabilities/a→capabilities/stale'],
  );
});

test('reconcileImportEdges — empty inputs are safe', () => {
  const r = reconcileImportEdges({ moduleEdges: [], compiledEdges: [], aliasToSlug: new Map() });
  assert.deepEqual(r, { inBoth: [], inCodeMissingFromVault: [], inCodeMissingEndpointAbsent: [], inVaultNotInCode: [] });
});

test('reconcileImportEdges — nodeSlugs splits landable vs endpoint-absent (firehose→actionable)', () => {
  const r = reconcileImportEdges({
    moduleEdges: [
      { from: 'capabilities/a', to: 'capabilities/b', count: 2 }, // both real nodes → landable
      { from: 'capabilities/a', to: 'capabilities/[locale]', count: 9 }, // to is not a node → endpoint-absent
    ],
    compiledEdges: [],
    aliasToSlug: new Map(),
    nodeSlugs: new Set(['capabilities/a', 'capabilities/b']),
  });
  assert.deepEqual(r.inCodeMissingFromVault.map((e) => `${e.from}→${e.to}`), ['capabilities/a→capabilities/b']);
  assert.equal(r.inCodeMissingFromVault[0].proposedAction.tool, 'add_relation');
  assert.equal(r.inCodeMissingEndpointAbsent.length, 1);
  assert.deepEqual(r.inCodeMissingEndpointAbsent[0].absentEndpoints, ['capabilities/[locale]']);
});

test('reconcileImportEdges — self-edges (A→A) are dropped (no self-dependency noise)', () => {
  const r = reconcileImportEdges({
    moduleEdges: [{ from: 'capabilities/a', to: 'capabilities/a', count: 5 }],
    compiledEdges: [],
    aliasToSlug: new Map(),
  });
  assert.deepEqual(r, { inBoth: [], inCodeMissingFromVault: [], inCodeMissingEndpointAbsent: [], inVaultNotInCode: [] });
});
