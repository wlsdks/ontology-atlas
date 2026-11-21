import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finding, proposalGates, relationKey } from './proposal-findings.mjs';

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

test('each finding code closes only the gates it names', () => {
  const closedBy = (code) => Object.entries(gatesWith([code])).filter(([, open]) => !open).map(([gate]) => gate);
  assert.deepEqual(closedBy('missing-citation'), ['citationsResolved']);
  assert.deepEqual(closedBy('untrusted-citation'), ['citationsResolved', 'riskyEvidenceControlled']);
  assert.deepEqual(closedBy('risky-citation-unconfirmed'), ['riskyEvidenceControlled']);
  assert.deepEqual(closedBy('unresolved-capability-domain'), ['capabilityDomainsResolved']);
  assert.deepEqual(closedBy('python-selected-import-element-limit'), ['elementPathsResolved']);
  assert.deepEqual(closedBy('duplicate-relation'), ['relationsResolved']);
  assert.deepEqual(closedBy('insufficient-domain-relation-authority'), ['relationsResolved', 'confidenceValid']);
  assert.deepEqual(closedBy('invalid-confidence'), ['confidenceValid']);
});

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
