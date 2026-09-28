// "Not written yet" and "broken" are different statements: a fresh `init` vault
// has no competency block, and must say what to do rather than call itself invalid.

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
  // Genuinely broken input must still be called broken.
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
  // A wrong project slug precedes "not written".
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
