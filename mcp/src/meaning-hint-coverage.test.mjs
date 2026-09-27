// Every remedy id the source can emit has a sentence a reader can act on, and
// every sentence names a remedy that exists: a table filled from the cases one
// happened to see has holes, and a dead row passes while pretending to be live.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));
/** The hint table every emitted remedy needs a sentence in. */
const HINT_TABLE_FILE = join(HERE, 'tools', 'graph.mjs');

/**
 * The modules that produce remedies: two import one action list (named
 * ACTION_IDS and SOURCE_ACTION_IDS there) and the evaluator emits its own, so
 * the union is scanned.
 */
const REMEDY_SOURCES = [
  'meaning-assessment.mjs',
  'project-meaning-receipt.mjs',
  'project-meaning-inventory.mjs',
  'project-source-receipt.mjs',
  'project-source-remedy.mjs',
  'project-source-vocabulary.mjs',
  'project-source-mint.mjs',
];

/** Scrapes every place in the source that says "emit this remedy". */
function remedyIdsInSource() {
  const found = new Set();
  for (const file of REMEDY_SOURCES) {
    const text = readFileSync(join(HERE, file), 'utf8');
    // `{ id: 'x' }` and `{ id: 'x', target: … }` — accept whatever follows.
    for (const m of text.matchAll(/\{\s*id:\s*['"]([a-z_]+)['"]\s*[,}]/g)) found.add(m[1]);
    // Ternary branches: `{ id: cond ? 'a' : 'b' }`
    for (const m of text.matchAll(/\{\s*id:\s*[^}]*\?\s*['"]([a-z_]+)['"]\s*:\s*['"]([a-z_]+)['"]/g)) {
      found.add(m[1]);
      found.add(m[2]);
    }
    // A declared list is authoritative too (`project-source-vocabulary.mjs`).
    for (const block of text.matchAll(/ACTION_IDS = Object\.freeze\(\s*new Set\(\[([^\]]*)\]|(?:SOURCE_)?ACTION_IDS = new Set\(\[([^\]]*)\]/g)) {
      for (const m of (block[1] ?? block[2] ?? '').matchAll(/'([a-z_]+)'/g)) found.add(m[1]);
    }
  }
  return found;
}

/** The keys written in the table. Read as text rather than by running the module (the server must not start). */
function hintKeys() {
  const text = readFileSync(HINT_TABLE_FILE, 'utf8');
  const start = text.indexOf('const MEANING_NEXT_ACTION_HINTS = Object.freeze({');
  assert.ok(start > 0, 'table not found, so this check measures nothing');
  const end = text.indexOf('});', start);
  const block = text.slice(start, end);
  return new Set([...block.matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1]));
}

/** Gap ids ("what is wrong") share the `{ id: … }` shape but need no sentence. */
const GAP_IDS = new Set([
  'assessment_input_invalid',
  'competency_not_authored',
  'competency_ontology_changed',
  'competency_question_incomplete',
  'competency_source_changed',
  'multiple_active_sources',
  'ontology_changed',
  'receipt_malformed',
  'source_changed',
  'source_currentness_unavailable',
  'source_unbound',
  'structure_not_ready',
  'abilities',
  'domains',
  'evidence',
  'impact',
  'scope',
  'source_role_evidence_missing',
  'source_inventory_truncated',
  'declared_source_path_missing',
]);

test('the scan is not idle: it really collects the remedies', () => {
  const ids = remedyIdsInSource();
  assert.ok(ids.size >= 15, `found only ${ids.size} ids in the source, so the scan is dead`);
  assert.ok(ids.has('author_competency_answers'));
  assert.ok(ids.has('resolve_competency_question'));
});

test('every remedy the source can emit has a sentence', () => {
  const keys = hintKeys();
  const remedies = [...remedyIdsInSource()].filter((id) => !GAP_IDS.has(id));
  const missing = remedies.filter((id) => !keys.has(id));
  assert.deepEqual(
    missing,
    [],
    `these remedies would reach the screen as bare ids: ${missing.join(', ')}. `
      + 'Add a sentence a person can read to MEANING_NEXT_ACTION_HINTS.',
  );
});

test('the table has no remedy the source never emits, since a dead row passes while pretending to be live', () => {
  const ids = remedyIdsInSource();
  const dead = [...hintKeys()].filter((k) => !ids.has(k));
  assert.deepEqual(
    dead,
    [],
    `no source emits these keys (a typo or invented): ${dead.join(', ')}`,
  );
});

test('each sentence says something, since a short shell is no better than the id', () => {
  const text = readFileSync(HINT_TABLE_FILE, 'utf8');
  const start = text.indexOf('const MEANING_NEXT_ACTION_HINTS = Object.freeze({');
  const block = text.slice(start, text.indexOf('});', start));
  // ⚠️ Do not measure only the first quoted chunk — values are joined across
  // several lines, and it also cuts at an escaped quote (`project\'s`). Measuring
  // that way flagged a perfectly good sentence as "too short". Take **the whole
  // span from one key to the next**.
  const lines = block.split('\n');
  const keyAt = lines
    .map((line, i) => (/^ {2}[a-z_]+:/.test(line) ? i : -1))
    .filter((i) => i >= 0);
  assert.ok(keyAt.length >= 10, 'too few entries measured, so this check measures nothing');
  for (let n = 0; n < keyAt.length; n += 1) {
    const from = keyAt[n];
    const to = n + 1 < keyAt.length ? keyAt[n + 1] : lines.length;
    const key = /^ {2}([a-z_]+):/.exec(lines[from])[1];
    const value = lines.slice(from, to).join(' ').slice(key.length + 3);
    const prose = value.replace(/\/\/[^\n]*/g, '').replace(/[^A-Za-z0-9 .,`'()/-]/g, ' ');
    assert.ok(
      prose.trim().length > 40,
      `the sentence for ${key} is too short (${prose.trim().length} chars) to say what to do`,
    );
  }
});
