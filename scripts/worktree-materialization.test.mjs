import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { prepareWorktree } from './prepare-worktree.mjs';

const SOURCE = new URL('..', import.meta.url).pathname;
const PREPARE = JSON.parse(readFileSync(join(SOURCE, 'package.json'), 'utf8')).scripts.prepare;
const UUID_A = '30000000-0000-4000-8000-000000000001';
const UUID_B = '30000000-0000-4000-8000-000000000002';
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const node = (cwd, ...args) => execFileSync(process.execPath, args, { cwd, encoding: 'utf8' }).trim();
const put = (root, path, body) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), body); };
const copy = (root, path) => { mkdirSync(dirname(join(root, path)), { recursive: true }); cpSync(join(SOURCE, path), join(root, path)); };
const hash = (body) => createHash('sha256').update(body).digest('hex');

const DECISIONS = `# Decisions\n\n## 2026-09-01 — Frozen base\n\n**Why**: base\n**Prior**: none\n**Decision**: base\n**Dissent**: none\n**Falsifier**: none\n**Owner**: test\n`;
const CHANGELOG = `# Changelog\n\n## 2026-09-01 · v1.0.0: Base\n\n**Added**: Base\n`;
const PILOT = `---\nstarted: 2026-09-01\ndecision_target: 20\ndecision_deadline: 2026-09-15\nsparse_extension_deadline: 2026-09-22\noutcome: pending\n---\n# Pilot\n\n## Structured runs\n| # | Date | Decision | Door | Route | Atlas outcome | Changes | Boundaries | Risk | First | Rebuttal | Delta | Unique contribution |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n| 1 | 2026-09-01 | base | two-way | solo | explain | rollback-cheap | truth=unchanged;transfer=unchanged;agent-write=unchanged;human-correction=unchanged | none | 0 | 0 | unchanged | none |\n\n## Outcome updates\n| Run | Date | Recovery proof | Owner clear | Boundary miss | Later result |\n|---|---|---|---|---|---|\n| 1 | 2026-09-01 | pending | pending | pending | pending |\n`;

function seed(root) {
  for (const path of [
    'scripts/build-docs-vault.mjs', 'scripts/new-record.mjs', 'scripts/prepare-worktree.mjs',
    'scripts/lib/parse-frontmatter.mjs', 'scripts/lib/record-ledgers.mjs',
    'scripts/lib/po-pilot-records.mjs', 'scripts/lib/po-pilot.mjs',
    'scripts/lib/po-risk-router.mjs', 'scripts/lib/decision-record-template.mjs',
  ]) copy(root, path);
  for (const path of ['.githooks/post-checkout', '.githooks/post-merge']) copy(root, path);
  put(root, '.gitignore', '/src/entities/docs-vault/data/\n/public/docs-vault/\n');
  put(root, 'package.json', JSON.stringify({ scripts: { prepare: PREPARE } }, null, 2));
  put(root, 'docs/DECISIONS.md', DECISIONS);
  put(root, 'docs/CHANGELOG.md', CHANGELOG);
  put(root, 'docs/PO-PILOT.md', PILOT);
  put(root, 'docs/GUIDE.md', '---\ntitle: Guide\n---\n# Guide\n');
  put(root, 'samples/storefront/README.md', '---\ntitle: Storefront\n---\n# Storefront\n');
  put(root, 'docs/records/legacy.json', JSON.stringify({ version: 1, documents: {
    'docs/DECISIONS.md': { sha256: hash(DECISIONS) },
    'docs/CHANGELOG.md': { sha256: hash(CHANGELOG) },
    'docs/PO-PILOT.md': { sha256: hash(PILOT) },
  } }, null, 2));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Worktree Probe');
  git(root, 'config', 'commit.gpgsign', 'false');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'fixture');
  node(root, 'scripts/build-docs-vault.mjs');
  git(root, 'config', 'core.hooksPath', '.githooks');
}

test('prepare configures Git when present, propagates config failure, and builds archives without Git', () => {
  const calls = [];
  const spawn = (command, args) => {
    calls.push([command, args]);
    if (command === 'git' && args[0] === 'rev-parse') return { status: 0, stdout: '/tmp/repo\n' };
    if (command === 'git') return { status: 9 };
    return { status: 0 };
  };
  assert.equal(prepareWorktree({ root: '/tmp/repo', spawn }), 9);
  assert.equal(calls.some(([command]) => command === process.execPath), false);

  calls.length = 0;
  const archiveSpawn = (command, args) => {
    calls.push([command, args]);
    return command === 'git' ? { status: 128, stderr: 'not a git repository' } : { status: 0 };
  };
  assert.equal(prepareWorktree({ root: '/tmp/archive', spawn: archiveSpawn }), 0);
  assert.deepEqual(calls.at(-1), [process.execPath, ['scripts/build-docs-vault.mjs']]);
});

test('parallel worktrees merge immutable records and every checkout materializes ignored outputs', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'atlas-worktree-materialization-'));
  const repo = join(scratch, 'repo');
  const left = join(scratch, 'left');
  const right = join(scratch, 'right');
  const cold = join(scratch, 'cold');
  const archive = join(scratch, 'archive');
  mkdirSync(repo);
  try {
    seed(repo);
    git(repo, 'worktree', 'add', '-qb', 'left', left);
    git(repo, 'worktree', 'add', '-qb', 'right', right);
    for (const [cwd, slug, id] of [[left, 'left-record', UUID_A], [right, 'right-record', UUID_B]]) {
      const body = join(cwd, 'decision.md');
      writeFileSync(body, `## 2026-09-13 — ${slug}\n\n**Why**: parallel\n**Prior**: 2026-09-01\n**Decision**: ${slug}\n**Dissent**: none\n**Falsifier**: conflict\n**Owner**: test\n`);
      node(cwd, 'scripts/new-record.mjs', '--kind=decision', '--date=2026-09-13', `--slug=${slug}`, `--input=${body}`, `--id=${id}`);
      rmSync(body);
      assert.equal(git(cwd, 'status', '--short', '--untracked-files=all'), `?? docs/records/decisions/2026-09-13-${slug}-${id}.md`);
      git(cwd, 'add', 'docs/records/decisions');
      git(cwd, 'commit', '-qm', slug);
    }
    git(repo, 'merge', '--no-edit', 'left');
    git(repo, 'merge', '--no-edit', 'right');
    const composed = node(repo, '--input-type=module', '-e', `import {readLedgerSource} from './scripts/lib/record-ledgers.mjs'; console.log(readLedgerSource('docs/DECISIONS.md',{root:process.cwd()}).content)`);
    assert.match(composed, /left-record/);
    assert.match(composed, /right-record/);
    const materialized = readFileSync(join(repo, 'public/docs-vault/DECISIONS.md'), 'utf8');
    assert.match(materialized, /left-record/);
    assert.match(materialized, /right-record/);
    assert.equal(git(repo, 'status', '--short'), '');

    const duplicate = join(repo, `docs/records/decisions/2026-09-13-duplicate-${UUID_A}.md`);
    writeFileSync(duplicate, `---\nid: ${UUID_A}\ndate: 2026-09-13\n---\n## 2026-09-13 — Duplicate\n\n**Why**: duplicate\n**Prior**: none\n**Decision**: duplicate\n**Dissent**: none\n**Falsifier**: none\n**Owner**: test\n`);
    assert.throws(
      () => node(repo, 'scripts/build-docs-vault.mjs'),
      /duplicate id/,
      'the real generator accepted duplicate fragments after a clean worktree merge',
    );
    rmSync(duplicate);

    git(scratch, 'clone', '-q', repo, cold);
    execFileSync('npm', ['run', 'prepare', '--silent'], { cwd: cold, encoding: 'utf8' });
    for (const path of ['src/entities/docs-vault/data/manifest.json', 'src/entities/docs-vault/data/content.json', 'public/docs-vault/DECISIONS.md']) {
      assert.equal(existsSync(join(cold, path)), true, `${path} was not materialized`);
      assert.equal(git(cold, 'check-ignore', path).length > 0, true, `${path} is not ignored`);
    }
    assert.equal(git(cold, 'status', '--short'), '');

    const tar = join(scratch, 'fixture.tar');
    execFileSync('git', ['archive', '--format=tar', `--output=${tar}`, 'HEAD'], { cwd: repo });
    mkdirSync(archive);
    execFileSync('tar', ['-xf', tar, '-C', archive]);
    assert.equal(existsSync(join(archive, '.git')), false);
    execFileSync('npm', ['run', 'prepare', '--silent'], { cwd: archive, encoding: 'utf8' });
    assert.equal(existsSync(join(archive, 'src/entities/docs-vault/data/manifest.json')), true);
    writeFileSync(join(archive, 'docs/DECISIONS.md'), `${DECISIONS}\nchanged after freeze\n`);
    assert.throws(
      () => execFileSync('npm', ['run', 'prepare', '--silent'], { cwd: archive, encoding: 'utf8', stdio: 'pipe' }),
      /Command failed/,
      'prepare hid a generated-document failure outside Git',
    );
  } finally {
    try { git(repo, 'worktree', 'remove', '--force', left); } catch {}
    try { git(repo, 'worktree', 'remove', '--force', right); } catch {}
    rmSync(scratch, { recursive: true, force: true });
  }
});
