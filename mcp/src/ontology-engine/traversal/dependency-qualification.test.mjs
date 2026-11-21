import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDependencyImpactQualification, qualifyDeclaredDependencyEdges } from './dependency-qualification.mjs';

test('a declared dependency with a rationale is qualified, one without is left for review', () => {
  const [withWhy, without] = qualifyDeclaredDependencyEdges([{ id: 'a', rationale: 'calls it' }, { id: 'b' }]);
  assert.equal(withWhy.qualification, 'declared_with_rationale');
  assert.equal(without.qualification, 'review_required');
  assert.equal(without.rationale, null);
});

test('no declared edge means the impact is unknown, not clean', () => {
  assert.equal(buildDependencyImpactQualification([]).status, 'unknown');
});

test('one edge without a rationale makes the whole impact review-required, and none are source-backed', () => {
  const edges = qualifyDeclaredDependencyEdges([{ rationale: 'calls it' }, {}]);
  const result = buildDependencyImpactQualification(edges);
  assert.equal(result.status, 'review_required');
  assert.equal(result.declaredEdges, 2);
  assert.equal(result.declaredWithRationaleEdges, 1);
  assert.equal(result.reviewRequiredEdges, 1);
  assert.equal(result.sourceBacked, false);
  assert.equal(result.sourceBackedEdges, 0);
});

test('every edge with a rationale is declared_with_rationale', () => {
  const result = buildDependencyImpactQualification(qualifyDeclaredDependencyEdges([{ rationale: 'a' }, { rationale: 'b' }]));
  assert.equal(result.status, 'declared_with_rationale');
});
