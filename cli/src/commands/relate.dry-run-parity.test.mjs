// `--dry-run` 은 진짜 명령이 하는 것과 같은 답을 내야 한다.
//
// ## 왜 (2026-08-16 실측)
//
// 같은 인자로 두 번 불렀더니 답이 정반대였다:
//
//   relate … --dry-run   → `dry-run would write …` · `safe_to_add` · exit 0
//   relate …             → `error  why is required …`             · exit 1
//
// 미리보기의 쓸모는 **진짜로 하기 전에 결과를 아는 것** 하나뿐이다. 그것이
// 거절될 일을 「쓰겠다」고 말하면 미리보기가 아니라 틀린 예보다 — 특히 이
// 명령을 부르는 쪽이 사람이 아니라 에이전트일 때, 미리보기가 초록이면
// 그다음에 진짜로 부른다.
//
// 원인은 거절 규칙이 **쓰는 함수 안에** 있었다는 것이다. dry-run 은 그
// 함수를 아예 안 부르므로 규칙을 지나칠 수밖에 없었다. 그래서 규칙을 순수
// 함수로 꺼내 **두 길이 같은 것을 부르게** 했다.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { relationWriteRefusal } from './relate.mjs';

describe('미리보기와 실제가 같은 규칙을 본다', () => {
  it('근거 없는 새 의존 관계는 양쪽 다 거절한다 — 실측 재현', () => {
    const refusal = relationWriteRefusal({
      frontmatter: {},
      relation: 'dependencies',
      to: 'capabilities/mcp-server',
      why: null,
    });
    assert.ok(refusal, '거절 사유가 있어야 한다');
    assert.match(refusal, /why/i);
  });

  it('근거를 주면 통과한다 — 늘 거절하면 그것도 규칙이 아니다', () => {
    assert.equal(
      relationWriteRefusal({
        frontmatter: {},
        relation: 'dependencies',
        to: 'capabilities/mcp-server',
        why: 'ACP 세션이 이 서버를 주입받아 도구를 얻는다',
      }),
      null,
    );
  });

  it('이미 다른 도메인이 박혀 있으면 거절한다 — 이것도 쓰기 함수 안에만 있었다', () => {
    const refusal = relationWriteRefusal({
      frontmatter: { domain: 'domains/auth' },
      relation: 'domain',
      to: 'domains/payment',
      why: null,
    });
    assert.ok(refusal);
    assert.match(refusal, /domains\/auth/);
  });

  it('같은 도메인을 다시 쓰는 것은 거절이 아니다', () => {
    assert.equal(
      relationWriteRefusal({
        frontmatter: { domain: 'domains/auth' },
        relation: 'domain',
        to: 'domains/auth',
        why: null,
      }),
      null,
    );
  });

  it('의존이 아닌 관계는 근거를 요구하지 않는다', () => {
    assert.equal(
      relationWriteRefusal({ frontmatter: {}, relation: 'relates', to: 'x/y', why: null }),
      null,
    );
  });

  it('프론트매터 키 표기로 불러도 같게 판정한다 — preflight 가 그렇게 돌려준다', () => {
    assert.ok(
      relationWriteRefusal({ frontmatter: {}, relation: 'depends_on', to: 'x/y', why: '' }),
      'depends_on 표기도 dependencies 와 같은 규칙을 받아야 한다',
    );
  });
});
