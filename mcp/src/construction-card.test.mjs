import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { fileURLToPath } from 'node:url';

import {
  COMPETENCY_ANSWERS_GUIDE_EN,
  COMPETENCY_SECTION_HINT_EN,
  CONSTRUCTION_CARD_EN,
  CONSTRUCTION_CARD_MAX_CHARS,
  CONSTRUCTION_GUIDE_TOPICS,
} from './construction-card.mjs';
import { CONSTRUCTION_RULES_EN } from './construction-rules.mjs';
import { parseProjectCompetencyMarkdown } from './project-meaning-receipt.mjs';

/**
 * `read.mjs` resolves the vault root at import time and exits the process when
 * the directory is not a vault, so the root is chosen before the import.
 */
const scratch = mkdtempSync(join(tmpdir(), 'ontology-atlas-card-'));
process.env.OATLAS_VAULT = scratch;
const { connectionInfoTool } = await import('./tools/read.mjs');

test('the card fits the window a truncating host leaves', () => {
  assert.ok(
    CONSTRUCTION_CARD_EN.length <= CONSTRUCTION_CARD_MAX_CHARS,
    `card is ${CONSTRUCTION_CARD_EN.length} characters, budget is ${CONSTRUCTION_CARD_MAX_CHARS}`,
  );
});

test('connection_info carries the card and the topic list without being asked', () => {
  const info = connectionInfoTool({});
  assert.equal(info.guide.card, CONSTRUCTION_CARD_EN);
  assert.deepEqual(info.guide.topics, [...CONSTRUCTION_GUIDE_TOPICS]);
  assert.equal('guideText' in info, false);
});

test('connection_info({guide}) returns the same constant the instructions interpolate', () => {
  const info = connectionInfoTool({ guide: 'construction' });
  assert.equal(info.guideText, CONSTRUCTION_RULES_EN);
  assert.equal(info.guide.card, CONSTRUCTION_CARD_EN);
});

test('every advertised topic resolves to real text, and nothing else does', () => {
  for (const topic of CONSTRUCTION_GUIDE_TOPICS) {
    const { guideText } = connectionInfoTool({ guide: topic });
    assert.equal(typeof guideText, 'string', `${topic} must resolve to text`);
    assert.ok(guideText.length > 200, `${topic} returned ${guideText.length} characters`);
  }
  assert.throws(() => connectionInfoTool({ guide: 'no_such_topic' }), /must be one of/);
});

/**
 * Slug shape was the one thing the card never said, and a trial builder wrote a
 * whole vault flat at the root because of it (`slug: option-declaration` instead
 * of `capabilities/option-declaration`).
 */
test('the card states where a slug lives', () => {
  for (const clause of ['domains/', 'capabilities/', 'elements/', 'never a code path']) {
    assert.ok(CONSTRUCTION_CARD_EN.includes(clause), `card must say ${clause}`);
  }
});

/**
 * The first version of clause 3 enumerated the body parts a node owes and left
 * `## Uncertainty` out. A trial then built 12 nodes and not one stated an
 * unknown, where every node had before: an enumeration is read as complete, so
 * a silent omission is read as "not required" and the vault quietly starts
 * claiming completeness it never measured.
 */
test('the card says where an unknown goes', () => {
  assert.ok(CONSTRUCTION_CARD_EN.includes('`## Uncertainty`'));
  assert.ok(CONSTRUCTION_CARD_EN.includes('claims completeness'));
});

test('the competency guide returns the layout and an example the real parser accepts', () => {
  const { guideText } = connectionInfoTool({ guide: 'competency' });
  assert.equal(guideText, COMPETENCY_ANSWERS_GUIDE_EN);
  assert.ok(guideText.includes('## Competency answers'));

  // The example is the part a caller copies, so it is fed back through the
  // parser that `finalize_project_meaning` actually runs. Prose can be wrong
  // quietly; a parsed example cannot.
  const example = /```markdown\n([\s\S]*?)\n```/.exec(guideText);
  assert.ok(example, 'the guide must carry one fenced example');
  const parsed = parseProjectCompetencyMarkdown(example[1]);
  assert.deepEqual(
    parsed.questions.map((row) => row.id),
    ['scope', 'domains', 'abilities', 'evidence', 'impact'],
  );
  assert.deepEqual(
    parsed.questions.map((row) => row.status),
    ['answered', 'answered', 'answered', 'answered', 'visible-gap'],
  );
  assert.equal(parsed.questions.at(-1).gap.length > 0, true);
});

test('the finalize refusal names the layout and the guide that carries it', () => {
  for (const clause of [
    '## Competency answers',
    '### <id>: answered|partial|visible-gap',
    'scope, domains, abilities, evidence, impact',
    '- Concepts:',
    '- Gap:',
    'connection_info**({guide:"competency"})',
  ]) {
    assert.ok(COMPETENCY_SECTION_HINT_EN.includes(clause), `hint must say ${clause}`);
  }

  // Derived, not copied: the refusal in `tools/project-source.mjs` must import
  // this sentence, or the refusal and the guide start describing two layouts.
  const toolSource = readFileSync(
    fileURLToPath(new URL('./tools/project-source.mjs', import.meta.url)),
    'utf8',
  );
  assert.ok(toolSource.includes('COMPETENCY_SECTION_HINT_EN'));
  assert.equal(toolSource.includes('holding five `### <id>'), false);
});

test.after(() => {
  rmSync(scratch, { recursive: true, force: true });
});
