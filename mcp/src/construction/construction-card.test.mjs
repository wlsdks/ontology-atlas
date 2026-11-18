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
  CONSTRUCTION_GUIDE_EN,
  CONSTRUCTION_GUIDE_MAX_CHARS,
  CONSTRUCTION_GUIDE_TOPICS,
} from './construction-card.mjs';
import { parseProjectCompetencyMarkdown } from '../project-meaning/project-meaning-receipt.mjs';

/** `read.mjs` resolves the vault root at import time and exits on a non-vault, so the root is set first. */
const scratch = mkdtempSync(join(tmpdir(), 'ontology-atlas-card-'));
process.env.OATLAS_VAULT = scratch;
const { connectionInfoTool } = await import('../tools/read.mjs');

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

test('connection_info({guide:"construction"}) returns the construction guide within its budget', () => {
  const info = connectionInfoTool({ guide: 'construction' });
  assert.equal(info.guideText, CONSTRUCTION_GUIDE_EN);
  assert.equal(info.guide.card, CONSTRUCTION_CARD_EN);
  assert.ok(
    CONSTRUCTION_GUIDE_EN.length <= CONSTRUCTION_GUIDE_MAX_CHARS,
    `guide is ${CONSTRUCTION_GUIDE_EN.length} characters, budget is ${CONSTRUCTION_GUIDE_MAX_CHARS}`,
  );
});

test('every advertised topic resolves to real text, and nothing else does', () => {
  for (const topic of CONSTRUCTION_GUIDE_TOPICS) {
    const { guideText } = connectionInfoTool({ guide: topic });
    assert.equal(typeof guideText, 'string', `${topic} must resolve to text`);
    assert.ok(guideText.length > 200, `${topic} returned ${guideText.length} characters`);
  }
  assert.throws(() => connectionInfoTool({ guide: 'no_such_topic' }), /must be one of/);
});

/** Without it a builder wrote a whole vault flat at the root. */
test('the card states where a slug lives', () => {
  for (const clause of ['domains/', 'capabilities/', 'elements/', 'never a code path']) {
    assert.ok(CONSTRUCTION_CARD_EN.includes(clause), `card must say ${clause}`);
  }
});

/**
 * An enumeration of body parts is read as complete, so leaving `## Uncertainty`
 * out made builders omit it and nodes claim a completeness nobody measured.
 */
test('the card says where an unknown goes', () => {
  const body = CONSTRUCTION_CARD_EN.split('\n').find((line) => line.includes('Body, at most 150 words'));
  assert.ok(body?.includes('`## Uncertainty`'), 'the body enumeration must name Uncertainty');
  assert.ok(body?.includes('Unread code is never an Excludes bullet'));
});

/**
 * The build is written in one run (decision 0f78a22b): no text tells an agent
 * to hold writes for a reply, and none sends it to the bulk qualification route
 * that an app session cannot finish.
 */
test('no card or guide text asks the agent to wait or names the qualification route', () => {
  const texts = [['card', CONSTRUCTION_CARD_EN]];
  for (const topic of CONSTRUCTION_GUIDE_TOPICS) {
    texts.push([topic, connectionInfoTool({ guide: topic }).guideText]);
  }
  for (const [name, text] of texts) {
    assert.doesNotMatch(text, /qualification|writePlan|independent evaluator|you propose|after (?:approval|I say yes)/i, name);
  }
});

test('the competency guide returns the layout and an example the real parser accepts', () => {
  const { guideText } = connectionInfoTool({ guide: 'competency' });
  assert.equal(guideText, COMPETENCY_ANSWERS_GUIDE_EN);
  assert.ok(guideText.includes('## Competency answers'));

  // The example callers copy is fed through the parser finalize_project_meaning
  // runs: prose can be wrong quietly, a parsed example cannot.
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

  // The refusal in `tools/project-source.mjs` must import this sentence, or the
  // refusal and the guide describe two layouts.
  const toolSource = readFileSync(
    fileURLToPath(new URL('../tools/project-source.mjs', import.meta.url)),
    'utf8',
  );
  assert.ok(toolSource.includes('COMPETENCY_SECTION_HINT_EN'));
  assert.equal(toolSource.includes('holding five `### <id>'), false);
});

test.after(() => {
  rmSync(scratch, { recursive: true, force: true });
});
