import assert from 'node:assert/strict';
import test from 'node:test';

import { renderCompetencyAnswers, withCompetencySection } from './competency-answers.mjs';
import { parseProjectCompetencyMarkdown } from './project-meaning-receipt.mjs';

const ANSWERS = ['scope', 'domains', 'abilities', 'evidence', 'impact'].map((id) => ({
  id, status: 'partial', answer: `The ${id} answer.`, gap: 'Not read yet.',
}));

test('answers in any order render the five rows in the fixed order the parser accepts', () => {
  const parsed = parseProjectCompetencyMarkdown(renderCompetencyAnswers([...ANSWERS].reverse()));
  assert.deepEqual(parsed.questions.map((row) => row.id), ['scope', 'domains', 'abilities', 'evidence', 'impact']);
});

test('a body keeps its other sections when its competency section is replaced', () => {
  const section = renderCompetencyAnswers(ANSWERS);
  const body = 'Intro.\n\n## Competency answers\n\n### scope: draft\n\n## Uncertainty\n- Unread.\n\n## Competency answers\n\nduplicate\n';
  const next = withCompetencySection(body, section);
  assert.equal(next, `Intro.\n\n${section}\n## Uncertainty\n- Unread.\n\n`);
  assert.equal(parseProjectCompetencyMarkdown(next).questions.length, 5);
});

test('a body without a section gets it appended after a blank line', () => {
  const section = renderCompetencyAnswers(ANSWERS);
  assert.equal(withCompetencySection('Intro.\n', section), `Intro.\n\n${section}`);
});
