import assert from 'node:assert/strict';
import test from 'node:test';

import {
  edgeTargetKindLabel,
  edgeTargetKindMatches,
  judgeRelationCheck,
  nodeDegree,
  nodeMatchesFilters,
} from './match-rules.mjs';

const anyNode = { kind: null, domain: null, slugContains: null, minDegree: null, maxDegree: null, minInDegree: null, minOutDegree: null, hasIncoming: null, hasOutgoing: null };
const node = { slug: 'capabilities/Login', kind: 'capability', domain: 'domains/auth', inDegree: 2, outDegree: 1 };
const matches = (filters, subject = node) => nodeMatchesFilters(subject, { ...anyNode, ...filters });

test('a node degree is its incoming and outgoing relations together, missing counts being zero', () => {
  assert.equal(nodeDegree(node), 3);
  assert.equal(nodeDegree({}), 0);
});

test('a node with no filters always matches', () => {
  assert.equal(matches({}), true);
  assert.equal(matches({}, { slug: 'x' }), true);
});

test('kind and domain must be equal when given', () => {
  assert.equal(matches({ kind: 'capability' }), true);
  assert.equal(matches({ kind: 'element' }), false);
  assert.equal(matches({ domain: 'domains/auth' }), true);
  assert.equal(matches({ domain: 'domains/billing' }), false);
});

test('the slug filter is a lower-case substring test against the lower-cased slug', () => {
  assert.equal(matches({ slugContains: 'login' }), true);
  assert.equal(matches({ slugContains: 'logout' }), false);
});

test('degree bounds are inclusive and a bound of zero is still a bound', () => {
  assert.equal(matches({ minDegree: 3 }), true);
  assert.equal(matches({ minDegree: 4 }), false);
  assert.equal(matches({ maxDegree: 3 }), true);
  assert.equal(matches({ maxDegree: 2 }), false);
  assert.equal(matches({ minInDegree: 2 }), true);
  assert.equal(matches({ minInDegree: 3 }), false);
  assert.equal(matches({ minOutDegree: 1 }), true);
  assert.equal(matches({ minOutDegree: 2 }), false);
  assert.equal(matches({ maxDegree: 0 }, { slug: 'lonely' }), true);
  assert.equal(matches({ maxDegree: 0 }), false);
});

test('hasIncoming and hasOutgoing keep nodes that do, or deliberately do not, have that direction', () => {
  assert.equal(matches({ hasIncoming: true }), true);
  assert.equal(matches({ hasIncoming: false }), false);
  assert.equal(matches({ hasOutgoing: true }, { slug: 'sink', inDegree: 1 }), false);
  assert.equal(matches({ hasOutgoing: false }, { slug: 'sink', inDegree: 1 }), true);
});

test('an edge target kind is the node kind for a resolved edge and a pseudo kind for the other two', () => {
  const resolved = { resolved: true };
  const external = { resolved: false, external: true };
  const dangling = { resolved: false, external: false };
  assert.equal(edgeTargetKindMatches(resolved, { kind: 'element' }, 'element'), true);
  assert.equal(edgeTargetKindMatches(resolved, { kind: 'element' }, 'external'), false);
  assert.equal(edgeTargetKindMatches(resolved, undefined, 'element'), false);
  assert.equal(edgeTargetKindMatches(external, null, 'external'), true);
  assert.equal(edgeTargetKindMatches(external, null, 'unresolved'), false);
  assert.equal(edgeTargetKindMatches(dangling, null, 'unresolved'), true);
  assert.equal(edgeTargetKindMatches(dangling, null, 'element'), false);
  assert.equal(edgeTargetKindLabel(resolved, { kind: 'element' }), 'element');
  assert.equal(edgeTargetKindLabel(resolved, {}), 'unknown');
  assert.equal(edgeTargetKindLabel(external, null), 'external');
  assert.equal(edgeTargetKindLabel(dangling, null), 'unresolved');
});

const edge = { from: 'a', to: 'b', via: 'elements', resolved: true };
const writeRelationType = (relation) => `write:${relation}`;
const pattern = { fromKind: 'capability', relation: 'elements', toKind: 'element' };
function judge(overrides) {
  return judgeRelationCheck({
    existing: [], inverse: [], matchedPattern: undefined, from: 'a', to: 'b',
    fromKind: 'capability', relation: 'elements', toKind: 'element', writeRelationType, ...overrides,
  });
}

test('an edge that already exists is skipped, with no write proposed', () => {
  const result = judge({ existing: [edge], matchedPattern: pattern });
  assert.equal(result.verdict, 'already_exists');
  assert.deepEqual(result.recommendation, {
    decision: 'skip_existing',
    severity: 'info',
    reason: 'Exact edge already exists; do not add another relation.',
  });
  assert.equal(result.proposedAction, null);
  assert.equal(result.approvalGate, null);
});

test('a reverse edge of the same relation sends the agent back to check direction before adding', () => {
  const result = judge({ inverse: [edge], matchedPattern: pattern });
  assert.equal(result.verdict, 'matches_existing_schema');
  assert.equal(result.recommendation.decision, 'review_inverse');
  assert.equal(result.recommendation.severity, 'warn');
  assert.deepEqual(result.proposedAction, { tool: 'add_relations', args: { relations: [{ from: 'a', to: 'b', type: 'write:elements' }] } });
});

test('a new edge that fits a known schema pattern is safe to add, and one that does not is flagged as a new pattern', () => {
  const fits = judge({ matchedPattern: pattern });
  assert.equal(fits.recommendation.decision, 'safe_to_add');
  assert.match(fits.recommendation.reason, /^No exact or inverse edge found; capability --elements--> element is an existing schema pattern\.$/);
  const unknown = judge({});
  assert.equal(unknown.verdict, 'new_schema_pattern');
  assert.equal(unknown.recommendation.decision, 'review_new_schema');
  assert.equal(unknown.recommendation.severity, 'warn');
  assert.match(unknown.recommendation.reason, /would introduce a new schema pattern\.$/);
  assert.deepEqual(unknown.proposedAction, { tool: 'add_relations', args: { relations: [{ from: 'a', to: 'b', type: 'write:elements' }] } });
});

test('a new dependency is never offered as a ready write: it waits for a stated ability and a person', () => {
  const result = judge({ relation: 'dependencies', matchedPattern: { ...pattern, relation: 'dependencies' } });
  assert.equal(result.proposedAction, null);
  assert.equal(result.approvalGate.status, 'semantic_approval_required');
  assert.equal(result.approvalGate.writeAllowed, false);
  assert.deepEqual(result.approvalGate.required, ['observable_ability', 'semantic_rationale', 'explicit_human_approval', 'why']);
  assert.match(result.approvalGate.next, /call add_relations with a nonblank why on the row\.$/);
});

test('an existing dependency needs no approval gate', () => {
  const result = judge({ relation: 'dependencies', existing: [{ ...edge, via: 'dependencies' }] });
  assert.equal(result.approvalGate, null);
  assert.equal(result.proposedAction, null);
});
