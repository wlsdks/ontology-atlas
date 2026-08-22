import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildFindPathGrowthHint,
  buildSlugNotFoundGrowthHint,
  buildQueryConceptsZeroRowsGrowthHint,
  buildFindEvidenceZeroHitsGrowthHint,
  findNearTitleMatches,
} from './growth-hint.mjs';

// ── buildFindPathGrowthHint ─────────────────────────────────────────────────

test('buildFindPathGrowthHint — both endpoints exist, no path → suggests add_relation', () => {
  const hint = buildFindPathGrowthHint({
    from: 'capabilities/login',
    to: 'elements/token',
    fromExists: true,
    toExists: true,
  });
  assert.match(hint.reason, /No relation path connects/);
  assert.match(hint.reason, /capabilities\/login/);
  assert.match(hint.reason, /elements\/token/);
  assert.deepEqual(hint.exampleCall, {
    tool: 'add_relation',
    args: { from: 'capabilities/login', to: 'elements/token', type: 'relates' },
  });
});

test('buildFindPathGrowthHint — from missing → suggests add_concept for from', () => {
  const hint = buildFindPathGrowthHint({
    from: 'ghost-node',
    to: 'elements/token',
    fromExists: false,
    toExists: true,
  });
  assert.match(hint.reason, /"ghost-node" does not resolve/);
  assert.equal(hint.exampleCall.tool, 'add_concept');
  assert.equal(hint.exampleCall.args.slug, 'ghost-node');
  assert.equal(hint.exampleCall.args.title, 'Ghost Node');
});

test('buildFindPathGrowthHint — to missing → suggests add_concept for to', () => {
  const hint = buildFindPathGrowthHint({
    from: 'capabilities/login',
    to: 'elements/ghost',
    fromExists: true,
    toExists: false,
  });
  assert.equal(hint.exampleCall.args.slug, 'elements/ghost');
  assert.equal(hint.exampleCall.args.title, 'Ghost');
});

test('buildFindPathGrowthHint — both missing → mentions neither and picks from first', () => {
  const hint = buildFindPathGrowthHint({
    from: 'ghost-a',
    to: 'ghost-b',
    fromExists: false,
    toExists: false,
  });
  assert.match(hint.reason, /Neither "ghost-a" nor "ghost-b"/);
  assert.equal(hint.exampleCall.args.slug, 'ghost-a');
});

// ── buildSlugNotFoundGrowthHint ─────────────────────────────────────────────

test('buildSlugNotFoundGrowthHint — with candidates → did-you-mean, exampleCall retries get_concept', () => {
  const hint = buildSlugNotFoundGrowthHint({
    slug: 'capabilties/login',
    candidateSlugs: ['capabilities/login', 'capabilities/logout'],
  });
  assert.match(hint.reason, /"capabilties\/login" does not resolve/);
  assert.match(hint.suggestion, /capabilities\/login/);
  assert.match(hint.suggestion, /capabilities\/logout/);
  assert.deepEqual(hint.exampleCall, {
    tool: 'get_concept',
    args: { slug: 'capabilities/login' },
  });
});

test('buildSlugNotFoundGrowthHint — no candidates → add_concept scaffold', () => {
  const hint = buildSlugNotFoundGrowthHint({ slug: 'elements/brand-new-thing', candidateSlugs: [] });
  assert.match(hint.reason, /no similarly-named node exists/);
  assert.deepEqual(hint.exampleCall, {
    tool: 'add_concept',
    args: { slug: 'elements/brand-new-thing', kind: 'element', title: 'Brand New Thing' },
  });
});

// ── buildQueryConceptsZeroRowsGrowthHint ────────────────────────────────────

test('buildQueryConceptsZeroRowsGrowthHint — filter references a kind absent from vault census', () => {
  const hint = buildQueryConceptsZeroRowsGrowthHint({
    filter: 'kind=widget AND has(elements)',
    byKind: { capability: 5, element: 10 },
    byDomain: { auth: 3 },
  });
  assert.match(hint.reason, /kind="widget" has 0 nodes in this vault/);
  assert.deepEqual(hint.exampleCall, { tool: 'list_kinds', args: {} });
});

test('buildQueryConceptsZeroRowsGrowthHint — filter references a domain absent from vault census', () => {
  const hint = buildQueryConceptsZeroRowsGrowthHint({
    filter: 'domain=billing',
    byKind: { capability: 5 },
    byDomain: { auth: 3 },
  });
  assert.match(hint.reason, /domain="billing" has 0 nodes in this vault/);
});

test('buildQueryConceptsZeroRowsGrowthHint — kind/domain both exist → generic loosen-filter suggestion', () => {
  const hint = buildQueryConceptsZeroRowsGrowthHint({
    filter: 'kind=capability AND domain=auth AND NOT has(elements)',
    byKind: { capability: 5 },
    byDomain: { auth: 3 },
  });
  assert.match(hint.reason, /matched 0 rows for filter/);
  assert.match(hint.suggestion, /Loosen the filter/);
});

test('buildQueryConceptsZeroRowsGrowthHint — filter with no kind/domain equality → generic suggestion', () => {
  const hint = buildQueryConceptsZeroRowsGrowthHint({
    filter: 'has(elements)',
    byKind: {},
    byDomain: {},
  });
  assert.match(hint.suggestion, /Loosen the filter/);
});

// ── buildFindEvidenceZeroHitsGrowthHint / findNearTitleMatches ──────────────

test('findNearTitleMatches — finds token-overlap candidates above the score floor', () => {
  const candidates = [
    { slug: 'capabilities/token-issue', title: 'Token Issue' },
    { slug: 'capabilities/unrelated', title: 'Completely Unrelated Thing' },
  ];
  const matches = findNearTitleMatches('Token Issuance', candidates);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].slug, 'capabilities/token-issue');
  assert.ok(matches[0].score > 0);
});

test('findNearTitleMatches — below score floor is excluded, not invented', () => {
  const candidates = [{ slug: 'capabilities/unrelated', title: 'Completely Unrelated Thing' }];
  const matches = findNearTitleMatches('Token Issuance', candidates);
  assert.deepEqual(matches, []);
});

test('findNearTitleMatches — empty query tokens → empty result', () => {
  const candidates = [{ slug: 'capabilities/token-issue', title: 'Token Issue' }];
  assert.deepEqual(findNearTitleMatches('   ', candidates), []);
});

test('buildFindEvidenceZeroHitsGrowthHint — with near matches suggests checking before adding', () => {
  const hint = buildFindEvidenceZeroHitsGrowthHint({
    title: 'Token Issuance',
    nearMatches: [{ slug: 'capabilities/token-issue', title: 'Token Issue', score: 0.5 }],
  });
  assert.match(hint.reason, /No vault doc mentions "Token Issuance"/);
  assert.match(hint.suggestion, /Token Issue \(capabilities\/token-issue\)/);
  assert.deepEqual(hint.exampleCall, {
    tool: 'get_concept',
    args: { slug: 'capabilities/token-issue' },
  });
});

test('buildFindEvidenceZeroHitsGrowthHint — no near matches → add_concept scaffold with slugified title', () => {
  const hint = buildFindEvidenceZeroHitsGrowthHint({ title: 'Brand New Concept', nearMatches: [] });
  assert.match(hint.reason, /no similarly-titled node exists/);
  assert.deepEqual(hint.exampleCall, {
    tool: 'add_concept',
    args: { slug: 'brand-new-concept', kind: 'element', title: 'Brand New Concept' },
  });
});

// ── Korean vault slug suggestions (audit 2026-07-25) ───────────────────────

test('한글 제목이 untitled 로 뭉개지지 않는다', () => {
  const hint = buildFindEvidenceZeroHitsGrowthHint({ title: '인증 도메인' });
  // Before the fix: the `[^a-z0-9]` replacement erased Korean entirely, yielding
  // 'untitled', and the second Korean concept collided on the slug.
  // `init --locale=ko` supports this path by default.
  assert.notEqual(hint.exampleCall.args.slug, 'untitled');
  assert.equal(hint.exampleCall.args.slug, '인증-도메인');
});

test('영문 동작은 그대로 (회귀 0)', () => {
  const hint = buildFindEvidenceZeroHitsGrowthHint({ title: 'Payment Billing' });
  assert.equal(hint.exampleCall.args.slug, 'payment-billing');
});

test('슬러그로 남길 글자가 없으면 여전히 untitled 로 떨어진다', () => {
  const hint = buildFindEvidenceZeroHitsGrowthHint({ title: '!!! ???' });
  assert.equal(hint.exampleCall.args.slug, 'untitled');
});
