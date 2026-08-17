// 「아직 안 적었다」와 「망가졌다」는 다른 말이다.
//
// ## 왜 (2026-08-17 실측)
//
// 볼트를 **방금 만들고** 바로 검사하면 이렇게 나왔다:
//
//   vault health  needs_attention
//     ⚠ meaning_assessment  1 project meaning assessment(s) require review;
//                           first project: invalid (assessment_input_invalid)
//
// 사용자는 아무 잘못도 안 했다. `init` 이 역량 질문 블록을 안 만들어 두고,
// 그 블록이 **없는 것**과 **망가진 것**이 코드 안에서 같은 값(`malformed`)이
// 되기 때문이다. 그래서 갓 태어난 볼트가 자기가 고장 났다고 말한다.
//
// 이건 2026-08-17 (19) 의 반대 모양이다. 그때는 아무것도 없는 것을 「정상」
// 이라 했고, 여기서는 아직 안 한 것을 「잘못됐다」고 한다. 둘 다 **아직 하지
// 않은 일**을 다른 무엇으로 부른 것이다.
//
// 고칠 것은 판정이 아니라 **이름과 처방**이다: 안 적었으면 안 적었다고 하고,
// 무엇을 하면 되는지 같이 준다.

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
  // 이걸 같이 뭉개면 고친 의미가 없다 — 진짜 깨진 입력은 그렇게 불러야 한다.
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
  // 프로젝트 슬러그 자체가 틀렸다. 그건 「안 적었다」보다 앞선 문제다.
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
