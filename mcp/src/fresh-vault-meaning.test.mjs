// 갓 만든 볼트는 자기가 고장 났다고 말하지 않는다.
//
// ## 왜 (2026-08-17 실측)
//
// `init` 한 직후 `health` 를 돌리면 이랬다:
//
//   ⚠ meaning_assessment  … first project: invalid (assessment_input_invalid)
//
// 사용자는 아무것도 안 했는데 도구가 「입력이 잘못됐다」고 말한다. 원인은
// 「아직 확정 안 함」과 「망가짐」이 같은 갈래를 탔던 것이다
// (`readProjectMeaningAssessment` 의 영수증 부재 분기가 `invalidAssessment`
// 로 갔다).
//
// 이 시험은 **첫인상**을 잠근다. 앞의 두 검사(`meaning-not-authored`)가
// 평가기 자체를 보고, 여기서는 그 평가기까지 가는 길이 안 끊겼는지 본다 —
// 실제로 끊겨 있었고, 평가기만 고쳤을 때는 화면이 그대로였다.

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { readProjectMeaningAssessment } from './project-meaning-receipt.mjs';

function freshVault() {
  const root = mkdtempSync(join(tmpdir(), 'fresh-vault-meaning-'));
  mkdirSync(join(root, '.ontology-atlas'), { recursive: true });
  writeFileSync(
    join(root, 'project.md'),
    '---\nuid: 11111111-1111-4111-8111-111111111111\nslug: project\nkind: project\ntitle: Project\n---\n\n# Project\n',
    'utf-8',
  );
  return root;
}

const input = (root) => ({
  vaultRoot: root,
  projectSlug: 'project',
  projectBody: '# Project\n',
  graphHash: 'project-graph-v1:a1b2c3d4',
  structure: { status: 'ready' },
  source: { status: 'not_measured', currentness: 'unavailable', topGapId: 'source_unbound' },
  inventory: null,
});

test('영수증이 없는 볼트를 「입력이 잘못됐다」고 부르지 않는다', () => {
  const assessment = readProjectMeaningAssessment(input(freshVault()));
  assert.notEqual(
    assessment.topGap.id,
    'assessment_input_invalid',
    '갓 만든 볼트가 자기가 고장 났다고 말한다 — 사용자는 아무것도 안 했다',
  );
  assert.equal(assessment.topGap.id, 'competency_not_authored');
});

test('무엇을 하면 되는지 같이 준다', () => {
  const assessment = readProjectMeaningAssessment(input(freshVault()));
  assert.equal(assessment.nextAction.id, 'author_competency_answers');
});

test('볼트 경로 자체가 없는 것은 여전히 「입력이 잘못됐다」다', () => {
  // 이걸 같이 뭉개면 고친 의미가 없다 — 진짜 잘못된 입력은 그렇게 불러야 한다.
  const assessment = readProjectMeaningAssessment({ ...input(freshVault()), vaultRoot: '' });
  assert.equal(assessment.topGap.id, 'assessment_input_invalid');
});
