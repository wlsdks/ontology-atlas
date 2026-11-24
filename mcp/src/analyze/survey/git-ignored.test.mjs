import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { collectSourceUnits } from './source-units.mjs';

function write(root, files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

function git(root, ...args) {
  execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
}

function walked(root) {
  return collectSourceUnits(root).files.map((file) => file.path).sort();
}

test('a repository location inherited from the parent process changes nothing the walk counts', () => {
  const base = mkdtempSync(join(tmpdir(), 'atlas-git-ignored-'));
  const inherited = { GIT_DIR: process.env.GIT_DIR, GIT_INDEX_FILE: process.env.GIT_INDEX_FILE };
  try {
    const project = join(base, 'project');
    write(project, {
      '.gitignore': 'generated/\n',
      'src/app.ts': 'export function app() { return 1; }\n',
      'generated/schema.ts': 'export const schema = { version: 1 };\n',
    });
    git(project, 'init', '-q');
    git(project, 'add', '-f', 'generated/schema.ts');
    const other = join(base, 'other');
    mkdirSync(other);
    git(other, 'init', '-q');
    assert.deepEqual(walked(project), ['generated/schema.ts', 'src/app.ts'], 'fixture precondition: a tracked file under an ignored folder counts');
    process.env.GIT_DIR = join(other, '.git');
    process.env.GIT_INDEX_FILE = join(other, '.git', 'index');
    assert.deepEqual(walked(project), ['generated/schema.ts', 'src/app.ts']);
  } finally {
    for (const [name, value] of Object.entries(inherited)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(base, { recursive: true, force: true });
  }
});

test('a repository whose own config puts its work tree in another folder is walked whole', () => {
  const base = mkdtempSync(join(tmpdir(), 'atlas-git-ignored-'));
  try {
    write(base, {
      'repo/src/app.ts': 'export function app() { return 1; }\n',
      'repo/private/plan.ts': 'export function plan() { return 2; }\n',
      'elsewhere/.gitignore': 'src/\nprivate/\n',
      'elsewhere/src/app.ts': 'export function other() { return 3; }\n',
    });
    git(join(base, 'repo'), 'init', '-q');
    appendFileSync(join(base, 'repo', '.git', 'config'), `[core]\n\tworktree = ${join(base, 'elsewhere')}\n`);
    assert.deepEqual(walked(join(base, 'repo')), ['private/plan.ts', 'src/app.ts']);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
