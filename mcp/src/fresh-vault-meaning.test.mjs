// A freshly created vault does not report itself as faulty.
//
// Why (measured 2026-08-17): running `health` right after `init` gave:
//
//   ⚠ meaning_assessment  … first project: invalid (assessment_input_invalid)
//
// The user had done nothing, and the tool said "the input is wrong". The cause was
// "not finalised yet" and "broken" taking the same branch (the missing-receipt
// branch of `readProjectMeaningAssessment` fell through to `invalidAssessment`).
//
// This test locks the **first impression**. The two checks before it
// (`meaning-not-authored`) cover the evaluator itself; this one covers whether the
// path *to* that evaluator is intact — it was broken, and fixing only the evaluator
// left the screen unchanged.

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
  // Collapsing this back together undoes the fix — genuinely wrong input must still be called that.
  const assessment = readProjectMeaningAssessment({ ...input(freshVault()), vaultRoot: '' });
  assert.equal(assessment.topGap.id, 'assessment_input_invalid');
});
