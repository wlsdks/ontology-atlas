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

test('역량 블록이 아예 없으면 「안 적었다」고 말한다', () => {
  const assessment = deriveMeaningAssessment(baseInput(null));
  assert.equal(
    assessment.topGap.id,
    'competency_not_authored',
    '없는 것을 `assessment_input_invalid` 로 부르면 사용자는 자기가 뭘 깨뜨린 줄 안다',
  );
  assert.equal(assessment.topGap.dimension, 'competency');
});

test('그리고 무엇을 하면 되는지 같이 준다 — 처방 없는 진단은 진단이 아니다', () => {
  const assessment = deriveMeaningAssessment(baseInput(null));
  assert.equal(assessment.nextAction.id, 'author_competency_answers');
});

test('블록이 **있는데 틀린** 것은 여전히 「입력이 잘못됐다」다', () => {
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

test('다른 것이 틀렸으면 그것을 먼저 말한다 — 역량 부재가 다른 결함을 가리지 않는다', () => {
  // The project slug itself is wrong. That is a problem that precedes "not written".
  const assessment = deriveMeaningAssessment({ ...baseInput(null), projectSlug: '' });
  assert.equal(assessment.topGap.id, 'assessment_input_invalid');
});

test('제대로 적힌 역량은 이 갈래를 안 탄다 — 늘 「안 적었다」면 그것도 검사가 아니다', () => {
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
