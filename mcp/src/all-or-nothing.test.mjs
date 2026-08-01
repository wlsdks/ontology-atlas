/**
 * 다중 파일 쓰기는 **전부 아니면 전무**다.
 *
 * ## 이 파일이 존재하는 이유
 *
 * `rename_concept` 의 도구 설명은 *"one atomic graph-level operation"*, `AGENTS.md`
 * 는 *"atomically rewrites every backlink"* 라고 약속했는데 구현이 그렇지 않았다
 * (2026-08-01 검수 실측). 참조 셋 중 하나가 읽기 전용이면:
 *
 * - 새 파일은 생성되고 옛 파일은 **안 지워져** 제목이 같은 노드가 둘이 되고
 * - 참조 일부는 새 이름, 나머지는 옛 이름을 가리켰다
 *
 * 그리고 그 분열된 볼트에 `validate` 는 *"issue 0 ✓"*, `health` 는 *"pass"* 라고
 * 답했다 — **어떤 검사도 이 상태를 이상하다고 말하지 않는다.** 사용자의 디스크가
 * 진실원이라는 이 제품의 전제 위에서 가장 비싼 종류의 조용한 실패다.
 *
 * 그래서 계약을 여기 못박는다. 세 갈래를 다 잰다: ① 사전 거절(흔한 경우) ②
 * 쓰기 중 실패 시 되돌리기 ③ 되돌리기마저 실패하면 **숨기지 않고 말하기**.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { applyAllOrNothing } from './vault.mjs';

function scratch() {
  return mkdtempSync(join(tmpdir(), 'oa-aon-'));
}

describe('applyAllOrNothing', () => {
  it('빈 계획은 아무것도 안 한다', () => {
    assert.deepEqual(applyAllOrNothing([]), { applied: 0 });
    assert.deepEqual(applyAllOrNothing(undefined), { applied: 0 });
  });

  it('전부 성공하면 전부 적용된다 — 쓰기와 삭제가 섞여도', () => {
    const root = scratch();
    writeFileSync(join(root, 'a.md'), 'old-a');
    writeFileSync(join(root, 'gone.md'), 'bye');

    const result = applyAllOrNothing([
      { op: 'write', path: join(root, 'a.md'), content: 'new-a' },
      { op: 'write', path: join(root, 'nested', 'b.md'), content: 'new-b' },
      { op: 'delete', path: join(root, 'gone.md') },
    ]);

    assert.equal(result.applied, 3);
    assert.equal(readFileSync(join(root, 'a.md'), 'utf-8'), 'new-a');
    assert.equal(readFileSync(join(root, 'nested', 'b.md'), 'utf-8'), 'new-b');
    assert.equal(existsSync(join(root, 'gone.md')), false);
    rmSync(root, { recursive: true, force: true });
  });

  /**
   * 흔한 실패는 여기서 끝난다 — 읽기 전용 파일(동기화 클라이언트 · 잠금 ·
   * 공유 체크아웃의 권한). 한 글자도 안 쓰므로 되돌릴 것도 없다.
   */
  it('대상 하나가 쓰기 불가면 **아무것도 쓰지 않고** 거절한다', () => {
    const root = scratch();
    writeFileSync(join(root, 'ok.md'), 'before-ok');
    writeFileSync(join(root, 'locked.md'), 'before-locked');
    chmodSync(join(root, 'locked.md'), 0o444);

    assert.throws(
      () =>
        applyAllOrNothing([
          { op: 'write', path: join(root, 'ok.md'), content: 'after-ok' },
          { op: 'write', path: join(root, 'locked.md'), content: 'after-locked' },
        ]),
      (error) => {
        // 어느 파일인지 · 볼트가 안 변했다는 것 · 무엇을 하면 되는지.
        assert.match(error.message, /Refused before writing anything/);
        assert.match(error.message, /locked\.md/);
        assert.match(error.message, /vault is unchanged/);
        return true;
      },
    );

    // 앞선 항목이 먼저 성공하지 않았다는 것이 요점이다.
    assert.equal(readFileSync(join(root, 'ok.md'), 'utf-8'), 'before-ok');
    assert.equal(readFileSync(join(root, 'locked.md'), 'utf-8'), 'before-locked');
    chmodSync(join(root, 'locked.md'), 0o644);
    rmSync(root, { recursive: true, force: true });
  });

  /**
   * 사전 점검을 **통과했는데** 쓰기가 실패하는 경우 — 여기서 되돌리기가 일한다.
   * 디렉터리에 파일을 쓰려 하면 EISDIR 인데, `accessSync(dir, W_OK)` 는 통과하므로
   * 사전 점검으로는 못 잡는다. ENOSPC 를 흉내 내기 좋은 대역이다.
   */
  it('쓰기 중 실패하면 이미 쓴 것을 되돌린다', () => {
    const root = scratch();
    writeFileSync(join(root, 'first.md'), 'ORIGINAL-1');
    writeFileSync(join(root, 'second.md'), 'ORIGINAL-2');
    mkdirSync(join(root, 'trap.md')); // 파일이 아니라 디렉터리 — 쓰기가 EISDIR

    assert.throws(
      () =>
        applyAllOrNothing([
          { op: 'write', path: join(root, 'first.md'), content: 'REWRITTEN-1' },
          { op: 'delete', path: join(root, 'second.md') },
          { op: 'write', path: join(root, 'trap.md'), content: 'boom' },
        ]),
      (error) => {
        assert.match(error.message, /rolled back/);
        assert.match(error.message, /vault is unchanged/);
        return true;
      },
    );

    // 앞의 둘이 원상복구됐는가 — 이게 종전에 안 되던 것이다.
    assert.equal(readFileSync(join(root, 'first.md'), 'utf-8'), 'ORIGINAL-1');
    assert.equal(readFileSync(join(root, 'second.md'), 'utf-8'), 'ORIGINAL-2');
    rmSync(root, { recursive: true, force: true });
  });

  it('새로 만든 파일은 되돌릴 때 지운다 — 없던 것이 남으면 그것도 반쪽이다', () => {
    const root = scratch();
    mkdirSync(join(root, 'trap.md'));

    assert.throws(() =>
      applyAllOrNothing([
        { op: 'write', path: join(root, 'created.md'), content: 'x' },
        { op: 'write', path: join(root, 'trap.md'), content: 'boom' },
      ]),
    );

    assert.equal(existsSync(join(root, 'created.md')), false);
    rmSync(root, { recursive: true, force: true });
  });

  it('없는 파일의 삭제는 오류가 아니다 — 계획은 목표 상태를 말한다', () => {
    const root = scratch();
    const result = applyAllOrNothing([{ op: 'delete', path: join(root, 'never-existed.md') }]);
    assert.equal(result.applied, 1);
    rmSync(root, { recursive: true, force: true });
  });
});
