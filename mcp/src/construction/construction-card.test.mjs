import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  COMPETENCY_ANSWERS_GUIDE_EN,
  COMPETENCY_ANSWERS_HINT_EN,
  CONSTRUCTION_CARD_EN,
  CONSTRUCTION_CARD_MAX_CHARS,
  CONSTRUCTION_GUIDE_EN,
  CONSTRUCTION_GUIDE_MAX_CHARS,
  CONSTRUCTION_GUIDE_TOPICS,
} from './construction-card.mjs';
import { renderCompetencyAnswers } from '../project-meaning/competency-answers.mjs';
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
  const connectionInfo = connectionInfoTool({});
  assert.equal(connectionInfo.guide.card, CONSTRUCTION_CARD_EN);
  assert.deepEqual(connectionInfo.guide.topics, [...CONSTRUCTION_GUIDE_TOPICS]);
  assert.equal('guideText' in connectionInfo, false);
});

test('connection_info({guide:"construction"}) returns the construction guide within its budget', () => {
  const connectionInfo = connectionInfoTool({ guide: 'construction' });
  assert.equal(connectionInfo.guideText, CONSTRUCTION_GUIDE_EN);
  assert.equal(connectionInfo.guide.card, CONSTRUCTION_CARD_EN);
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
  assert.ok(body?.includes('Unread code, and what unread members do, is Uncertainty, never Excludes'));
  assert.ok(body?.includes('A family sentence says "2 of at least 16 read" or speaks only for the one read; "every" needs all read.'), 'the scope rule sits where the body is written');
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

test('the competency guide returns an example call the real renderer and parser accept', () => {
  const { guideText } = connectionInfoTool({ guide: 'competency' });
  assert.equal(guideText, COMPETENCY_ANSWERS_GUIDE_EN);

  // The example callers copy is rendered and parsed as finalize_project_meaning does:
  // prose can be wrong quietly, a parsed example cannot.
  const example = /```json\n([\s\S]*?)\n```/.exec(guideText);
  assert.ok(example, 'the guide must carry one fenced example call');
  const { answers } = JSON.parse(example[1]);
  const parsed = parseProjectCompetencyMarkdown(renderCompetencyAnswers(answers));
  assert.deepEqual(
    parsed.questions.map((row) => row.id),
    ['scope', 'domains', 'abilities', 'evidence', 'impact'],
  );
  assert.ok(parsed.questions.some((row) => row.status === 'answered'));
  assert.ok(parsed.questions.some((row) => row.gap));
});

test('the finalize refusal for a missing section names the answers repair, not a guide', () => {
  for (const clause of ['`answers`', 'scope, domains, abilities, evidence and impact', 'gap']) {
    assert.ok(COMPETENCY_ANSWERS_HINT_EN.includes(clause), `hint must say ${clause}`);
  }
  assert.doesNotMatch(COMPETENCY_ANSWERS_HINT_EN, /connection_info|guide/);
});

test.after(() => {
  rmSync(scratch, { recursive: true, force: true });
});

test('the scope rule is said where each write is made', async () => {
  const { ADD_CONCEPTS_TOOL, PATCH_CONCEPT_TOOL } = await import('../server/tool-definitions/write-concepts.mjs');
  const { FAMILY_SCOPE_RULE_EN } = await import('./construction-rules.mjs');
  for (const tool of [ADD_CONCEPTS_TOOL, PATCH_CONCEPT_TOOL]) assert.ok(tool.description.includes(FAMILY_SCOPE_RULE_EN), tool.name);
  assert.match(FAMILY_SCOPE_RULE_EN, /"2 of at least 16 read"/);
  assert.match(FAMILY_SCOPE_RULE_EN, /unless every member was read/, 'an over-claim stays wrong under a floor');
});
