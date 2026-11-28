import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildFindPathGrowthHint,
  buildSlugNotFoundGrowthHint,
  buildFilterZeroRowsGrowthHint,
  buildMentionsZeroHitsGrowthHint,
  findNearTitleMatches,
} from './growth-hint.mjs';


test('buildFindPathGrowthHint — both endpoints exist, no path → suggests add_relations', () => {
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
    tool: 'add_relations',
    args: { relations: [{ from: 'capabilities/login', to: 'elements/token', type: 'relates' }] },
  });
});

test('buildFindPathGrowthHint — from missing → suggests add_concepts for from', () => {
  const hint = buildFindPathGrowthHint({
    from: 'ghost-node',
    to: 'elements/token',
    fromExists: false,
    toExists: true,
  });
  assert.match(hint.reason, /"ghost-node" does not resolve/);
  assert.equal(hint.exampleCall.tool, 'add_concepts');
  assert.equal(hint.exampleCall.args.concepts[0].slug, 'ghost-node');
  assert.equal(hint.exampleCall.args.concepts[0].title, 'Ghost Node');
});

test('buildFindPathGrowthHint — to missing → suggests add_concepts for to', () => {
  const hint = buildFindPathGrowthHint({
    from: 'capabilities/login',
    to: 'elements/ghost',
    fromExists: true,
    toExists: false,
  });
  assert.equal(hint.exampleCall.args.concepts[0].slug, 'elements/ghost');
  assert.equal(hint.exampleCall.args.concepts[0].title, 'Ghost');
});

test('buildFindPathGrowthHint — both missing → mentions neither and picks from first', () => {
  const hint = buildFindPathGrowthHint({
    from: 'ghost-a',
    to: 'ghost-b',
    fromExists: false,
    toExists: false,
  });
  assert.match(hint.reason, /Neither "ghost-a" nor "ghost-b"/);
  assert.equal(hint.exampleCall.args.concepts[0].slug, 'ghost-a');
});


test('buildSlugNotFoundGrowthHint — with candidates → did-you-mean, exampleCall retries get_concepts', () => {
  const hint = buildSlugNotFoundGrowthHint({
    slug: 'capabilties/login',
    candidateSlugs: ['capabilities/login', 'capabilities/logout'],
  });
  assert.match(hint.reason, /"capabilties\/login" does not resolve/);
  assert.match(hint.suggestion, /capabilities\/login/);
  assert.match(hint.suggestion, /capabilities\/logout/);
  assert.deepEqual(hint.exampleCall, {
    tool: 'get_concepts',
    args: { slugs: ['capabilities/login'] },
  });
});

test('buildSlugNotFoundGrowthHint — no candidates → add_concepts scaffold', () => {
  const hint = buildSlugNotFoundGrowthHint({ slug: 'elements/brand-new-thing', candidateSlugs: [] });
  assert.match(hint.reason, /no similarly-named node exists/);
  assert.deepEqual(hint.exampleCall, {
    tool: 'add_concepts',
    args: { concepts: [{ slug: 'elements/brand-new-thing', kind: 'element', title: 'Brand New Thing' }] },
  });
});


test('buildFilterZeroRowsGrowthHint — filter references a kind absent from vault census', () => {
  const hint = buildFilterZeroRowsGrowthHint({
    filter: 'kind=widget AND has(elements)',
    byKind: { capability: 5, element: 10 },
    byDomain: { auth: 3 },
  });
  assert.match(hint.reason, /kind="widget" has 0 nodes in this vault/);
  assert.deepEqual(hint.exampleCall, { tool: 'list_concepts', args: { limit: 1 } });
});

test('buildFilterZeroRowsGrowthHint — filter references a domain absent from vault census', () => {
  const hint = buildFilterZeroRowsGrowthHint({
    filter: 'domain=billing',
    byKind: { capability: 5 },
    byDomain: { auth: 3 },
  });
  assert.match(hint.reason, /domain="billing" has 0 nodes in this vault/);
});

test('buildFilterZeroRowsGrowthHint — kind/domain both exist → generic loosen-filter suggestion', () => {
  const hint = buildFilterZeroRowsGrowthHint({
    filter: 'kind=capability AND domain=auth AND NOT has(elements)',
    byKind: { capability: 5 },
    byDomain: { auth: 3 },
  });
  assert.match(hint.reason, /matched 0 rows for filter/);
  assert.match(hint.suggestion, /Loosen the filter/);
});

test('buildFilterZeroRowsGrowthHint — filter with no kind/domain equality → generic suggestion', () => {
  const hint = buildFilterZeroRowsGrowthHint({
    filter: 'has(elements)',
    byKind: {},
    byDomain: {},
  });
  assert.match(hint.suggestion, /Loosen the filter/);
});


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

test('buildMentionsZeroHitsGrowthHint — with near matches suggests checking before adding', () => {
  const hint = buildMentionsZeroHitsGrowthHint({
    text: 'Token Issuance',
    nearMatches: [{ slug: 'capabilities/token-issue', title: 'Token Issue', score: 0.5 }],
  });
  assert.match(hint.reason, /No vault node mentions "Token Issuance"/);
  assert.match(hint.suggestion, /Token Issue \(capabilities\/token-issue\)/);
  assert.deepEqual(hint.exampleCall, {
    tool: 'get_concepts',
    args: { slugs: ['capabilities/token-issue'] },
  });
});

test('buildMentionsZeroHitsGrowthHint — no near matches → add_concepts scaffold with slugified title', () => {
  const hint = buildMentionsZeroHitsGrowthHint({ text: 'Brand New Concept', nearMatches: [] });
  assert.match(hint.reason, /no similarly-titled node exists/);
  assert.deepEqual(hint.exampleCall, {
    tool: 'add_concepts',
    args: { concepts: [{ slug: 'brand-new-concept', kind: 'element', title: 'Brand New Concept' }] },
  });
});


test('a Hangul title does not collapse to untitled', () => {
  const hint = buildMentionsZeroHitsGrowthHint({ text: '인증 도메인' });
  // Replacing `[^a-z0-9]` erased Korean, so every Korean concept collided on
  // 'untitled' (`init --locale=ko` is supported).
  assert.notEqual(hint.exampleCall.args.concepts[0].slug, 'untitled');
  assert.equal(hint.exampleCall.args.concepts[0].slug, '인증-도메인');
});

test('English titles behave as before', () => {
  const hint = buildMentionsZeroHitsGrowthHint({ text: 'Payment Billing' });
  assert.equal(hint.exampleCall.args.concepts[0].slug, 'payment-billing');
});

test('still falls back to untitled when no slug character remains', () => {
  const hint = buildMentionsZeroHitsGrowthHint({ text: '!!! ???' });
  assert.equal(hint.exampleCall.args.concepts[0].slug, 'untitled');
});

test('zero-row census treats inherited dictionary names as absent', () => {
  for (const domain of ['constructor', 'toString', 'hasOwnProperty']) {
    const missing = buildFilterZeroRowsGrowthHint({ filter: `domain="${domain}"`, byDomain: {} });
    assert.ok(missing.reason.includes(`domain="${domain}" has 0 nodes`));
    const present = buildFilterZeroRowsGrowthHint({ filter: `domain="${domain}"`, byDomain: Object.fromEntries([[domain, 1]]) });
    assert.ok(!present.reason.includes('has 0 nodes'));
  }
  const missingKind = buildFilterZeroRowsGrowthHint({ filter: 'kind="constructor"', byKind: {} });
  assert.ok(missingKind.reason.includes('kind="constructor" has 0 nodes'));
});
