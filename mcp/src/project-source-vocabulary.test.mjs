// The source-receipt vocabulary is declared in **one place only**.
//
// Why (2026-08-17): four identical lists lived byte-for-byte in both
// `project-source-receipt.mjs` and `project-meaning-inventory.mjs`, and both were
// used as gates. Adding one remedy to only one of them made the receipt accept it
// while the inventory silently rejected it — a divergence that shows up not as an
// error but as **nothing happening**.
//
// Merging them alone is not enough; the next person splits them again. **Two
// copies with no gate means drifting apart is the default** — something this
// repository confirmed five times in one day.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  PROJECT_SOURCE_ACTION_IDS,
  PROJECT_SOURCE_GAP_IDS,
} from './project-source-vocabulary.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OWNER = 'project-source-vocabulary.mjs';

test('스캐너가 두 표기를 다 본다 — 「공집합이 아니다」와 「전집합을 본다」는 다르다', () => {
  // Verified against the **real files**, not a synthetic fixture. A probe written
  // on the same assumption as the defect (single quotes) cannot prove the defect.
  const text = readFileSync(join(HERE, 'meaning-assessment.mjs'), 'utf8');
  const single = [...text.matchAll(/'[a-z_]{6,}'/g)].length;
  const double = [...text.matchAll(/"[a-z_]{6,}"/g)].length;
  assert.ok(double > 0, '이 파일이 큰따옴표를 안 쓴다면 이 검사가 지키던 것이 사라졌다');
  void single;
});

test('검사가 헛돌고 있지 않다 — 낱말이 실재한다', () => {
  assert.ok(PROJECT_SOURCE_ACTION_IDS.size >= 6, '처방 목록이 비었다');
  assert.ok(PROJECT_SOURCE_GAP_IDS.size >= 6, '간극 목록이 비었다');
  assert.ok(PROJECT_SOURCE_ACTION_IDS.has('connect_source'));
  assert.ok(PROJECT_SOURCE_GAP_IDS.has('source_unbound'));
});

test('두 목록이 겹치지 않는다 — 간극과 처방은 다른 것이다', () => {
  const both = [...PROJECT_SOURCE_ACTION_IDS].filter((id) => PROJECT_SOURCE_GAP_IDS.has(id));
  assert.deepEqual(both, [], `이 이름이 간극이자 처방이다: ${both.join(', ')}`);
});

test('이 목록을 다시 선언하는 파일이 없다', () => {
  const offenders = [];
  for (const file of readdirSync(HERE)) {
    if (!file.endsWith('.mjs') || file === OWNER || file.endsWith('.test.mjs')) continue;
    const text = readFileSync(join(HERE, file), 'utf8');
    // Find where these words are bound into a new Set **inside their own file**.
    for (const block of text.matchAll(/new Set\(\[([^\]]*)\]/g)) {
      // ⚠️ **There are two spellings** (measured 2026-08-17). At first only single
      // quotes were scanned, which missed the **third copy** in
      // `meaning-assessment.mjs` entirely — a gate that existed and blocked
      // nothing. This repository had already written the trap down
      // (`design-gates.md`: an icon scanner saw only single quotes and missed 73%
      // of the files). Tripped over the same thing twice.
      const names = [...block[1].matchAll(/['"]([a-z_]+)['"]/g)].map((m) => m[1]);
      if (names.length < 3) continue;
      const overlap = names.filter(
        (n) => PROJECT_SOURCE_ACTION_IDS.has(n) || PROJECT_SOURCE_GAP_IDS.has(n),
      );
      // More than half overlapping means it is a copy of this list (as opposed to a few coincidental hits).
      if (overlap.length >= Math.ceil(names.length / 2)) {
        offenders.push(`${file}: ${overlap.slice(0, 4).join(', ')}…`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `이 파일들이 낱말을 다시 선언한다 — ${OWNER} 에서 import 해라:\n${offenders.join('\n')}`,
  );
});
