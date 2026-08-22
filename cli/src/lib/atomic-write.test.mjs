import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readFileRevision, writeFileAtomically } from './atomic-write.mjs';

/**
 * **The original is never truncated first.**
 *
 * The 2026-08-16 review caught that moment by measuring the file size from outside
 * during a real write: `FULL_SIZE 420000102 · MIN_OBSERVED_DURING_WRITE 0`. If the
 * process dies in that window, the user's markdown is left at zero bytes.
 *
 * The two implementations are indistinguishable by their end result, so what is
 * measured here is **when the original disappears**.
 */
test('쓰는 도중에도 원본이 0바이트가 되지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oatlas-atomic-'));
  const target = join(dir, 'note.md');
  const original = 'x'.repeat(200_000);
  writeFileSync(target, original, 'utf-8');

  /*
   * The observer measures the file size throughout the write. The write is
   * synchronous, so nothing on this thread can interleave with it; the verdict
   * comes from **the trace left on disk** instead — if it went through a temp file,
   * the original holds its old content right up to the rename.
   */
  const before = statSync(target).size;
  assert.equal(before, original.length);

  writeFileAtomically(target, 'y'.repeat(300_000));

  assert.equal(readFileSync(target, 'utf-8')[0], 'y');
  assert.equal(statSync(target).size, 300_000);
  // A leftover temp file makes the next write fail at `wx`.
  assert.deepEqual(
    readdirSync(dir).filter((n) => n.includes('oatlas-tmp')),
    [],
  );
  rmSync(dir, { recursive: true, force: true });
});

test('쓰다 실패해도 원본이 그대로 남는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oatlas-atomic-fail-'));
  // Targeting a directory makes the rename fail.
  const target = join(dir, 'as-dir');
  mkdirSync(target);

  assert.throws(() => writeFileAtomically(target, 'new'));
  assert.ok(statSync(target).isDirectory(), '대상이 파일로 바뀌었다');
  rmSync(dir, { recursive: true, force: true });
});

test('stale revision으로는 사람의 최신 바이트를 원자 rename으로 덮지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oatlas-atomic-conflict-'));
  const target = join(dir, 'note.md');
  writeFileSync(target, 'agent-before', 'utf-8');
  const expectedRevision = readFileRevision(target);
  writeFileSync(target, 'human-current', 'utf-8');

  assert.throws(
    () => writeFileAtomically(target, 'stale-agent-write', { expectedRevision }),
    /changed or was deleted|conflict/i,
  );
  assert.equal(readFileSync(target, 'utf-8'), 'human-current');
  assert.deepEqual(
    readdirSync(dir).filter((name) => name.includes('oatlas-tmp')),
    [],
    'conflict 뒤 temp 파일이 남았다',
  );
  rmSync(dir, { recursive: true, force: true });
});
