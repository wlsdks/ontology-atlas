import assert from 'node:assert/strict';
import test from 'node:test';

import { findNearMatchSlug, suggestedSlugForReference, titleFromReference } from './reference-repair.mjs';

const nodes = (...slugs) => slugs.map((slug) => ({ slug }));

test('a dangling reference matches the one node whose last segment is the same', () => {
  assert.equal(findNearMatchSlug('billing', nodes('domains/billing', 'domains/shipping')), 'domains/billing');
  assert.equal(findNearMatchSlug('BILLING', nodes('domains/billing')), 'domains/billing');
});

test('two nodes with the same last segment are ambiguous, so nothing is proposed', () => {
  assert.equal(findNearMatchSlug('billing', nodes('domains/billing', 'capabilities/billing')), null);
});

test('a prefix of exactly one last segment matches when no segment is equal', () => {
  assert.equal(findNearMatchSlug('billing', nodes('capabilities/billing-export', 'domains/shipping')), 'capabilities/billing-export');
  assert.equal(findNearMatchSlug('billing', nodes('capabilities/billing-export', 'capabilities/billing-import')), null);
});

test('a reference that already resolves, or an empty one, has no near match', () => {
  assert.equal(findNearMatchSlug('domains/billing', nodes('domains/billing')), null);
  assert.equal(findNearMatchSlug('  ', nodes('domains/billing')), null);
});

test('a file path becomes a slug under the folder of the kind it should have', () => {
  assert.equal(suggestedSlugForReference('src/Billing Service.ts', 'capability'), 'capabilities/src/billing-service');
  assert.equal(suggestedSlugForReference('billing', 'domain'), 'domains/billing');
  assert.equal(suggestedSlugForReference('billing', 'element'), 'elements/billing');
  assert.equal(suggestedSlugForReference('capabilities/export', 'capability'), 'capabilities/export');
  assert.equal(suggestedSlugForReference('', 'domain'), 'domains/unnamed');
});

test('a reference is titled by its last segment in words', () => {
  assert.equal(titleFromReference('src/billing_service.ts'), 'Billing service');
  assert.equal(titleFromReference('domains/order-intake'), 'Order intake');
  assert.equal(titleFromReference(''), 'Untitled');
});
