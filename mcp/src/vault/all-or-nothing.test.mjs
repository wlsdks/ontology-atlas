/**
 * A multi-file write is all-or-nothing: refused up front (the common case),
 * rolled back when a write fails midway, and reported rather than hidden when
 * even the rollback fails. A half-applied rename leaves two same-titled nodes
 * that validate and health both pass.
 */
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { applyAllOrNothing, writeFileAtomically } from './atomic-writes.mjs';

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

  /** A read-only target (sync client, lock, permissions): nothing is written, so nothing rolls back. */
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
        // Names the file, that the vault is unchanged, and what to do.
        assert.match(error.message, /Refused before writing anything/);
        assert.match(error.message, /locked\.md/);
        assert.match(error.message, /vault is unchanged/);
        return true;
      },
    );

    // The earlier entry must not have been written first.
    assert.equal(readFileSync(join(root, 'ok.md'), 'utf-8'), 'before-ok');
    assert.equal(readFileSync(join(root, 'locked.md'), 'utf-8'), 'before-locked');
    chmodSync(join(root, 'locked.md'), 0o644);
    rmSync(root, { recursive: true, force: true });
  });

  /**
   * A failure after the pre-check passes: writing onto a directory yields EISDIR
   * while `accessSync(dir, W_OK)` passes, a stand-in for ENOSPC.
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
   * Multi-file plans rewrite documents from a snapshot read minutes earlier, so an
   * edit a person made in between must stop the whole plan.
   */
  const dir = mkdtempSync(join(tmpdir(), 'oatlas-conflict-'));
  const kept = join(dir, 'kept.md');
  const stale = join(dir, 'stale.md');
  writeFileSync(kept, 'kept-before', 'utf-8');
  writeFileSync(stale, 'stale-before', 'utf-8');

  const staleMtime = statSync(stale).mtimeMs;
  // The edit's mtime is set a minute later explicitly, so the gap does not depend
  // on timestamp resolution or a sleep.
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

  // Not one character written: the person's edit and the earlier file both stand.
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
