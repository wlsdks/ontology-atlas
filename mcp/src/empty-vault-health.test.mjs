// 노드가 0개인 폴더에 「정상」이라고 답하지 않는다.
//
// ## 왜 (2026-08-16 실측)
//
// 볼트가 아닌 폴더(`.md` 한 장, frontmatter 없음)를 `health` 로 검사하니
// **`healthy` · exit 0** 이 나왔다. 검사 6종이 전부 `pass:0` 이었기 때문이다 —
// 순환 0개, 안 풀린 엣지 0개, 끊긴 덩어리 0개. 셀 것이 없으면 전부 통과한다.
//
// 그건 `/gate-probe` 가 이름 붙여 둔 실패 그대로다: **빈 집합 위에서 헛도는
// 검사는 검사가 아니다.** 그리고 이 답을 받는 사람은 "폴더를 잘못 짚었나"를
// 의심할 기회를 잃는다 — 도구가 방금 괜찮다고 했으니까.
//
// 그래서 「셀 것이 있는가」를 먼저 검사한다. 이 검사가 없으면 나머지 6종의
// `pass` 는 아무것도 증명하지 못한다.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { compileOntology } from './ontology-compiler.mjs';
import { queryCompiledOntology } from './ontology-engine.mjs';

function health(docs) {
  return queryCompiledOntology(compileOntology(docs, { includeIndexes: true }), {
    operation: 'health',
  });
}

const node = (slug, frontmatter) => ({
  slug,
  frontmatter: { uid: '00000000-0000-4000-8000-000000000001', ...frontmatter },
  body: '',
  mtime: 1,
});

describe('빈 볼트를 정상이라고 답하지 않는다', () => {
  it('노드 0개면 `healthy` 가 아니다 — 실측 재현', () => {
    const result = health([]);
    assert.equal(result.summary.nodes, 0);
    assert.notEqual(result.status, 'healthy');
  });

  it('그 이유를 검사 한 줄로 말한다 — 사람이 무엇을 할지 알 수 있게', () => {
    const check = health([]).checks.find((c) => c.id === 'vault_present');
    assert.ok(check, 'vault_present 검사가 있어야 한다');
    assert.equal(check.status, 'fail');
    assert.match(check.message, /폴더|folder|vault/i);
  });

  it('나머지 검사가 빈 집합 위에서 헛돌고 있었다는 것도 같이 못박는다', () => {
    // 이 단언이 깨지면 위 검사가 필요 없어진 것이 아니라, 다른 검사가
    // 빈 볼트에서 다르게 행동하기 시작한 것이다 — 그때 여기를 다시 본다.
    const others = health([]).checks.filter((c) => c.id !== 'vault_present');
    assert.ok(others.length >= 5);
    assert.deepEqual(
      [...new Set(others.map((c) => c.status))],
      ['pass'],
      '노드가 없으면 나머지 검사는 전부 셀 것이 없어 통과한다',
    );
  });

  it('노드가 하나라도 있으면 통과한다 — 검사가 늘 실패하면 그것도 검사가 아니다', () => {
    const result = health([node('domains/auth', { kind: 'domain', title: 'Auth' })]);
    const check = result.checks.find((c) => c.id === 'vault_present');
    assert.equal(check.status, 'pass');
    assert.equal(check.count, 1);
  });
});
