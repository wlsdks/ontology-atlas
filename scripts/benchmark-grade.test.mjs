import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { AXES, GRADE_SCHEMA, compareGradings, gradingPrompt, prepareGradingWorkspace, summarizeRepeats } from './benchmark-grade.mjs';

test('the grader is held to the same maxima the criteria publish', () => {
  const properties = GRADE_SCHEMA.properties.grades.items.properties;
  assert.equal(properties.correct.maximum, 3);
  assert.equal(properties.citations.maximum, 2);
  assert.equal(properties.boundary.maximum, 2);
  assert.equal(properties.nextStep.maximum, 2);
  assert.equal(properties.unsupported.maximum, undefined, 'unsupported is a count, not a capped score');
  assert.equal(properties.unverifiable.maximum, undefined, 'unverifiable is a count too');
  assert.deepEqual(AXES.map((axis) => axis.max), [3, 2, 2, 2]);
});

test('the grader is told not to score vocabulary', () => {
  const prompt = gradingPrompt(24);
  assert.match(prompt, /24 answers/);
  assert.match(prompt, /not itself a quality difference/);
  assert.match(prompt, /check every path and/i);
  // The first run marked nearly every vault-side answer unsupported because the
  // packet withholds the tool responses those answers read. A claim the grader
  // cannot see is a gap in the packet, not a fault in the answer.
  assert.match(prompt, /unverifiable: claims you simply cannot check/);
  assert.match(prompt, /must not lower any score/);
  assert.match(prompt, /Do not deduct for a citation you cannot see/);
});

test('the grading workspace carries the answers, the criteria, both sources and both vaults', () => {
  const root = mkdtempSync(join(tmpdir(), 'grade-ws-'));
  try {
    const packet = join(root, 'packet.md');
    const rubric = join(root, 'rubric.md');
    writeFileSync(packet, '## C01\n', 'utf8');
    writeFileSync(rubric, '# criteria\n', 'utf8');
    const workspace = join(root, 'ws');
    prepareGradingWorkspace({ packetPath: packet, rubricPath: rubric, scratchRoot: workspace });
    assert.ok(existsSync(join(workspace, 'answers.md')));
    assert.ok(existsSync(join(workspace, 'criteria.md')));
    assert.ok(existsSync(join(workspace, 'source-greenfield/README.md')));
    assert.ok(existsSync(join(workspace, 'source-brownfield/README.md')));
    assert.ok(existsSync(join(workspace, 'vault-greenfield/capabilities/checkout.md')));
    assert.ok(existsSync(join(workspace, 'vault-brownfield/capabilities/decision-broadcast.md')));
    assert.ok(!existsSync(join(workspace, 'source-greenfield/golden.json')), 'the answer key must not reach the grader');
    assert.match(readFileSync(join(workspace, 'vault-greenfield/capabilities/checkout.md'), 'utf8'), /Excludes inventory reconciliation/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('comparing two gradings reports agreement and surfaces the real disagreements', () => {
  const mine = {
    C01: { correct: 3, citations: 2, boundary: 2, nextStep: 2 },
    C02: { correct: 1, citations: 2, boundary: 1, nextStep: 1 },
    C03: { correct: 2, citations: 2, boundary: 2, nextStep: 2 },
  };
  const theirs = {
    C01: { correct: 3, citations: 2, boundary: 2, nextStep: 2 },
    C02: { correct: 3, citations: 2, boundary: 2, nextStep: 1 },
    C03: { correct: 2, citations: 2, boundary: 2, nextStep: 1 },
  };
  const { ids, perAxis, disagreements } = compareGradings(mine, theirs);
  assert.deepEqual(ids, ['C01', 'C02', 'C03']);
  const correct = perAxis.find((axis) => axis.key === 'correct');
  assert.equal(correct.exact, 2);
  assert.equal(correct.meanAbsolute, Number((2 / 3).toFixed(3)));
  assert.deepEqual(disagreements.map((row) => row.id), ['C02'], 'only a gap of 2 or more is a real disagreement');
  const nextStep = perAxis.find((axis) => axis.key === 'nextStep');
  assert.equal(nextStep.within1, 1, 'one-point differences are agreement within tolerance');
});

test('repeats report how far the grader moves when nothing else changed', () => {
  // Three readings of the same two answers. The point of the summary is that the
  // spread is visible beside the average, so a difference smaller than the
  // grader's own wobble is never mistaken for a result.
  const runs = [
    { C01: { correct: 3, citations: 2, boundary: 2, nextStep: 2 }, C02: { correct: 2, citations: 2, boundary: 2, nextStep: 1 } },
    { C01: { correct: 3, citations: 2, boundary: 2, nextStep: 2 }, C02: { correct: 3, citations: 2, boundary: 2, nextStep: 1 } },
    { C01: { correct: 2, citations: 2, boundary: 2, nextStep: 2 }, C02: { correct: 3, citations: 1, boundary: 2, nextStep: 2 } },
  ];
  const { ids, perAxis } = summarizeRepeats(runs);
  assert.deepEqual(ids, ['C01', 'C02']);
  const correct = perAxis.find((axis) => axis.key === 'correct');
  assert.deepEqual(correct.means, [2.5, 3, 2.5]);
  assert.equal(correct.spread, 0.5);
  assert.equal(correct.cellsThatMoved, 2, 'both cells changed across the three readings');
  const boundary = perAxis.find((axis) => axis.key === 'boundary');
  assert.equal(boundary.spread, 0, 'an axis nobody moved has no spread');
  assert.equal(boundary.cellsThatMoved, 0);
});

test('a single reading still summarizes, with no spread to report', () => {
  const { perAxis, runs } = summarizeRepeats([{ C01: { correct: 3, citations: 2, boundary: 2, nextStep: 2 } }]);
  assert.equal(runs, 1);
  assert.ok(perAxis.every((axis) => axis.spread === 0));
});
