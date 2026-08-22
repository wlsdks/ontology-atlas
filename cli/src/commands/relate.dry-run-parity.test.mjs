// `--dry-run` must give the same answer the real command gives.
//
// **Why** (measured 2026-08-16): the same arguments called twice gave opposite answers:
//
//   relate … --dry-run   → `dry-run would write …` · `safe_to_add` · exit 0
//   relate …             → `error  why is required …`             · exit 1
//
// A preview's only use is **knowing the outcome before doing it for real**. Saying
// «will write» about something that will be refused is not a preview, it is a
// wrong forecast — above all when the caller is an agent rather than a person,
// because a green preview is followed by the real call.
//
// The cause was that the refusal rule lived **inside the writing function**. A dry
// run never calls it, so it could not help but skip the rule. The rule was
// extracted as a pure function so **both paths call the same thing**.

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
