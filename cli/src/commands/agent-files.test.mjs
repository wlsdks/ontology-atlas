import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI_ENTRY = join(dirname(fileURLToPath(import.meta.url)), '../index.mjs');

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'oatlas-agent-files-'));
  mkdirSync(join(root, '.claude/skills/review'), { recursive: true });
  writeFileSync(join(root, '.claude/skills/review/SKILL.md'), '# Review\n\nReview a change.\n');
  return root;
}

function runJson(root) {
  const child = spawnSync(process.execPath, [CLI_ENTRY, 'agent-files', '--root', root, '--json'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(child.signal, null, 'agent-files hung until the 30 s hang detector stopped it');
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}

test('agent-files stops a self-loop link and lists each skill once', () => {
  const root = makeRepo();
  symlinkSync('.', join(root, '.claude/skills/loop'));
  try {
    const report = runJson(root);

    assert.deepEqual(report.files.map((file) => file.path), ['.claude/skills/review/SKILL.md']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('agent-files stops two self-loop links and lists each skill once', () => {
  const root = makeRepo();
  symlinkSync('.', join(root, '.claude/skills/loop-a'));
  symlinkSync('.', join(root, '.claude/skills/loop-b'));
  try {
    const report = runJson(root);

    assert.deepEqual(report.files.map((file) => file.path), ['.claude/skills/review/SKILL.md']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('agent-files skips a dangling link instead of failing', () => {
  const root = makeRepo();
  symlinkSync('../missing', join(root, '.claude/skills/gone'));
  try {
    const report = runJson(root);

    assert.deepEqual(report.files.map((file) => file.path), ['.claude/skills/review/SKILL.md']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('agent-files follows a link out of the repository and marks those files outside', () => {
  const root = makeRepo();
  const shared = mkdtempSync(join(tmpdir(), 'oatlas-agent-files-shared-'));
  mkdirSync(join(shared, 'deploy'), { recursive: true });
  writeFileSync(join(shared, 'deploy/SKILL.md'), '# Deploy\n\nShip a release.\n');
  symlinkSync(shared, join(root, '.claude/skills/shared'));
  try {
    const report = runJson(root);

    assert.deepEqual(
      report.files.map(({ path, outside }) => ({ path, outside })),
      [
        { path: '.claude/skills/review/SKILL.md', outside: undefined },
        {
          path: '.claude/skills/shared/deploy/SKILL.md',
          outside: realpathSync(join(shared, 'deploy/SKILL.md')),
        },
      ],
    );
    assert.equal('outside' in report.files[0], false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(shared, { recursive: true, force: true });
  }
});
