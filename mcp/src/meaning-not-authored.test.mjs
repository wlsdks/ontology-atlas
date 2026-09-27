// "Not written yet" and "broken" are different statements.
//
// Why (measured 2026-08-17): checking a vault **immediately after creating it**
// produced:
//
//   vault health  needs_attention
//     ⚠ meaning_assessment  1 project meaning assessment(s) require review;
//                           first project: invalid (assessment_input_invalid)
//
// The user did nothing wrong. `init` does not create the competency question
// block, and in the code **absent** and **broken** collapsed to the same value
// (`malformed`) — so a newborn vault reports itself as faulty.
//
// This is the mirror image of 2026-08-17 (19). There, "nothing at all" was called
// "healthy"; here, "not done yet" is called "wrong". Both name **work not yet
// done** as something else.
//
// What needs fixing is not the verdict but **the name and the remedy**: if it was
// not written, say so, and say what to do about it.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MEANING_COMPETENCY_CONTRACT,
  MEANING_COMPETENCY_EVALUATOR,
  MEANING_WITNESS_INVENTORY_CONTRACT,
  deriveMeaningAssessment,
} from './meaning-assessment.mjs';

const GRAPH_HASH = 'project-graph-v1:a1b2c3d4';

const baseInput = (competency) => ({
  projectSlug: 'project',
  graphHash: GRAPH_HASH,
  structure: { status: 'ready' },
  source: { status: 'not_measured', currentness: 'unavailable', topGapId: 'source_unbound' },
  competency,
});

test('says not authored when the capability block is absent', () => {
  const assessment = deriveMeaningAssessment(baseInput(null));
  assert.equal(
    assessment.topGap.id,
    'competency_not_authored',
    'calling an absence `assessment_input_invalid` makes the user think they broke something',
  );
  assert.equal(assessment.topGap.dimension, 'competency');
});

test('also says what to do, since a diagnosis without a remedy is no diagnosis', () => {
  const assessment = deriveMeaningAssessment(baseInput(null));
  assert.equal(assessment.nextAction.id, 'author_competency_answers');
});

test('a block that is present but wrong is still invalid input', () => {
  // Collapsing this back together undoes the fix — genuinely broken input must still be called that.
  const assessment = deriveMeaningAssessment(
    baseInput({
      contract: 'wrong-contract',
      receiptVersion: 1,
      evaluator: MEANING_COMPETENCY_EVALUATOR,
      graphHash: GRAPH_HASH,
      inventory: { contract: MEANING_WITNESS_INVENTORY_CONTRACT, graphHash: GRAPH_HASH, concepts: [], relations: [], evidence: [] },
      questions: [],
    }),
  );
  assert.equal(assessment.topGap.id, 'assessment_input_invalid');
});

test('names another error first, so a missing capability does not hide other defects', () => {
  // The project slug itself is wrong. That is a problem that precedes "not written".
  const assessment = deriveMeaningAssessment({ ...baseInput(null), projectSlug: '' });
  assert.equal(assessment.topGap.id, 'assessment_input_invalid');
});

test('a well-formed capability does not take this branch, since always saying not authored is no check', () => {
  const assessment = deriveMeaningAssessment(
    baseInput({
      contract: MEANING_COMPETENCY_CONTRACT,
      receiptVersion: 1,
      evaluator: MEANING_COMPETENCY_EVALUATOR,
      graphHash: GRAPH_HASH,
      inventory: {
        contract: MEANING_WITNESS_INVENTORY_CONTRACT,
        graphHash: GRAPH_HASH,
        concepts: [],
        relations: [],
        evidence: [],
      },
      questions: [],
    }),
  );
  assert.notEqual(assessment.topGap.id, 'competency_not_authored');
});
