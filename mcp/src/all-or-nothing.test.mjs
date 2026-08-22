/**
 * A multi-file write is **all-or-nothing**.
 *
 * Why this file exists: `rename_concept`'s tool description promised *"one atomic
 * graph-level operation"* and `AGENTS.md` promised *"atomically rewrites every
 * backlink"*, and the implementation did neither (measured in the 2026-08-01
 * review). With one of three references read-only:
 *
 * - the new file was created and the old file **was not deleted**, leaving two
 *   nodes with the same title
 * - some references pointed at the new name, the rest at the old one
 *
 * And on that split vault `validate` answered *"issue 0 ✓"* and `health` answered
 * *"pass"* — **no check called the state wrong.** On a product whose premise is
 * that the user's disk is the source of truth, that is the most expensive kind of
 * silent failure.
 *
 * So the contract is pinned here, measured along all three branches: ① refusal up
 * front (the common case) ② rollback when a write fails midway ③ **saying so
 * rather than hiding it** when even the rollback fails.
 */
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { applyAllOrNothing, writeFileAtomically } from './vault.mjs';

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
   * The common failures end here — a read-only file (sync client, lock, permissions
   * on a shared checkout). Nothing is written, so there is nothing to roll back.
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
        // Which file · that the vault did not change · what to do about it.
        assert.match(error.message, /Refused before writing anything/);
        assert.match(error.message, /locked\.md/);
        assert.match(error.message, /vault is unchanged/);
        return true;
      },
    );

    // The point is that the earlier entry did not succeed first.
    assert.equal(readFileSync(join(root, 'ok.md'), 'utf-8'), 'before-ok');
    assert.equal(readFileSync(join(root, 'locked.md'), 'utf-8'), 'before-locked');
    chmodSync(join(root, 'locked.md'), 0o644);
    rmSync(root, { recursive: true, force: true });
  });

  /**
   * A write that fails **after passing** the pre-check — this is where rollback
   * does its work. Writing a file onto a directory yields EISDIR, and
   * `accessSync(dir, W_OK)` passes, so the pre-check cannot catch it. A good stand-in
   * for ENOSPC.
   */
  it('쓰기 중 실패하면 이미 쓴 것을 되돌린다', () => {
    const root = scratch();
    writeFileSync(join(root, 'first.md'), 'ORIGINAL-1');
    writeFileSync(join(root, 'second.md'), 'ORIGINAL-2');
    mkdirSync(join(root, 'trap.md')); // a directory, not a file — the write yields EISDIR

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

    // Were the first two restored — the part that used to fail.
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

  it('사전 거절은 아직 없는 상위 디렉터리도 만들지 않는다', () => {
    const root = scratch();
    const locked = join(root, 'locked.md');
    writeFileSync(locked, 'locked');
    chmodSync(locked, 0o444);

    assert.throws(() =>
      applyAllOrNothing([
        { op: 'write', path: join(root, 'new', 'nested', 'node.md'), content: 'x' },
        { op: 'write', path: locked, content: 'blocked' },
      ]),
    );

    assert.equal(
      existsSync(join(root, 'new')),
      false,
      '아무것도 쓰기 전 거절이 디렉터리 부작용을 남겼다',
    );
    chmodSync(locked, 0o644);
    rmSync(root, { recursive: true, force: true });
  });

  it('쓰기 실패는 이 작업이 새로 만든 빈 디렉터리까지 되돌린다', () => {
    const root = scratch();
    mkdirSync(join(root, 'trap.md'));

    assert.throws(() =>
      applyAllOrNothing([
        { op: 'write', path: join(root, 'new', 'nested', 'node.md'), content: 'x' },
        { op: 'write', path: join(root, 'trap.md'), content: 'boom' },
      ]),
    );

    assert.equal(existsSync(join(root, 'new')), false, 'rollback 뒤 빈 디렉터리가 남았다');
    rmSync(root, { recursive: true, force: true });
  });

  it('없는 파일의 삭제는 오류가 아니다 — 계획은 목표 상태를 말한다', () => {
    const root = scratch();
    const result = applyAllOrNothing([{ op: 'delete', path: join(root, 'never-existed.md') }]);
    assert.equal(result.applied, 1);
    rmSync(root, { recursive: true, force: true });
  });
});

test('남이 그 사이에 고쳤으면 한 글자도 안 쓴다', async () => {
  /*
   * Review 2026-08-16: the `expected_mtime` check existed only on the paths that
   * edit **one file**. rename/merge/reclassify edit many, rewriting N referencing
   * documents from a snapshot read minutes earlier, and an edit the user made in
   * Obsidian in between vanished silently — a human and an agent sharing one
   * folder is the exact situation this product sells, and protection was missing
   * only there.
   */
  const dir = mkdtempSync(join(tmpdir(), 'oatlas-conflict-'));
  const kept = join(dir, 'kept.md');
  const stale = join(dir, 'stale.md');
  writeFileSync(kept, 'kept-before', 'utf-8');
  writeFileSync(stale, 'stale-before', 'utf-8');

  // Carry the mtime from the moment the plan was built.
  const staleMtime = statSync(stale).mtimeMs;
  // The user edited it in between — open a gap of more than 1ms.
  await new Promise((resolve) => setTimeout(resolve, 20));
  writeFileSync(stale, 'edited by the human', 'utf-8');

  assert.throws(
    () =>
      applyAllOrNothing([
        { op: 'write', path: kept, content: 'kept-after' },
        { op: 'write', path: stale, content: 'agent-after', expectedMtime: staleMtime },
      ]),
    /changed on disk/,
  );

  // **Not one character was written** — the human's edit and the earlier file both stand.
  assert.equal(readFileSync(stale, 'utf-8'), 'edited by the human');
  assert.equal(readFileSync(kept, 'utf-8'), 'kept-before');
  rmSync(dir, { recursive: true, force: true });
});

test('expectedMtime 대상이 삭제됐으면 stale 내용으로 되살리지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oatlas-deleted-conflict-'));
  const kept = join(dir, 'kept.md');
  const deleted = join(dir, 'deleted.md');
  writeFileSync(kept, 'kept-before', 'utf-8');
  writeFileSync(deleted, 'human-owned', 'utf-8');
  const expectedMtime = statSync(deleted).mtimeMs;
  unlinkSync(deleted);

  assert.throws(
    () =>
      applyAllOrNothing([
        { op: 'write', path: kept, content: 'kept-after' },
        { op: 'write', path: deleted, content: 'stale-agent-copy', expectedMtime },
      ]),
    /changed|deleted/i,
  );

  assert.equal(readFileSync(kept, 'utf-8'), 'kept-before');
  assert.equal(existsSync(deleted), false, '사람이 지운 파일을 stale 내용으로 되살렸다');
  rmSync(dir, { recursive: true, force: true });
});

test('mtime이 같아도 읽은 바이트가 달라졌으면 쓰지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oatlas-content-conflict-'));
  const file = join(dir, 'same-clock.md');
  writeFileSync(file, 'agent-snapshot', 'utf-8');
  const snapshotMtime = statSync(file).mtimeMs;

  writeFileSync(file, 'human-edited!', 'utf-8');
  utimesSync(file, snapshotMtime / 1000, snapshotMtime / 1000);

  assert.throws(
    () => applyAllOrNothing([
      {
        op: 'write',
        path: file,
        content: 'agent-result',
        expectedMtime: snapshotMtime,
        expectedRaw: 'agent-snapshot',
      },
    ]),
    /changed on disk/i,
  );
  assert.equal(readFileSync(file, 'utf-8'), 'human-edited!');
  rmSync(dir, { recursive: true, force: true });
});

test('각 항목 적용 직전 다시 검사하고 뒤늦은 편집이면 앞선 쓰기도 되돌린다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oatlas-late-conflict-'));
  const first = join(dir, 'first.md');
  const second = join(dir, 'second.md');
  writeFileSync(first, 'first-before', 'utf-8');
  writeFileSync(second, 'second-before', 'utf-8');

  assert.throws(
    () => applyAllOrNothing([
      { op: 'write', path: first, content: 'first-after', expectedRaw: 'first-before' },
      { op: 'write', path: second, content: 'second-after', expectedRaw: 'second-before' },
    ], {
      beforeApplyEntry(index) {
        if (index === 1) writeFileSync(second, 'human-second', 'utf-8');
      },
    }),
    /changed on disk/i,
  );

  assert.equal(readFileSync(first, 'utf-8'), 'first-before');
  assert.equal(readFileSync(second, 'utf-8'), 'human-second');
  rmSync(dir, { recursive: true, force: true });
});

test('atomic rename 직전에 바이트를 다시 확인한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oatlas-final-check-'));
  const file = join(dir, 'doc.md');
  writeFileSync(file, 'before', 'utf-8');

  assert.throws(
    () => writeFileAtomically(file, 'agent-after', {
      expectedRaw: 'before',
      beforeCommit() {
        writeFileSync(file, 'human-after', 'utf-8');
      },
    }),
    /changed on disk/i,
  );
  assert.equal(readFileSync(file, 'utf-8'), 'human-after');
  rmSync(dir, { recursive: true, force: true });
});

test('revision 필수 계획은 기존 파일과 새 대상의 revision 누락을 시작 전에 거절한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oatlas-required-revision-'));
  const existing = join(dir, 'existing.md');
  const missing = join(dir, 'missing.md');
  writeFileSync(existing, 'before', 'utf-8');

  assert.throws(
    () => applyAllOrNothing([
      { op: 'write', path: existing, content: 'after' },
      { op: 'write', path: missing, content: 'created' },
    ], { requireRevisions: true }),
    /missing snapshot revision/i,
  );
  assert.equal(readFileSync(existing, 'utf-8'), 'before');
  assert.equal(existsSync(missing), false);
  rmSync(dir, { recursive: true, force: true });
});
