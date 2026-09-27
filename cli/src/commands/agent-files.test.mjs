import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

function runAgentFiles(root) {
  const child = spawnSync(process.execPath, [CLI_ENTRY, 'agent-files', '--root', root, '--json'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(child.signal, null, 'agent-files hung until the 30 s hang detector stopped it');
  return child;
}

function runJson(root, expectedStatus = 0) {
  const child = runAgentFiles(root);
  assert.equal(child.status, expectedStatus, child.stderr);
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

test('agent-files keeps a folder reached through an alias link and still sees its stale copy', () => {
  const root = makeRepo();
  symlinkSync('review', join(root, '.claude/skills/a-review'));
  mkdirSync(join(root, '.agents/skills/review'), { recursive: true });
  writeFileSync(join(root, '.agents/skills/review/SKILL.md'), '# Review\n\nAn older copy.\n');
  try {
    const report = runJson(root, 1);

    assert.deepEqual(report.files.map((file) => file.path), [
      '.agents/skills/review/SKILL.md',
      '.claude/skills/a-review/SKILL.md',
      '.claude/skills/review/SKILL.md',
    ]);
    assert.deepEqual(
      report.drift.map(({ code, path }) => ({ code, path })),
      [{ code: 'skill-copy-diverged', path: 'review/SKILL.md' }],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('agent-files walks a mirrored skill tree linked from .agents/skills', () => {
  const root = makeRepo();
  mkdirSync(join(root, '.agents'), { recursive: true });
  symlinkSync('../.claude/skills', join(root, '.agents/skills'));
  try {
    const report = runJson(root);

    assert.deepEqual(report.files.map((file) => file.path), [
      '.agents/skills/review/SKILL.md',
      '.claude/skills/review/SKILL.md',
    ]);
    assert.equal(report.checks.skillCopy.status, 'ok');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test(
  'agent-files fails on an unreadable skill folder instead of reporting it in sync',
  { skip: process.getuid?.() === 0 },
  () => {
    for (const mode of [0o000, 0o444]) {
      const root = makeRepo();
      const locked = join(root, '.claude/skills/locked');
      mkdirSync(locked);
      writeFileSync(join(locked, 'SKILL.md'), '# Locked\n');
      chmodSync(locked, mode);
      try {
        const child = runAgentFiles(root);

        assert.equal(child.status, 2, `mode ${mode.toString(8)}: ${child.stdout}`);
        assert.match(child.stderr, /EACCES/);
      } finally {
        chmodSync(locked, 0o755);
        rmSync(root, { recursive: true, force: true });
      }
    }
  },
);

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
          outside: realpathSync.native(join(shared, 'deploy/SKILL.md')),
        },
      ],
    );
    assert.equal('outside' in report.files[0], false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(shared, { recursive: true, force: true });
  }
});
