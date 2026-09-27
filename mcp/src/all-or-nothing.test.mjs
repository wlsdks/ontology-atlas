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
  it('an empty plan does nothing', () => {
    assert.deepEqual(applyAllOrNothing([]), { applied: 0 });
    assert.deepEqual(applyAllOrNothing(undefined), { applied: 0 });
  });

  it('applies everything when every step succeeds, with writes and deletes mixed', () => {
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
  it('refuses and writes nothing when one target is unwritable', () => {
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
  it('rolls back earlier writes when a write fails', () => {
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

  it('rollback deletes a file the plan created, so no half-state remains', () => {
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

  it('a pre-flight refusal creates no missing parent directory', () => {
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
      'a refusal before any write left a directory behind',
    );
    chmodSync(locked, 0o644);
    rmSync(root, { recursive: true, force: true });
  });

  it('a failed write also removes empty directories this run created', () => {
    const root = scratch();
    mkdirSync(join(root, 'trap.md'));

    assert.throws(() =>
      applyAllOrNothing([
        { op: 'write', path: join(root, 'new', 'nested', 'node.md'), content: 'x' },
        { op: 'write', path: join(root, 'trap.md'), content: 'boom' },
      ]),
    );

    assert.equal(existsSync(join(root, 'new')), false, 'an empty directory remained after rollback');
    rmSync(root, { recursive: true, force: true });
  });

  it('deleting a missing file is not an error: the plan states the target state', () => {
    const root = scratch();
    const result = applyAllOrNothing([{ op: 'delete', path: join(root, 'never-existed.md') }]);
    assert.equal(result.applied, 1);
    rmSync(root, { recursive: true, force: true });
  });
});

test('writes nothing when someone else edited a target in between', async () => {
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
  // The user edited it in between. The edit's mtime is set explicitly, one minute later,
  // so the gap does not depend on the filesystem's timestamp resolution or on a sleep.
  writeFileSync(stale, 'edited by the human', 'utf-8');
  const edited = new Date(staleMtime + 60_000);
  utimesSync(stale, edited, edited);

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

test('does not revive a deleted expectedMtime target with stale content', () => {
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
  assert.equal(existsSync(deleted), false, 'revived a file a person deleted with stale content');
  rmSync(dir, { recursive: true, force: true });
});

test('does not write when the read bytes changed even with an equal mtime', () => {
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

test('rechecks each item before applying it and rolls back earlier writes on a late edit', () => {
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

test('rechecks bytes right before the atomic rename', () => {
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

test('a revision-required plan refuses a missing revision on existing and new targets before starting', () => {
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
