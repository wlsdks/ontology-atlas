// Never answer "healthy" for a folder with zero nodes.
//
// Why (measured 2026-08-16): running `health` on a folder that is not a vault (one
// `.md`, no frontmatter) returned **`healthy`, exit 0** — because all six checks
// were `pass:0`. Zero cycles, zero unresolved edges, zero disconnected components.
// With nothing to count, everything passes.
//
// That is exactly the failure `/gate-probe` names: **a check idling on an empty set
// is not a check.** And the person receiving that answer loses the chance to
// suspect they pointed at the wrong folder — the tool just said it was fine.
//
// So "is there anything to count" is checked first. Without it, the `pass` of the
// other six proves nothing.

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
    // If this assertion breaks, the check above has not become unnecessary — some
    // other check has started behaving differently on an empty vault, and this is
    // the place to look again.
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
