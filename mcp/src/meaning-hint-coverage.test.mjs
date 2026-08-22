// **Every** remedy id must carry a sentence the reader can act on.
//
// Why (2026-08-17, a hole of my own making): 2026-08-17 (23) fixed "gives a
// diagnosis but no remedy" — and put **only the states I had seen** into the
// table. One rung up, this came out:
//
//   … needs_evidence (competency_question_incomplete).
//   Next: resolve_competency_question.
//
// An id again. And it leaked the other way too: the table held
// `repair_source_receipt`, an id that **does not exist** (I invented it). A dead
// row is never caught and pretends to be alive.
//
// > **A table filled in only from the cases you happened to hit is a table with holes.**
//
// So the pairing is machine-checked: every remedy the source can emit has a
// sentence, and every sentence names a remedy that exists.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The modules that produce remedies.
 *
 * Two files **each declare the same list** (`ACTION_IDS`, `SOURCE_ACTION_IDS`) and
 * the evaluator emits its own on the fly, so reading one place misses some. Scan
 * all of them and take the union.
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
    // A declared list is authoritative too — since 2026-08-17 it is declared in
    // one place only (`project-source-vocabulary.mjs`).
    for (const block of text.matchAll(/ACTION_IDS = Object\.freeze\(\s*new Set\(\[([^\]]*)\]|(?:SOURCE_)?ACTION_IDS = new Set\(\[([^\]]*)\]/g)) {
      for (const m of (block[1] ?? block[2] ?? '').matchAll(/'([a-z_]+)'/g)) found.add(m[1]);
    }
  }
  return found;
}

/** The keys written in the table. Read as text rather than by running `index.js` (the server must not start). */
function hintKeys() {
  const text = readFileSync(join(HERE, 'index.js'), 'utf8');
  const start = text.indexOf('const MEANING_NEXT_ACTION_HINTS = Object.freeze({');
  assert.ok(start > 0, '표를 못 찾았다 — 이 검사는 아무것도 못 잰다');
  const end = text.indexOf('});', start);
  const block = text.slice(start, end);
  return new Set([...block.matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1]));
}

/**
 * The ones that are not remedies — `{ id: … }` in these files also marks a **gap**
 * (what is wrong). A gap needs no sentence: the message already states its name.
 */
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
  // Gaps on the source side — "what is wrong", not "what to do".
  'source_role_evidence_missing',
  'source_inventory_truncated',
  'declared_source_path_missing',
]);

test('검사가 헛돌고 있지 않다 — 실제로 처방을 긁고 있다', () => {
  const ids = remedyIdsInSource();
  assert.ok(ids.size >= 15, `소스에서 id 를 ${ids.size}개만 찾았다 — 스캔이 죽었다`);
  assert.ok(ids.has('author_competency_answers'));
  assert.ok(ids.has('resolve_competency_question'));
});

test('소스가 낼 수 있는 처방에는 전부 할 수 있는 말이 있다', () => {
  const keys = hintKeys();
  const remedies = [...remedyIdsInSource()].filter((id) => !GAP_IDS.has(id));
  const missing = remedies.filter((id) => !keys.has(id));
  assert.deepEqual(
    missing,
    [],
    `이 처방들이 화면에 id 그대로 나간다: ${missing.join(', ')}. `
      + '표(MEANING_NEXT_ACTION_HINTS)에 사람이 읽을 문장을 더해라.',
  );
});

test('표에 실재하지 않는 처방이 없다 — 죽은 칸은 안 걸리고 살아 있는 척한다', () => {
  const ids = remedyIdsInSource();
  const dead = [...hintKeys()].filter((k) => !ids.has(k));
  assert.deepEqual(
    dead,
    [],
    `이 열쇠는 소스 어디에서도 안 나온다(오타이거나 지어낸 것): ${dead.join(', ')}`,
  );
});

test('문장이 실제로 뭔가를 말한다 — 짧은 껍데기는 id 와 다를 바 없다', () => {
  const text = readFileSync(join(HERE, 'index.js'), 'utf8');
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
  assert.ok(keyAt.length >= 10, '잰 항목이 너무 적다 — 이 검사는 아무것도 못 잰다');
  for (let n = 0; n < keyAt.length; n += 1) {
    const from = keyAt[n];
    const to = n + 1 < keyAt.length ? keyAt[n + 1] : lines.length;
    const key = /^ {2}([a-z_]+):/.exec(lines[from])[1];
    const value = lines.slice(from, to).join(' ').slice(key.length + 3);
    // A comment line is not a value.
    const prose = value.replace(/\/\/[^\n]*/g, '').replace(/[^A-Za-z0-9 .,`'()/-]/g, ' ');
    assert.ok(
      prose.trim().length > 40,
      `${key} 의 문장이 너무 짧다(${prose.trim().length}자) — 무엇을 하면 되는지 말하지 못한다`,
    );
  }
});
