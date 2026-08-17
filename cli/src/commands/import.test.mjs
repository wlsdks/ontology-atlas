import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runImport } from './import.mjs';

describe('runImport — source traversal', () => {
  let root;
  let source;
  let vault;
  let stdoutWrite;
  let stderrWrite;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ontology-atlas-import-test-')));
    source = join(root, 'source');
    vault = join(root, 'vault');
    mkdirSync(source);
    mkdirSync(vault);
    stdoutWrite = process.stdout.write;
    stderrWrite = process.stderr.write;
    process.stdout.write = () => true;
    process.stderr.write = () => true;
  });

  afterEach(() => {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
    rmSync(root, { recursive: true, force: true });
  });

  it('does not follow a nested directory symlink outside the selected source tree', async () => {
    const external = join(root, 'external');
    mkdirSync(external);
    writeFileSync(
      join(external, 'leak.md'),
      '---\nkind: domain\ntitle: External document\n---\n',
      'utf-8',
    );
    symlinkSync(
      external,
      join(source, 'linked-external'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    const code = await runImport([source, '--vault', vault]);

    assert.equal(code, 1);
    assert.equal(existsSync(join(vault, 'domains/leak.md')), false);
  });
});
