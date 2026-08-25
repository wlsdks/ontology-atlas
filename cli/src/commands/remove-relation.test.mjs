import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { planRemoval } from './remove-relation.mjs';

/**
 * Owner, 2026-08-25: *"make every feature usable from the CLI alone."* Measured the same day: the
 * CLI could **create** a relation with `relate` and had nothing to remove one, so a person working
 * only in the terminal had to open the Markdown and hand-edit frontmatter to undo their own typo.
 *
 * These hold the part a wrong answer would quietly corrupt: which key is touched, what survives it,
 * and that a relation which is not there is reported rather than invented.
 */
describe('remove-relation — 관계 하나를 정확히 덜어낸다', () => {
  it('배열에서 그 하나만 빼고 나머지는 그대로 둔다', () => {
    const plan = planRemoval(
      { relates: ['capabilities/a', 'capabilities/b', 'capabilities/c'] },
      'relates',
      'capabilities/b',
    );
    assert.equal(plan.found, true);
    assert.equal(plan.key, 'relates');
    assert.deepEqual(plan.next, ['capabilities/a', 'capabilities/c']);
  });

  it('관계 타입을 프론트매터 키로 옮긴다 — depends_on 은 dependencies 다', () => {
    // ⚠️ The public type and the frontmatter key differ, and writing to the type name would create a
    // second key holding half the graph while the real one still says the relation exists.
    const plan = planRemoval({ dependencies: ['capabilities/x'] }, 'depends_on', 'capabilities/x');
    assert.equal(plan.key, 'dependencies');
    assert.deepEqual(plan.next, []);
  });

  it('domain 은 배열이 아니라 하나짜리 값이다', () => {
    const plan = planRemoval({ domain: 'domains/core' }, 'domain', 'domains/core');
    assert.equal(plan.found, true);
    assert.equal(plan.next, null);
  });

  it('다른 도메인을 지우라고 하면 지우지 않고 현재 값을 알려 준다', () => {
    const plan = planRemoval({ domain: 'domains/core' }, 'domain', 'domains/other');
    assert.equal(plan.found, false);
    assert.match(plan.reason, /domains\/core/);
  });

  /*
   * ⚠️ Two different failures, and a person can act on only one of them. "The list has no such slug"
   * means the slug is wrong; "this document has no such list" means the relation *type* is wrong.
   * Reporting both as "not found" would hide a mistyped type behind a mistyped slug.
   */
  it('없는 관계와 없는 종류를 구분해서 말한다', () => {
    const missingSlug = planRemoval({ relates: ['capabilities/a'] }, 'relates', 'capabilities/zz');
    assert.equal(missingSlug.found, false);
    assert.match(missingSlug.reason, /not in relates/);

    const missingKey = planRemoval({ relates: ['capabilities/a'] }, 'contains', 'capabilities/a');
    assert.equal(missingKey.found, false);
    assert.match(missingKey.reason, /no contains/);
  });

  it('중복이 들어 있어도 정규화한 뒤 뺀다', () => {
    const plan = planRemoval(
      { relates: ['capabilities/a', 'capabilities/a', 'capabilities/b'] },
      'relates',
      'capabilities/a',
    );
    assert.deepEqual(plan.next, ['capabilities/b']);
  });
});
