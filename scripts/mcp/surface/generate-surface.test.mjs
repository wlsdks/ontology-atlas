import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GENERATOR = join(HERE, 'generate-surface.mjs');
const COMMITTED = resolve(HERE, '..', '..', '..', 'src-tauri', 'crates', 'mcp-server', 'surface');

function run(...args) {
  return spawnSync(process.execPath, [GENERATOR, ...args], { encoding: 'utf8' });
}

function withCopy(body) {
  const folder = mkdtempSync(join(tmpdir(), 'mcp-surface-'));
  try {
    cpSync(COMMITTED, folder, { recursive: true });
    return body(folder);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

test('the committed surface is what the registry produces now', () => {
  const result = run('--check');
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('a surface file that differs from the registry makes --check fail and name the command to run', () => {
  withCopy((folder) => {
    writeFileSync(join(folder, 'instructions.txt'), `${readFileSync(join(folder, 'instructions.txt'), 'utf8')}drift`);
    const result = run('--check', '--out-dir', folder);
    assert.equal(result.status, 1);
    assert.match(`${result.stderr}${result.stdout}`, /pnpm mcp:surface/);
  });
});

test('a missing surface file also fails --check', () => {
  withCopy((folder) => {
    rmSync(join(folder, 'registry.json'));
    assert.equal(run('--check', '--out-dir', folder).status, 1);
  });
});

test('generating into a folder writes exactly the four files the Rust server embeds', () => {
  const folder = mkdtempSync(join(tmpdir(), 'mcp-surface-'));
  try {
    assert.equal(run('--out-dir', folder).status, 0);
    assert.deepEqual(readdirSync(folder).sort(), ['guides.json', 'instructions.txt', 'registry.json', 'tools.json']);
    for (const name of readdirSync(folder)) {
      assert.equal(readFileSync(join(folder, name), 'utf8'), readFileSync(join(COMMITTED, name), 'utf8'), name);
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('an unknown option is refused', () => {
  assert.equal(run('--nope').status, 1);
});
