// 소스 영수증의 낱말은 **한 곳에서만** 선언한다.
//
// ## 왜 (2026-08-17)
//
// 같은 목록 넷이 `project-source-receipt.mjs` 와
// `project-meaning-inventory.mjs` 에 바이트 단위로 똑같이 두 벌 있었고, 둘 다
// 검사기로 쓰였다. 그래서 처방을 하나 더할 때 한쪽만 고치면 영수증은 통과
// 시키는데 인벤토리는 조용히 거절한다 — 에러가 아니라 **아무 일도 안 일어나는
// 것**으로 나타나는 종류의 어긋남이다.
//
// 합쳐 놓기만 하면 다음 사람이 다시 가른다. **사본이 둘인데 게이트가 없으면
// 어긋나는 쪽이 기본값이다** — 이 저장소가 오늘만 다섯 번 확인한 것이다.

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
    // 이 낱말들을 **자기 파일 안에서 새 Set 으로** 묶는 자리를 찾는다.
    for (const block of text.matchAll(/new Set\(\[([^\]]*)\]/g)) {
      const names = [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
      if (names.length < 3) continue;
      const overlap = names.filter(
        (n) => PROJECT_SOURCE_ACTION_IDS.has(n) || PROJECT_SOURCE_GAP_IDS.has(n),
      );
      // 절반 넘게 겹치면 그건 이 목록의 사본이다(우연히 몇 개 겹치는 것과 다르다).
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
