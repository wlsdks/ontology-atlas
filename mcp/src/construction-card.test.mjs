import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  CONSTRUCTION_CARD_EN,
  CONSTRUCTION_CARD_MAX_CHARS,
  CONSTRUCTION_GUIDE_TOPICS,
} from './construction-card.mjs';
import { CONSTRUCTION_RULES_EN } from './construction-rules.mjs';

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

test.after(() => {
  rmSync(scratch, { recursive: true, force: true });
});
