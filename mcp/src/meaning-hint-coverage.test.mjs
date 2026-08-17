// 처방 id 에는 **빠짐없이** 할 수 있는 말이 붙어 있어야 한다.
//
// ## 왜 (2026-08-17, 내가 만든 구멍)
//
// 2026-08-17 (23) 에서 「진단만 주고 처방을 안 준다」를 고쳤는데, **그때 내가
// 본 상태만** 표에 넣었다. 한 칸 더 올라가자마자 이렇게 나왔다:
//
//   … needs_evidence (competency_question_incomplete).
//   Next: resolve_competency_question.
//
// 다시 id 다. 그리고 반대 방향으로도 새고 있었다 — 표에 `repair_source_receipt`
// 라는 **존재하지 않는 id** 가 들어 있었다(내가 지어낸 것). 죽은 칸은 안 걸리고
// 살아 있는 척한다.
//
// > **자기가 마주친 경우만 채운 표는 구멍이 있는 표다.**
//
// 그래서 짝을 기계가 맞춘다: 소스가 낼 수 있는 처방 전부에 문장이 있고,
// 문장 전부가 실재하는 처방을 가리킨다.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * 처방을 만들어 내는 모듈들.
 *
 * 두 파일이 **같은 목록을 각각 선언**하고 있고(`ACTION_IDS` ·
 * `SOURCE_ACTION_IDS`), 평가기는 그것과 별개로 즉석에서 낸다. 그래서 한 곳만
 * 읽으면 못 본다 — 전부 훑고 합집합을 쓴다.
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

/** 소스에서 「이 처방을 낸다」고 적힌 자리를 전부 긁는다. */
function remedyIdsInSource() {
  const found = new Set();
  for (const file of REMEDY_SOURCES) {
    const text = readFileSync(join(HERE, file), 'utf8');
    // `{ id: 'x' }` · `{ id: 'x', target: … }` — 뒤에 무엇이 오든 받는다.
    for (const m of text.matchAll(/\{\s*id:\s*['"]([a-z_]+)['"]\s*[,}]/g)) found.add(m[1]);
    // 삼항으로 갈리는 자리: `{ id: cond ? 'a' : 'b' }`
    for (const m of text.matchAll(/\{\s*id:\s*[^}]*\?\s*['"]([a-z_]+)['"]\s*:\s*['"]([a-z_]+)['"]/g)) {
      found.add(m[1]);
      found.add(m[2]);
    }
    // 선언된 목록도 정본이다 — 2026-08-17 부터 한 곳
    // (`project-source-vocabulary.mjs`)에서만 선언한다.
    for (const block of text.matchAll(/ACTION_IDS = Object\.freeze\(\s*new Set\(\[([^\]]*)\]|(?:SOURCE_)?ACTION_IDS = new Set\(\[([^\]]*)\]/g)) {
      for (const m of (block[1] ?? block[2] ?? '').matchAll(/'([a-z_]+)'/g)) found.add(m[1]);
    }
  }
  return found;
}

/** 표에 적힌 열쇠들. `index.js` 를 실행하지 않고 글자로 읽는다(서버가 뜨면 안 된다). */
function hintKeys() {
  const text = readFileSync(join(HERE, 'index.js'), 'utf8');
  const start = text.indexOf('const MEANING_NEXT_ACTION_HINTS = Object.freeze({');
  assert.ok(start > 0, '표를 못 찾았다 — 이 검사는 아무것도 못 잰다');
  const end = text.indexOf('});', start);
  const block = text.slice(start, end);
  return new Set([...block.matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1]));
}

/**
 * 처방이 아닌 것들 — 이 파일들의 `{ id: … }` 는 **간극**(무엇이 잘못됐나)에도
 * 쓰인다. 간극에는 문장이 필요 없다(메시지가 이미 그 이름을 그대로 적는다).
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
  // 소스 쪽 간극들 — 「무엇이 잘못됐나」이지 「무엇을 하라」가 아니다.
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
  // ⚠️ 첫 따옴표 덩어리만 재면 안 된다 — 값은 여러 줄로 이어 붙고, 게다가
  // 이스케이프된 따옴표(`project\'s`)에서 잘린다. 실제로 그렇게 재서 멀쩡한
  // 문장을 「너무 짧다」로 잡았다. **열쇠에서 다음 열쇠까지**를 통째로 본다.
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
    // 주석 줄은 값이 아니다.
    const prose = value.replace(/\/\/[^\n]*/g, '').replace(/[^A-Za-z0-9 .,`'()/-]/g, ' ');
    assert.ok(
      prose.trim().length > 40,
      `${key} 의 문장이 너무 짧다(${prose.trim().length}자) — 무엇을 하면 되는지 말하지 못한다`,
    );
  }
});
