// reconcile-imports — unit test (node:test). Atlas roadmap Track A #1.
// Diff code-derived import edges (inferImports moduleEdges) against compiled
// vault depends_on edges. Validators (planner team 2026-05-31) insisted the
// alias-normalization (aliasToSlug + ambiguous-alias) case be first-class, not
// a follow-up — so it is fixture #1 below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNextImportRelationReview,
  reconcileImportEdges,
} from './reconcile-imports.mjs';
import { compileOntology } from './ontology-compiler.mjs';

// In-memory fixtures (no fs) — matches the lightweight contract-test style.
const moduleEdges = [
  { from: 'capabilities/a', to: 'capabilities/b', count: 3, kindCounts: { static: 3 } }, // in both
  {
    from: 'capabilities/a',
    to: 'elements/src/x',
    count: 1,
    kindCounts: { static: 1 },
    evidence: [
      { from: 'src/features/a/index.ts', to: 'src/entities/x/index.ts', kind: 'static' },
    ],
    evidenceLimited: false,
  }, // code-only → semantic review candidate, never an executable write
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

  // inCodeMissingFromVault: a→elements/src/x stays a read-only promotion candidate.
  assert.equal(r.inCodeMissingFromVault.length, 1);
  const miss = r.inCodeMissingFromVault[0];
  assert.equal(miss.from, 'capabilities/a');
  assert.equal(miss.to, 'elements/src/x');
  assert.equal(miss.proposedAction, undefined);
  assert.deepEqual(miss.sourceEvidence, [
    { from: 'src/features/a/index.ts', to: 'src/entities/x/index.ts', kind: 'static' },
  ]);
  assert.equal(miss.sourceEvidenceLimited, false);
  assert.deepEqual(miss.review, {
    status: 'rationale_review_required',
    writeAllowed: false,
    required: ['semantic_rationale', 'human_approval'],
    next:
      'Review the exact import evidence and both ontology concepts, explain why the semantic dependency holds, ask the user, then write one explicit depends_on relation with why.',
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
    { slug: 'capabilities/a', frontmatter: { uid: '00000000-0000-4000-8000-000000000001', kind: 'capability', title: 'A', depends_on: ['capabilities/b', 'capabilities/stale'] }, body: '', mtime: 1 },
    { slug: 'capabilities/b', frontmatter: { uid: '00000000-0000-4000-8000-000000000002', kind: 'capability', title: 'B' }, body: '', mtime: 1 },
    { slug: 'capabilities/stale', frontmatter: { uid: '00000000-0000-4000-8000-000000000003', kind: 'capability', title: 'Stale' }, body: '', mtime: 1 },
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

test('reconcileImportEdges — nodeSlugs splits reviewable vs endpoint-absent without making either executable', () => {
  const r = reconcileImportEdges({
    moduleEdges: [
      { from: 'capabilities/a', to: 'capabilities/b', count: 2 }, // both real nodes → reviewable
      { from: 'capabilities/a', to: 'capabilities/[locale]', count: 9 }, // to is not a node → endpoint-absent
    ],
    compiledEdges: [],
    aliasToSlug: new Map(),
    nodeSlugs: new Set(['capabilities/a', 'capabilities/b']),
  });
  assert.deepEqual(r.inCodeMissingFromVault.map((e) => `${e.from}→${e.to}`), ['capabilities/a→capabilities/b']);
  assert.equal(r.inCodeMissingFromVault[0].proposedAction, undefined);
  assert.equal(r.inCodeMissingFromVault[0].review.writeAllowed, false);
  assert.deepEqual(r.inCodeMissingFromVault[0].review.required, [
    'source_evidence',
    'semantic_rationale',
    'human_approval',
  ]);
  assert.equal(r.inCodeMissingEndpointAbsent.length, 1);
  assert.deepEqual(r.inCodeMissingEndpointAbsent[0].absentEndpoints, ['capabilities/[locale]']);
  assert.equal(r.inCodeMissingEndpointAbsent[0].review.writeAllowed, false);
  assert.deepEqual(r.inCodeMissingEndpointAbsent[0].review.required, [
    'vault_endpoints',
    'source_evidence',
    'semantic_rationale',
    'human_approval',
  ]);
});

test('reconcileImportEdges — self-edges (A→A) are dropped (no self-dependency noise)', () => {
  const r = reconcileImportEdges({
    moduleEdges: [{ from: 'capabilities/a', to: 'capabilities/a', count: 5 }],
    compiledEdges: [],
    aliasToSlug: new Map(),
  });
  assert.deepEqual(r, { inBoth: [], inCodeMissingFromVault: [], inCodeMissingEndpointAbsent: [], inVaultNotInCode: [] });
});

test('buildNextImportRelationReview — returns one non-executable review packet and a stateless cursor', () => {
  const reconciliation = {
    inBoth: [],
    inCodeMissingFromVault: [
      {
        from: 'capabilities/a',
        to: 'capabilities/b',
        count: 3,
        sourceEvidence: [
          { from: 'src/a.ts', to: 'src/b.ts', kind: 'static' },
        ],
        sourceEvidenceLimited: false,
        review: {
          status: 'rationale_review_required',
          writeAllowed: false,
          required: ['semantic_rationale', 'human_approval'],
        },
      },
      {
        from: 'capabilities/c',
        to: 'capabilities/d',
        count: 1,
        sourceEvidence: [
          { from: 'src/c.ts', to: 'src/d.ts', kind: 'dynamic' },
        ],
        sourceEvidenceLimited: false,
        review: {
          status: 'rationale_review_required',
          writeAllowed: false,
          required: ['semantic_rationale', 'human_approval'],
        },
      },
    ],
    inCodeMissingEndpointAbsent: [{ from: 'capabilities/a', to: 'elements/missing' }],
    inVaultNotInCode: [],
  };

  const first = buildNextImportRelationReview(reconciliation);
  assert.equal(first.contract, 'nextRelationReview:v1');
  assert.equal(first.writeAllowed, false);
  assert.equal(first.proposedAction, undefined);
  assert.deepEqual(first.candidate, {
    from: 'capabilities/a',
    to: 'capabilities/b',
    relationType: 'depends_on',
    importCount: 3,
    sourceEvidence: [{ from: 'src/a.ts', to: 'src/b.ts', kind: 'static' }],
    sourceEvidenceLimited: false,
  });
  assert.deepEqual(first.nextCalls, [
    {
      tool: 'get_concepts',
      arguments: { slugs: ['capabilities/a', 'capabilities/b'], body: 'full' },
      purpose: 'Read both ontology meanings before deciding whether the code fact is a semantic dependency.',
    },
    {
      tool: 'query_ontology',
      arguments: {
        operation: 'relation_check',
        from: 'capabilities/a',
        to: 'capabilities/b',
        type: 'depends_on',
      },
      purpose: 'Check graph shape only; safe_to_add is not semantic approval.',
    },
  ]);
  assert.equal(first.cursor.total, 2);
  assert.equal(first.cursor.remaining, 1);
  assert.equal(first.cursor.hasMore, true);
  assert.equal(first.cursor.afterReviewId, null);
  assert.equal(first.cursor.nextAfterReviewId, first.reviewId);

  const second = buildNextImportRelationReview(reconciliation, {
    afterReviewId: first.reviewId,
  });
  assert.equal(second.candidate.from, 'capabilities/c');
  assert.equal(second.candidate.to, 'capabilities/d');
  assert.equal(second.cursor.remaining, 0);
  assert.equal(second.cursor.hasMore, false);
});

test('buildNextImportRelationReview — unknown cursor fails closed instead of restarting silently', () => {
  assert.throws(
    () => buildNextImportRelationReview({
      inCodeMissingFromVault: [{ from: 'capabilities/a', to: 'capabilities/b' }],
    }, { afterReviewId: 'missing-review-id' }),
    /afterReviewId.*not found.*omit/i,
  );
});
