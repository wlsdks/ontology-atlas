import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONSTRUCTION_QUALITY_AXES } from './vocabulary.mjs';
import { normalizedAxes } from './result-review.mjs';

function passingAxisRows() {
  return new Map(CONSTRUCTION_QUALITY_AXES.map((axis) => [axis, { axis, status: 'passed', evidenceRefs: ['w1'], findingIds: [] }]));
}

function derive(overrides = {}) {
  return normalizedAxes(
    overrides.axisRows ?? passingAxisRows(),
    overrides.witnesses ?? new Map([['w1', { current: true }]]),
    overrides.diagnostics ?? new Map(),
    overrides.cqResults ?? [{ id: 'cq1', status: 'passed' }],
    overrides.claims ?? new Map([['c1', { status: 'supported' }]]),
    overrides.citationChecks ?? [{ status: 'verified' }],
    overrides.sourceHiddenTask ?? { status: 'passed' },
    overrides.findings ?? [],
  );
}

const statusOf = (axes) => Object.fromEntries(Object.entries(axes).map(([axis, row]) => [axis, row.status]));

test('a fully supported packet keeps every submitted axis status', () => {
  assert.equal(Object.values(statusOf(derive())).every((status) => status === 'passed'), true);
});

test('an axis nobody measured stays not_measured', () => {
  const axes = derive({ axisRows: new Map() });
  assert.equal(Object.values(statusOf(axes)).every((status) => status === 'not_measured'), true);
});

test('a failed competency question turns functional red; an unresolved one makes it unknown', () => {
  const failed = derive({ cqResults: [{ id: 'cq1', status: 'passed' }, { id: 'cq2', status: 'failed' }] });
  assert.equal(failed.functional.status, 'failed');
  assert.deepEqual(failed.functional.diagnostics.at(-1).cqIds, ['cq2']);
  const unknown = derive({ cqResults: [{ id: 'cq1', status: 'unknown' }] });
  assert.equal(unknown.functional.status, 'unknown');
  assert.equal(unknown.functional.diagnostics.at(-1).id, 'derived:functional:cq-not-passed');
});

test('one unsupported claim fails evidence provenance whatever the submitted axis said', () => {
  const axes = derive({ claims: new Map([['c1', { status: 'partial' }]]) });
  assert.equal(axes.evidence_provenance.status, 'failed');
  assert.equal(axes.semantic.status, 'passed');
});

test('a citation that is not verified fails evidence provenance', () => {
  assert.equal(derive({ citationChecks: [{ status: 'mismatch' }] }).evidence_provenance.status, 'failed');
});

test('a source-hidden task that did not pass blocks pragmatic: failed stays failed, anything else is unknown', () => {
  assert.equal(derive({ sourceHiddenTask: { status: 'failed', missingClaimIds: ['c1'] } }).pragmatic.status, 'failed');
  assert.equal(derive({ sourceHiddenTask: { status: 'not_measured' } }).pragmatic.status, 'unknown');
  assert.deepEqual(derive({ sourceHiddenTask: { status: 'failed', missingClaimIds: ['c1'] } }).pragmatic.diagnostics.at(-1).missingClaimIds, ['c1']);
});

test('an axis that cites stale evidence fails and names the stale references', () => {
  const axes = derive({ witnesses: new Map([['w1', { current: false }]]) });
  assert.equal(axes.semantic.status, 'failed');
  assert.deepEqual(axes.semantic.diagnostics.at(-1).evidenceRefs, ['w1']);
});
