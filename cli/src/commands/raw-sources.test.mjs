import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  RAW_SOURCE_PATH,
  RAW_SOURCE_TEXT,
  makeRawSourceVault,
} from '../../../tests/fixtures/raw-source-vault.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'index.mjs');

let vault;

function atlas(...args) {
  const run = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { code: run.status, stdout: run.stdout, stderr: run.stderr };
}

before(() => {
  vault = makeRawSourceVault();
});

after(() => rmSync(vault, { recursive: true, force: true }));

test('list and find answer with the real domain only, not the raw source beside it', () => {
  const listed = JSON.parse(atlas('list', vault, '--json').stdout);
  assert.deepEqual(listed.nodes.map((node) => node.slug), ['domains/planning']);
  const found = JSON.parse(atlas('find', 'roadmap', vault, '--json').stdout);
  assert.deepEqual(found.matches, []);
});

test('validate names the raw source once, as kind-under-sources, and exits 0', () => {
  const run = atlas('validate', `--vault=${vault}`, '--json');
  const report = JSON.parse(run.stdout);
  assert.deepEqual(
    report.problems.map((problem) => [problem.file, problem.issues.map((issue) => issue.code)]),
    [[RAW_SOURCE_PATH, ['kind-under-sources']]],
  );
  assert.equal(run.code, 0);
});

test('wiki-validate still resolves a citation into sources/', () => {
  const report = JSON.parse(atlas('wiki-validate', vault, '--json').stdout);
  assert.deepEqual(report.pages.map((entry) => [entry.page, entry.ok]), [['wiki/roadmap-notes.md', true]]);
});

test('add refuses a node slug under sources/ and writes nothing', () => {
  const run = atlas('add', 'domain', 'sources/Planning/next', '--title=Next', '--raw-slug', `--vault=${vault}`);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /must not name a file under sources\//);
  assert.equal(existsSync(join(vault, 'sources/Planning/next.md')), false);
  assert.equal(readFileSync(join(vault, RAW_SOURCE_PATH), 'utf8'), RAW_SOURCE_TEXT);
});
