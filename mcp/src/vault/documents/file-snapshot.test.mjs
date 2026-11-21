import assert from 'node:assert/strict';
import fs, { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { contentHash } from './content-hash.mjs';
import { readStableFileSnapshot, sameFileSnapshot, snapshotChars } from './file-snapshot.mjs';

function inTempDir(run) {
  const dir = mkdtempSync(join(tmpdir(), 'oatlas-file-snapshot-'));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Runs `run` with `fs[name]` replaced, restoring it (and the ESM view of it) afterwards. */
function withPatchedFs(name, replacement, run) {
  const original = fs[name];
  fs[name] = replacement(original);
  syncBuiltinESMExports();
  try {
    return run();
  } finally {
    fs[name] = original;
    syncBuiltinESMExports();
  }
}

test('a regular file is read as its bytes, the stamp they were read under and their hash', () => {
  inTempDir((dir) => {
    const file = join(dir, 'a.md');
    writeFileSync(file, 'héllo', 'utf8');
    const snapshot = readStableFileSnapshot(file);
    assert.equal(snapshot.raw, 'héllo');
    assert.equal(snapshot.hash, contentHash(Buffer.from('héllo')));
    assert.equal(snapshotChars(snapshot), Buffer.byteLength('héllo'));
    assert.equal(sameFileSnapshot(snapshot.stats, snapshot.stats), true);
  });
});

test('a directory where a file is expected is skipped like a deleted file, not read', () => {
  inTempDir((dir) => {
    mkdirSync(join(dir, 'folder.md'));
    assert.throws(
      () => readStableFileSnapshot(join(dir, 'folder.md')),
      (error) => error.code === 'ENOENT' && /Not a regular file/.test(error.message),
    );
  });
});

test('a symlink to a directory is refused the same way, a symlink to a file is read through', () => {
  inTempDir((dir) => {
    mkdirSync(join(dir, 'real-folder'));
    writeFileSync(join(dir, 'real.md'), 'x', 'utf8');
    symlinkSync(join(dir, 'real-folder'), join(dir, 'link-to-folder.md'));
    symlinkSync(join(dir, 'real.md'), join(dir, 'link-to-file.md'));
    assert.throws(
      () => readStableFileSnapshot(join(dir, 'link-to-folder.md')),
      (error) => error.code === 'ENOENT' && /Not a regular file/.test(error.message),
    );
    assert.equal(readStableFileSnapshot(join(dir, 'link-to-file.md')).raw, 'x');
  });
});

test('a file whose stamp changes during every attempt is never returned', () => {
  inTempDir((dir) => {
    const file = join(dir, 'a.md');
    writeFileSync(file, 'body', 'utf8');
    let calls = 0;
    const driftingStat = (original) => (descriptor) => {
      const stats = original(descriptor);
      calls += 1;
      // Every second stat is the one taken after the read.
      return calls % 2 === 0 ? { ...stats, isFile: () => true, mtimeMs: stats.mtimeMs + calls, ctimeMs: stats.ctimeMs } : stats;
    };
    withPatchedFs('fstatSync', driftingStat, () => {
      assert.throws(() => readStableFileSnapshot(file), /Could not capture a stable file snapshot/);
    });
    assert.equal(calls, 6, 'three attempts of two stats each');
  });
});

test('a stamp that changed once is read again and the second, stable read is returned', () => {
  inTempDir((dir) => {
    const file = join(dir, 'a.md');
    writeFileSync(file, 'body', 'utf8');
    let calls = 0;
    const driftOnce = (original) => (descriptor) => {
      const stats = original(descriptor);
      calls += 1;
      return calls === 2 ? { ...stats, isFile: () => true, mtimeMs: stats.mtimeMs + 1, ctimeMs: stats.ctimeMs } : stats;
    };
    withPatchedFs('fstatSync', driftOnce, () => {
      assert.equal(readStableFileSnapshot(file).raw, 'body');
    });
    assert.equal(calls, 4);
  });
});

test('a file that gave fewer bytes than its stamped size is read again, not returned short', () => {
  inTempDir((dir) => {
    const file = join(dir, 'a.md');
    writeFileSync(file, 'body', 'utf8');
    withPatchedFs('readSync', () => () => 0, () => {
      assert.throws(() => readStableFileSnapshot(file), /Could not capture a stable file snapshot/);
    });
  });
});
