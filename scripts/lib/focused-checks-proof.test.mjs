import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { contentTree, covers, proofFile, proofToRecord, recordProof, treeOf } from './focused-checks-proof.mjs';

const edge = (from, to) => ({ from, to, at: 'now' });
const CLI = new URL('./focused-checks-proof.mjs', import.meta.url).pathname;

test('covers follows proof edges from the base tree to the head tree', () => {
  const cases = [
    ['equal trees', 'a', 'a', [], true],
    ['one edge', 'a', 'b', [edge('a', 'b')], true],
    ['a two-edge chain', 'a', 'c', [edge('b', 'c'), edge('a', 'b')], true],
    ['a gap', 'a', 'd', [edge('a', 'b'), edge('c', 'd')], false],
    ['a cycle', 'a', 'z', [edge('a', 'b'), edge('b', 'a')], false],
    ['a reversed edge', 'b', 'a', [edge('a', 'b')], false],
  ];
  for (const [title, from, to, proofs, expected] of cases) {
    assert.equal(covers({ from, to, proofs }), expected, title);
  }
});

test('recordProof keeps the newest 200 lines and skips a no-op', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-proof-record-'));
  try {
    const file = join(dir, 'proofs.jsonl');
    recordProof({ from: 'x', to: 'x', file });
    assert.throws(() => readFileSync(file, 'utf8'));
    for (let index = 0; index < 205; index += 1) {
      recordProof({ from: `f${index}`, to: `t${index}`, file, now: () => 'now' });
    }
    const lines = readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(lines.length, 200);
    assert.equal(lines[0].from, 'f5');
    assert.equal(lines.at(-1).to, 't204');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a recorded proof lets the CLI cover a later commit and only that one', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'atlas-proof-repo-'));
  try {
    const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    const covered = (rev) => spawnSync('node', [CLI, `--covers=${rev}`], { cwd }).status;
    git('init');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFileSync(join(cwd, 'a.txt'), 'one');
    git('add', '.');
    git('commit', '-m', 'a');
    const base = git('rev-parse', 'HEAD');
    writeFileSync(join(cwd, 'a.txt'), 'two');
    writeFileSync(join(cwd, 'new.txt'), 'untracked');
    git('diff', '--cached', '--quiet');
    const content = contentTree({ cwd });
    git('diff', '--cached', '--quiet');
    recordProof({ from: treeOf(base, { cwd }), to: content, file: proofFile({ cwd }) });
    git('add', '.');
    git('commit', '-m', 'b');
    assert.equal(treeOf('HEAD', { cwd }), content);
    assert.equal(covered(base), 0);
    writeFileSync(join(cwd, 'a.txt'), 'three');
    git('commit', '-am', 'c');
    assert.equal(covered(base), 1);
    assert.equal(covered('no-such-rev'), 1);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

const RECORD_CASES = [
  ['content unchanged during the run', { from: 'base', before: 'c1', after: 'c1' }, { from: 'base', to: 'c1' }],
  ['content edited during the run', { from: 'base', before: 'c1', after: 'c2' }, null],
  ['content unreadable before the run', { from: 'base', before: null, after: 'c1' }, null],
  ['nothing changed since the base', { from: 'c1', before: 'c1', after: 'c1' }, null],
];
for (const [name, input, expected] of RECORD_CASES) {
  test(`a passed run with ${name} records ${expected ? 'a proof' : 'nothing'}`, () => assert.deepEqual(proofToRecord(input), expected));
}
