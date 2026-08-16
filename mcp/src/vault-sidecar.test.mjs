import { strict as assert } from 'node:assert';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  SidecarPathError,
  appendVaultSidecarLine,
  createVaultSidecarTextExclusive,
  readVaultSidecarText,
  removeVaultSidecarFile,
  replaceVaultSidecarText,
} from './vault-sidecar.mjs';

function sandbox(prefix = 'ontology-atlas-sidecar-') {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const vault = join(root, 'vault');
  mkdirSync(vault);
  return { root, vault };
}

function assertUnsafe(operation) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof SidecarPathError);
    assert.equal(error.code, 'unsafe_path');
    return true;
  });
}

describe('vault sidecar path boundary', () => {
  it('rejects read, create, replace, append, and remove through an external sidecar symlink', () => {
    const { root, vault } = sandbox();
    const outside = join(root, 'outside');
    mkdirSync(outside);
    const sentinel = join(outside, 'receipt.json');
    writeFileSync(sentinel, 'outside-original', 'utf8');
    symlinkSync(outside, join(vault, '.ontology-atlas'), process.platform === 'win32' ? 'junction' : 'dir');

    try {
      assertUnsafe(() => readVaultSidecarText(vault, 'receipt.json'));
      assertUnsafe(() => createVaultSidecarTextExclusive(vault, 'new.json', 'created'));
      assertUnsafe(() => replaceVaultSidecarText(vault, 'receipt.json', 'replaced'));
      assertUnsafe(() => appendVaultSidecarLine(vault, 'receipt.json', 'appended'));
      assertUnsafe(() => removeVaultSidecarFile(vault, 'receipt.json'));
      assert.equal(readFileSync(sentinel, 'utf8'), 'outside-original');
      assert.equal(existsSync(join(outside, 'new.json')), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a final-file symlink without changing or deleting its external target', () => {
    const { root, vault } = sandbox();
    const sidecar = join(vault, '.ontology-atlas');
    const sentinel = join(root, 'outside.json');
    mkdirSync(sidecar);
    writeFileSync(sentinel, 'outside-original', 'utf8');
    symlinkSync(sentinel, join(sidecar, 'receipt.json'), 'file');

    try {
      assertUnsafe(() => readVaultSidecarText(vault, 'receipt.json'));
      assertUnsafe(() => createVaultSidecarTextExclusive(vault, 'receipt.json', 'created'));
      assertUnsafe(() => replaceVaultSidecarText(vault, 'receipt.json', 'replaced'));
      assertUnsafe(() => appendVaultSidecarLine(vault, 'receipt.json', 'appended'));
      assertUnsafe(() => removeVaultSidecarFile(vault, 'receipt.json'));
      assert.equal(readFileSync(sentinel, 'utf8'), 'outside-original');
      assert.equal(existsSync(join(sidecar, 'receipt.json')), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses exclusive temporary creation so a colliding temp symlink cannot redirect replacement', () => {
    const { root, vault } = sandbox();
    const sidecar = join(vault, '.ontology-atlas');
    const sentinel = join(root, 'outside.txt');
    mkdirSync(sidecar);
    writeFileSync(join(sidecar, 'receipt.json'), 'current', 'utf8');
    writeFileSync(sentinel, 'outside-original', 'utf8');
    symlinkSync(sentinel, join(sidecar, '.receipt.json.test-collision.tmp'), 'file');

    try {
      assert.throws(
        () => replaceVaultSidecarText(vault, 'receipt.json', 'new', {
          temporaryName: '.receipt.json.test-collision.tmp',
        }),
        /EEXIST|temporary/i,
      );
      assert.equal(readFileSync(sentinel, 'utf8'), 'outside-original');
      assert.equal(readFileSync(join(sidecar, 'receipt.json'), 'utf8'), 'current');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('canonicalizes a vault-root symlink alias and writes only inside the real vault', () => {
    const { root, vault } = sandbox();
    const alias = join(root, 'vault-alias');
    symlinkSync(vault, alias, process.platform === 'win32' ? 'junction' : 'dir');

    try {
      replaceVaultSidecarText(alias, 'receipt.json', 'inside');
      assert.equal(readFileSync(join(vault, '.ontology-atlas', 'receipt.json'), 'utf8'), 'inside');
      assert.equal(readVaultSidecarText(alias, 'receipt.json')?.text, 'inside');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('preserves newer bytes when an expected revision became stale', () => {
    const { root, vault } = sandbox();
    try {
      replaceVaultSidecarText(vault, 'activity.jsonl', 'first\n');
      const observed = readVaultSidecarText(vault, 'activity.jsonl');
      assert.ok(observed?.revision);
      appendVaultSidecarLine(vault, 'activity.jsonl', 'second');

      assert.throws(
        () => replaceVaultSidecarText(vault, 'activity.jsonl', 'stale-rotation\n', {
          expectedRevision: observed.revision,
        }),
        /Conflict/,
      );
      assert.equal(readVaultSidecarText(vault, 'activity.jsonl')?.text, 'first\nsecond\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('creates once, appends complete lines, and removes a regular sidecar file', () => {
    const { root, vault } = sandbox();
    try {
      assert.equal(createVaultSidecarTextExclusive(vault, '.gitignore', '*\n'), true);
      assert.equal(createVaultSidecarTextExclusive(vault, '.gitignore', 'other\n'), false);
      appendVaultSidecarLine(vault, 'activity.jsonl', 'one');
      appendVaultSidecarLine(vault, 'activity.jsonl', 'two\n');
      assert.equal(readVaultSidecarText(vault, 'activity.jsonl')?.text, 'one\ntwo\n');
      assert.equal(removeVaultSidecarFile(vault, 'activity.jsonl'), true);
      assert.equal(removeVaultSidecarFile(vault, 'activity.jsonl'), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts only one basename directly below .ontology-atlas', () => {
    const { root, vault } = sandbox();
    try {
      for (const unsafe of ['', '.', '..', '../outside', 'nested/file.json']) {
        assertUnsafe(() => readVaultSidecarText(vault, unsafe));
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
