import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { rewriteLinkTarget, run } from './docs-move.mjs';

function fixture(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'docs-move-'));
  for (const [file, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), body);
  }
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('-c', 'user.email=t@example.com', '-c', 'user.name=Probe', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'seed');
  return root;
}

const read = (root, file) => readFileSync(path.join(root, file), 'utf8');

test('moves a document, rewrites links both ways, leaves history alone, and is idempotent', () => {
  const root = fixture({
    'docs/.moved.json': JSON.stringify({ 'docs/LOGO.md': 'docs/design/logo.md' }),
    'docs/LOGO.md': '# Logo\n\nSee [the system](DESIGN-SYSTEM.md#rules) and `docs/ARCHITECTURE.md`.\n',
    'docs/DESIGN-SYSTEM.md': '# Rules\n\n[Logo](./LOGO.md#palette) and [slug](/LOGO).\n',
    'docs/ARCHITECTURE.md': '# Architecture\n',
    'docs/DECISIONS.md': 'Frozen: [logo](LOGO.md).\n',
    'src/a.ts': '// palette: docs/LOGO.md §2, see LOGO.md\n',
    'src/b.ts': '// unrelated LOGO.md mention\n',
  });
  try {
    const first = run({ root });
    assert.deepEqual(first.moved, ['docs/LOGO.md -> docs/design/logo.md']);
    assert.equal(read(root, 'docs/design/logo.md'), '# Logo\n\nSee [the system](../DESIGN-SYSTEM.md#rules) and `docs/ARCHITECTURE.md`.\n');
    assert.equal(read(root, 'docs/DESIGN-SYSTEM.md'), '# Rules\n\n[Logo](./design/logo.md#palette) and [slug](/design/logo).\n');
    assert.equal(read(root, 'src/a.ts'), '// palette: docs/design/logo.md §2, see docs/design/logo.md\n');
    // A bare name in a file that never cites the full path is left for a person.
    assert.equal(read(root, 'src/b.ts'), '// unrelated LOGO.md mention\n');
    assert.deepEqual(first.leftovers, ['src/b.ts: bare LOGO.md']);
    // Frozen history is byte-identical.
    assert.equal(read(root, 'docs/DECISIONS.md'), 'Frozen: [logo](LOGO.md).\n');

    const second = run({ root });
    assert.deepEqual(second.moved, []);
    assert.deepEqual(second.changed, []);
    assert.deepEqual(run({ root, check: true }).problems, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('--check fails while an old path is still cited', () => {
  const root = fixture({
    'docs/.moved.json': JSON.stringify({ 'docs/OLD.md': 'docs/area/new.md' }),
    'docs/area/new.md': '# New\n',
    'README.md': 'Read `docs/OLD.md`.\n',
  });
  try {
    assert.deepEqual(run({ root, check: true }).problems, ['README.md still cites a moved path']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a link that already resolves where it sits is never touched', () => {
  const root = fixture({ 'docs/A.md': '# A\n' });
  try {
    const context = { file: 'docs/B.md', formerFile: 'docs/B.md', map: {}, reverse: {}, root };
    assert.equal(rewriteLinkTarget('A.md#x', context), 'A.md#x');
    assert.equal(rewriteLinkTarget('https://example.com/A.md', context), 'https://example.com/A.md');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
