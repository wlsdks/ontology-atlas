import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';

import { buildConceptDelta, classifyVaultAlignment } from './plan-rules.mjs';

const target = join('/work', 'repo');
const classify = (overrides) => classifyVaultAlignment({
  vaultProjectNodes: [],
  analyzedProjectSlug: 'projects/shop',
  aliasToSlug: {},
  target,
  vaultRoot: join(target, 'atlas'),
  ...overrides,
});

test('a vault whose project is the analyzed one speaks for it', () => {
  const result = classify({ vaultProjectNodes: [{ slug: 'projects/shop', title: 'Shop' }] });
  assert.deepEqual(
    { alignment: result.alignment, applies: result.appliesToAnalyzedProject },
    { alignment: 'matching-project', applies: true },
  );
});

test('the project is also matched through its frontmatter slug and through an alias', () => {
  assert.equal(classify({ vaultProjectNodes: [{ slug: 'project', frontmatter: { slug: 'projects/shop' } }] }).alignment, 'matching-project');
  assert.equal(
    classify({ vaultProjectNodes: [{ slug: 'projects/store' }], aliasToSlug: { 'projects/shop': 'projects/store' } }).alignment,
    'matching-project',
  );
});

test('a different project means the validation counts describe the vault, not the repository', () => {
  const result = classify({ vaultProjectNodes: [{ slug: 'projects/other', title: 'Other' }] });
  assert.equal(result.alignment, 'mismatched-project');
  assert.equal(result.appliesToAnalyzedProject, false);
  assert.match(result.note, /not proven to describe the analyzed repository/);
});

test('the starter vault applies only while it sits inside the analyzed repository', () => {
  const starter = [{ slug: 'project', title: 'My Project' }];
  const inside = classify({ vaultProjectNodes: starter });
  assert.equal(inside.alignment, 'uninitialized-vault');
  assert.equal(inside.appliesToAnalyzedProject, true);
  assert.match(inside.note, /pre-bootstrap baseline/);
  const outside = classify({ vaultProjectNodes: starter, vaultRoot: '/elsewhere/atlas' });
  assert.equal(outside.alignment, 'uninitialized-vault');
  assert.equal(outside.appliesToAnalyzedProject, false);
});

test('a vault folder that merely starts with the repository name is outside it', () => {
  const sibling = classify({ vaultProjectNodes: [{ slug: 'project', title: 'My Project' }], vaultRoot: `${target}-notes` });
  assert.equal(sibling.appliesToAnalyzedProject, false);
});

test('no project in the vault, or none analyzed, is unknown', () => {
  assert.equal(classify({}).alignment, 'unknown');
  assert.equal(classify({ vaultProjectNodes: [{ slug: 'projects/other' }], analyzedProjectSlug: null }).alignment, 'unknown');
});

test('candidates split into existing, ambiguous and new, by slug or alias', () => {
  const compiled = {
    nodes: [{ slug: 'domains/billing' }],
    ambiguousAliases: [{ alias: 'domains/pay' }],
  };
  const delta = buildConceptDelta({
    conceptCount: 4,
    candidateSlugs: ['domains/billing', 'domains/old-name', 'domains/pay', 'domains/new'],
    compiled,
    aliasToSlug: { 'domains/old-name': 'domains/billing' },
  });
  assert.deepEqual(delta, {
    candidates: 4,
    existing: 2,
    ambiguous: 1,
    new: 1,
    limited: false,
    sampleAmbiguousSlugs: ['domains/pay'],
    sampleNewSlugs: ['domains/new'],
  });
});

test('the delta is limited past ten new or ten ambiguous candidates and samples only ten', () => {
  const slugs = Array.from({ length: 11 }, (_, index) => `capabilities/c${String(index).padStart(2, '0')}`);
  const delta = buildConceptDelta({ conceptCount: 11, candidateSlugs: slugs, compiled: { nodes: [] }, aliasToSlug: {} });
  assert.equal(delta.limited, true);
  assert.equal(delta.sampleNewSlugs.length, 10);
});
