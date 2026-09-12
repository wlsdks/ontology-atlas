import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  classifyConflictPaths,
  mergeAppendOnlyLedger,
  resolveRepositoryConflicts,
} from './resolve-docs-vault-conflicts.mjs';

const tempRoots = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const CHANGELOG_BASE = `# CHANGELOG

> Newest at the top.

---

## 2026-08-28 · Existing release

- existing changelog fact
`;

const DECISIONS_BASE = `# DECISIONS

> Entries are append-only.

## Record contract

\`\`\`md
## YYYY-MM-DD — Example only
\`\`\`

## 2026-08-28 — Existing decision

**Decision**: keep the existing fact.
`;

function prependRecord(base, record) {
  const boundary = base.search(/^## \d{4}-\d{2}-\d{2}(?=\s|$)/m);
  assert.notEqual(boundary, -1, 'fixture needs one dated record');
  return `${base.slice(0, boundary).trimEnd()}\n\n${record.trim()}\n\n${base.slice(boundary)}`;
}

describe('mergeAppendOnlyLedger', () => {
  it('keeps both concurrent records in one deterministic merge', () => {
    const a = `## 2026-08-29 · Worktree A\n\n- A fact`;
    const b = `## 2026-08-29 · Worktree B\n\n- B fact`;
    const ours = prependRecord(CHANGELOG_BASE, a);
    const theirs = prependRecord(CHANGELOG_BASE, b);

    const merged = mergeAppendOnlyLedger({
      path: 'docs/CHANGELOG.md',
      base: CHANGELOG_BASE,
      ours,
      theirs,
    });
    const reversed = mergeAppendOnlyLedger({
      path: 'docs/CHANGELOG.md',
      base: CHANGELOG_BASE,
      ours: theirs,
      theirs: ours,
    });

    assert.equal(merged, reversed, 'merge direction must not change ledger order');
    assert.equal(merged.match(/Worktree A/g)?.length, 1);
    assert.equal(merged.match(/Worktree B/g)?.length, 1);
    assert.equal(merged.match(/Existing release/g)?.length, 1);
    assert.doesNotMatch(merged, /<<<<<<<|=======|>>>>>>>/);
  });

  it('keeps nested non-date H2 sections inside their decision record', () => {
    const decision = `## 2026-08-29 — Concurrent decision

**Decision**: preserve the complete block.

## Council verdict

The nested verdict belongs to the dated record.`;
    const merged = mergeAppendOnlyLedger({
      path: 'docs/DECISIONS.md',
      base: DECISIONS_BASE,
      ours: prependRecord(DECISIONS_BASE, decision),
      theirs: DECISIONS_BASE,
    });

    assert.match(
      merged,
      /## 2026-08-29 — Concurrent decision[\s\S]*## Council verdict[\s\S]*nested verdict/,
    );
  });

  it('deduplicates the same record independently added by both sides', () => {
    const record = `## 2026-08-29 · Same record\n\n- one fact`;
    const side = prependRecord(CHANGELOG_BASE, record);
    const merged = mergeAppendOnlyLedger({
      path: 'docs/CHANGELOG.md',
      base: CHANGELOG_BASE,
      ours: side,
      theirs: side,
    });

    assert.equal(merged.match(/Same record/g)?.length, 1);
  });

  it('refuses a branch that rewrites an existing record', () => {
    assert.throws(
      () =>
        mergeAppendOnlyLedger({
          path: 'docs/CHANGELOG.md',
          base: CHANGELOG_BASE,
          ours: CHANGELOG_BASE.replace('existing changelog fact', 'rewritten fact'),
          theirs: CHANGELOG_BASE,
        }),
      /existing record.*changed|append-only/i,
    );
  });

  it('refuses incompatible preamble edits instead of choosing one', () => {
    assert.throws(
      () =>
        mergeAppendOnlyLedger({
          path: 'docs/CHANGELOG.md',
          base: CHANGELOG_BASE,
          ours: CHANGELOG_BASE.replace('Newest at the top', 'Ours'),
          theirs: CHANGELOG_BASE.replace('Newest at the top', 'Theirs'),
        }),
      /preamble/i,
    );
  });
});

describe('conflict boundary', () => {
  it('admits only the two authored ledgers and generated docs-vault outputs', () => {
    assert.deepEqual(
      classifyConflictPaths([
        'docs/CHANGELOG.md',
        'docs/DECISIONS.md',
        'public/docs-vault/CHANGELOG.md',
        'src/entities/docs-vault/data/content.json',
        'src/views/download/model/dogfood-census.generated.ts',
      ]),
      {
        ledgers: ['docs/CHANGELOG.md', 'docs/DECISIONS.md'],
        generated: [
          'public/docs-vault/CHANGELOG.md',
          'src/entities/docs-vault/data/content.json',
          'src/views/download/model/dogfood-census.generated.ts',
        ],
        unsupported: [],
      },
    );

    assert.deepEqual(classifyConflictPaths(['README.md']).unsupported, ['README.md']);
  });
});

describe('resolveRepositoryConflicts', () => {
  it('resolves a real Git merge, regenerates outputs, and stages the complete result', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-ledger-resolver-'));
    tempRoots.push(root);
    const git = (...args) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

    await mkdir(path.join(root, 'docs'), { recursive: true });
    await mkdir(path.join(root, 'public', 'docs-vault'), { recursive: true });
    await mkdir(path.join(root, 'src', 'entities', 'docs-vault', 'data'), {
      recursive: true,
    });
    await mkdir(path.join(root, 'src', 'views', 'download', 'model'), { recursive: true });
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Atlas Test');
    git('config', 'user.email', 'atlas@example.invalid');

    const regenerate = async ({ root: repoRoot }) => {
      const changelog = await readFile(path.join(repoRoot, 'docs', 'CHANGELOG.md'), 'utf8');
      const decisions = await readFile(path.join(repoRoot, 'docs', 'DECISIONS.md'), 'utf8');
      await writeFile(
        path.join(repoRoot, 'public', 'docs-vault', 'CHANGELOG.md'),
        changelog,
      );
      await writeFile(
        path.join(repoRoot, 'public', 'docs-vault', 'DECISIONS.md'),
        decisions,
      );
      await writeFile(
        path.join(repoRoot, 'src', 'entities', 'docs-vault', 'data', 'content.json'),
        `${JSON.stringify({ CHANGELOG: changelog, DECISIONS: decisions }, null, 2)}\n`,
      );
      await writeFile(
        path.join(repoRoot, 'src', 'views', 'download', 'model', 'dogfood-census.generated.ts'),
        `export const decisionSource = ${JSON.stringify(decisions)};\n`,
      );
    };
    const writeSources = async (changelog, decisions) => {
      await writeFile(path.join(root, 'docs', 'CHANGELOG.md'), changelog);
      await writeFile(path.join(root, 'docs', 'DECISIONS.md'), decisions);
      await regenerate({ root });
    };

    await writeSources(CHANGELOG_BASE, DECISIONS_BASE);
    git('add', '.');
    git('commit', '-qm', 'base');

    git('switch', '-qc', 'work-a');
    await writeSources(
      prependRecord(CHANGELOG_BASE, '## 2026-08-29 · Worktree A\n\n- A fact'),
      prependRecord(DECISIONS_BASE, '## 2026-08-29 — Worktree A\n\nA decision.'),
    );
    git('add', '.');
    git('commit', '-qm', 'A');

    git('switch', '-q', 'main');
    git('switch', '-qc', 'work-b');
    await writeSources(
      prependRecord(CHANGELOG_BASE, '## 2026-08-29 · Worktree B\n\n- B fact'),
      prependRecord(DECISIONS_BASE, '## 2026-08-29 — Worktree B\n\nB decision.'),
    );
    git('add', '.');
    git('commit', '-qm', 'B');

    const merge = spawnSync('git', ['merge', '--no-edit', 'work-a'], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(merge.status, 1, 'fixture must begin with a real merge conflict');
    const unmergedBefore = git('diff', '--name-only', '--diff-filter=U')
      .trim()
      .split('\n')
      .filter(Boolean);
    assert.ok(
      unmergedBefore.length >= 5,
      `fixture measured only ${unmergedBefore.length} conflict path(s)`,
    );

    const conflictBeforeRefusal = await readFile(
      path.join(root, 'docs', 'CHANGELOG.md'),
      'utf8',
    );
    const untrackedDoc = path.join(root, 'docs', 'untracked.md');
    await writeFile(untrackedDoc, '# Untracked authored input\n');
    await assert.rejects(
      resolveRepositoryConflicts({
        cwd: root,
        regenerate,
        verifyGenerated: async () => {},
      }),
      /untracked authored docs/i,
    );
    assert.equal(
      await readFile(path.join(root, 'docs', 'CHANGELOG.md'), 'utf8'),
      conflictBeforeRefusal,
      'a refusal must not partially rewrite the authored ledger',
    );
    await rm(untrackedDoc);

    const result = await resolveRepositoryConflicts({
      cwd: root,
      regenerate,
      verifyGenerated: async () => {},
    });

    assert.equal(git('diff', '--name-only', '--diff-filter=U').trim(), '');
    const changelog = await readFile(path.join(root, 'docs', 'CHANGELOG.md'), 'utf8');
    const decisions = await readFile(path.join(root, 'docs', 'DECISIONS.md'), 'utf8');
    const content = JSON.parse(
      await readFile(
        path.join(root, 'src', 'entities', 'docs-vault', 'data', 'content.json'),
        'utf8',
      ),
    );
    assert.match(changelog, /Worktree A/);
    assert.match(changelog, /Worktree B/);
    assert.match(decisions, /Worktree A/);
    assert.match(decisions, /Worktree B/);
    assert.equal(content.CHANGELOG, changelog);
    assert.equal(content.DECISIONS, decisions);
    assert.deepEqual(result.resolvedLedgers.sort(), [
      'docs/CHANGELOG.md',
      'docs/DECISIONS.md',
    ]);
    const cached = git('diff', '--cached', '--name-status');
    assert.match(cached, /D\s+src\/entities\/docs-vault\/data\/content\.json/);
    assert.match(cached, /D\s+public\/docs-vault\/CHANGELOG\.md/);
    assert.match(cached, /M\s+src\/views\/download\/model\/dogfood-census\.generated\.ts/);
    assert.doesNotMatch(
      git(
        'ls-files',
        'src/entities/docs-vault/data/content.json',
        'public/docs-vault/CHANGELOG.md',
        'public/docs-vault/DECISIONS.md',
      ),
      /\S/,
      'materialized Docs Vault outputs must leave the index',
    );
    assert.match(
      git('ls-files', 'src/views/download/model/dogfood-census.generated.ts'),
      /dogfood-census\.generated\.ts/,
      'the separately tracked generated exception stays tracked',
    );
  });

  it('resolves an old-branch modify against the ignored-output deletion and rematerializes locally', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-generated-delete-modify-'));
    tempRoots.push(root);
    const git = (...args) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const output = path.join(root, 'public', 'docs-vault', 'GUIDE.md');
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, 'base generated\n');
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Atlas Test');
    git('config', 'user.email', 'atlas@example.invalid');
    git('add', '.');
    git('commit', '-qm', 'base');

    git('switch', '-qc', 'old-agent');
    await writeFile(output, 'old branch generated\n');
    git('add', '.');
    git('commit', '-qm', 'old branch modifies generated output');

    git('switch', '-q', 'main');
    git('switch', '-qc', 'untracked-main');
    await writeFile(path.join(root, '.gitignore'), '/public/docs-vault/\n');
    git('rm', '-q', 'public/docs-vault/GUIDE.md');
    git('add', '.gitignore');
    git('commit', '-qm', 'stop tracking generated output');

    const merge = spawnSync('git', ['merge', '--no-edit', 'old-agent'], { cwd: root, encoding: 'utf8' });
    assert.equal(merge.status, 1, 'fixture must create a modify/delete conflict');

    const result = await resolveRepositoryConflicts({
      cwd: root,
      regenerate: async () => {
        await mkdir(path.dirname(output), { recursive: true });
        await writeFile(output, 'fresh local materialization\n');
      },
      verifyGenerated: async () => {
        assert.equal(await readFile(output, 'utf8'), 'fresh local materialization\n');
      },
    });

    assert.deepEqual(result.regenerated, ['public/docs-vault/GUIDE.md']);
    assert.equal(git('diff', '--name-only', '--diff-filter=U').trim(), '');
    assert.equal(git('ls-files', 'public/docs-vault/GUIDE.md').trim(), '');
    assert.equal(await readFile(output, 'utf8'), 'fresh local materialization\n');
    assert.doesNotMatch(git('status', '--short'), /public\/docs-vault/);
  });

  it('refuses legacy ledger merging once the immutable freeze policy exists', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-frozen-ledger-conflict-'));
    tempRoots.push(root);
    const git = (...args) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    await mkdir(path.join(root, 'docs', 'records'), { recursive: true });
    await writeFile(path.join(root, 'docs', 'CHANGELOG.md'), CHANGELOG_BASE);
    await writeFile(path.join(root, 'docs', 'records', 'legacy.json'), '{"version":1,"documents":{}}\n');
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Atlas Test');
    git('config', 'user.email', 'atlas@example.invalid');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('switch', '-qc', 'a');
    await writeFile(path.join(root, 'docs', 'CHANGELOG.md'), prependRecord(CHANGELOG_BASE, '## 2026-08-29 · A\n\n- A'));
    git('commit', '-qam', 'A');
    git('switch', '-q', 'main');
    git('switch', '-qc', 'b');
    await writeFile(path.join(root, 'docs', 'CHANGELOG.md'), prependRecord(CHANGELOG_BASE, '## 2026-08-29 · B\n\n- B'));
    git('commit', '-qam', 'B');
    spawnSync('git', ['merge', '--no-edit', 'a'], { cwd: root, encoding: 'utf8' });

    await assert.rejects(
      resolveRepositoryConflicts({ cwd: root, dryRun: true }),
      /legacy ledgers are frozen.*scripts\/new-record\.mjs/,
    );
    assert.match(git('diff', '--name-only', '--diff-filter=U'), /docs\/CHANGELOG\.md/);
  });
});
