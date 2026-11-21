import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finding, proposalGates, relationKey } from './findings.mjs';

const proposal = {
  project: { definition: 'Defined.' },
  domains: [{ definition: 'Defined.' }],
  capabilities: [{ definition: 'Defined.' }],
  elements: [],
};
const answered = { allAnswered: true, witnessesResolved: true };

function gatesWith(codes, competencyAudit = answered, shape = proposal) {
  return proposalGates(shape, codes.map((code) => finding(code, 'error', 'path', 'message')), competencyAudit);
}

test('a clean proposal passes every gate', () => {
  assert.deepEqual(Object.values(gatesWith([])).every(Boolean), true);
});

const GATES_CLOSED_BY_CODE = {
  'missing-citation': ['citationsResolved'],
  'unknown-citation': ['citationsResolved'],
  'untrusted-citation': ['citationsResolved', 'riskyEvidenceControlled'],
  'risky-citation-unconfirmed': ['riskyEvidenceControlled'],
  'unresolved-capability-domain': ['capabilityDomainsResolved'],
  'unresolved-element-domain': ['elementDomainsResolved'],
  'missing-element-path': ['elementPathsResolved'],
  'python-selected-import-element-limit': ['elementPathsResolved'],
  'duplicate-relation': ['relationsResolved'],
  'missing-relation-endpoint': ['relationsResolved'],
  'missing-relation-rationale': ['relationsResolved'],
  'relation-source-not-in-write-plan': ['relationsResolved'],
  'unsupported-relation-type': ['relationsResolved'],
  'unobserved-python-import-dependency': ['relationsResolved'],
  'relation-path-citation-mismatch': ['relationsResolved'],
  'insufficient-domain-relation-authority': ['relationsResolved', 'confidenceValid'],
  'invalid-confidence': ['confidenceValid'],
  'insufficient-purpose-authority': ['confidenceValid'],
  'insufficient-domain-authority': ['confidenceValid'],
};

for (const [code, expectedClosed] of Object.entries(GATES_CLOSED_BY_CODE)) {
  test(`${code} closes exactly ${expectedClosed.join(' and ')}`, () => {
    const closed = Object.entries(gatesWith([code])).filter(([, open]) => !open).map(([gate]) => gate);
    assert.deepEqual(closed, expectedClosed);
  });
}

test('a warning-only code that no gate names closes nothing', () => {
  assert.deepEqual(Object.values(gatesWith(['risky-citation'])).every(Boolean), true);
});

test('a blank definition closes the definition gates and the competency audit passes through', () => {
  const blank = { ...proposal, project: { definition: ' ' }, capabilities: [{ definition: '' }] };
  const gates = gatesWith([], { allAnswered: false, witnessesResolved: false }, blank);
  assert.equal(gates.projectDefined, false);
  assert.equal(gates.conceptsDefined, false);
  assert.equal(gates.competencyQuestionsAnswered, false);
  assert.equal(gates.competencyWitnessesResolved, false);
});

test('a relation is identified by source, type and target together', () => {
  assert.notEqual(
    relationKey({ from: 'a', type: 'depends_on', to: 'b' }),
    relationKey({ from: 'a', type: 'domains', to: 'b' }),
  );
  assert.notEqual(
    relationKey({ from: 'a', type: 'depends_on', to: 'b' }),
    relationKey({ from: 'b', type: 'depends_on', to: 'a' }),
  );
});
