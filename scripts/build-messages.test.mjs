import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { buildMessages, composeAll, composeLocale, splitComposite } from './build-messages.mjs';

// Run from a Git hook (pre-push lanes), GIT_DIR and friends point at the real
// repository, and every fixture command below would rewrite it instead of the temp
// repository: its config, its branches and this worktree's HEAD. Measured on
// 2026-09-26 during this file's first push. The fixtures own their repositories.
for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key];

const SOURCE = new URL('..', import.meta.url).pathname;
const SCRIPT = join(SOURCE, 'scripts/build-messages.mjs');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
const put = (root, path, body) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), body);
};
const run = (cwd, ...args) => spawnSync(process.execPath, ['scripts/build-messages.mjs', ...args], { cwd, encoding: 'utf8' });

function fixture({ hooks = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-messages-'));
  mkdirSync(join(root, 'scripts'));
  cpSync(SCRIPT, join(root, 'scripts/build-messages.mjs'));
  if (hooks) {
    for (const hook of ['post-checkout', 'post-merge', 'pre-commit']) cpSync(join(SOURCE, '.githooks', hook), join(root, '.githooks', hook));
  }
  put(root, '.gitignore', '/messages/*.json\n/messages/*.tmp\n');
  for (const locale of ['en', 'ko']) {
    put(root, `messages/${locale}/alpha.json`, `{\n  "title": "${locale} alpha",\n  "nested": { "a": "1" }\n}\n`);
    put(root, `messages/${locale}/beta.json`, `{\n  "title": "${locale} beta"\n}\n`);
  }
  return root;
}

test('the live catalogue splits and composes back byte for byte', () => {
  const { composites, problems } = composeAll(SOURCE);
  assert.deepEqual(problems, []);
  for (const [locale, text] of composites) {
    const parts = splitComposite(text, locale);
    assert.ok(parts.length > 1, `${locale} has namespaces`);
    assert.deepEqual(parts.map((part) => part.namespace), [...parts.map((part) => part.namespace)].sort());
    assert.equal(composeLocale(parts), text, `${locale} round trip changed bytes`);
  }
});

test('--check fails on a stale composite and on a namespace in one locale only', () => {
  const root = fixture();
  try {
    assert.equal(run(root, '--check').status, 1, 'a missing composite passed --check');
    assert.equal(run(root).status, 0);
    const check = run(root, '--check');
    assert.equal(check.status, 0, check.stderr);
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(root, 'messages/en.json'), 'utf8'))), ['alpha', 'beta']);

    put(root, 'messages/en/alpha.json', '{\n  "title": "edited"\n}\n');
    const stale = run(root, '--check');
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /stale or missing composite: messages\/en\.json/);
    assert.equal(run(root, '--validate').status, 0, '--validate must not read composites');
    assert.equal(run(root).status, 0);

    put(root, 'messages/en/gamma.json', '{}\n');
    for (const mode of ['--check', '--validate']) {
      const result = run(root, mode);
      assert.equal(result.status, 1, `${mode} accepted a namespace in one locale only`);
      assert.match(result.stderr, /namespace gamma is missing from messages\/ko\//);
    }
    put(root, 'messages/ko/gamma.json', '{}\n');
    assert.equal(run(root).status, 0);
    assert.equal(run(root, '--check').status, 0);

    put(root, 'messages/ko/gamma.json', '[]\n');
    assert.match(run(root, '--validate').stderr, /must hold one JSON object/);
    put(root, 'messages/ko/gamma.json', '{ "a": }\n');
    assert.match(run(root, '--validate').stderr, /invalid JSON/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a Windows checkout composes the same bytes and an unchanged composite is not rewritten', () => {
  const root = fixture();
  try {
    buildMessages({ root });
    const before = readFileSync(join(root, 'messages/ko.json'), 'utf8');
    put(root, 'messages/ko/beta.json', '{\r\n  "title": "ko beta"\r\n}\r\n');
    assert.deepEqual(buildMessages({ root }).written, []);
    assert.equal(readFileSync(join(root, 'messages/ko.json'), 'utf8'), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a hand edit of the composite moves into its part instead of being overwritten', () => {
  const root = fixture();
  try {
    assert.equal(run(root).status, 0);
    const composite = join(root, 'messages/en.json');
    writeFileSync(composite, readFileSync(composite, 'utf8').replace('"en beta"', '"en beta, edited in the composite"'));
    const carried = run(root);
    assert.equal(carried.status, 0, carried.stderr);
    assert.match(carried.stdout, /carried a hand edit of messages\/en\.json into messages\/en\/beta\.json/);
    assert.equal(JSON.parse(readFileSync(join(root, 'messages/en/beta.json'), 'utf8')).title, 'en beta, edited in the composite');
    assert.equal(run(root, '--check').status, 0);

    // Parts and composite both moved: nothing is overwritten, and the reader is told.
    writeFileSync(composite, readFileSync(composite, 'utf8').replace('"en alpha"', '"composite side"'));
    put(root, 'messages/en/beta.json', '{\n  "title": "part side"\n}\n');
    const refused = run(root);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /differs from its last composition and its parts changed too/);
    assert.match(readFileSync(composite, 'utf8'), /composite side/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('two branches editing different namespaces merge without conflict and the merge composes', () => {
  const repo = fixture({ hooks: true });
  try {
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Messages Probe');
    git(repo, 'config', 'commit.gpgsign', 'false');
    git(repo, 'config', 'core.hooksPath', '.githooks');
    git(repo, 'add', '.gitignore', '.githooks', 'scripts', 'messages/en', 'messages/ko');
    git(repo, 'commit', '-qm', 'base');
    assert.equal(run(repo).status, 0);

    git(repo, 'switch', '-qc', 'left');
    for (const locale of ['en', 'ko']) put(repo, `messages/${locale}/alpha.json`, `{\n  "title": "${locale} alpha",\n  "nested": { "a": "1" },\n  "left": "L"\n}\n`);
    git(repo, 'add', 'messages/en', 'messages/ko');
    git(repo, 'commit', '-qm', 'left copy');

    git(repo, 'switch', '-q', 'main');
    git(repo, 'switch', '-qc', 'right');
    for (const locale of ['en', 'ko']) put(repo, `messages/${locale}/beta.json`, `{\n  "title": "${locale} beta",\n  "right": "R"\n}\n`);
    // A brand-new namespace is two new files: nothing shared to edit.
    for (const locale of ['en', 'ko']) put(repo, `messages/${locale}/delta.json`, '{\n  "new": "D"\n}\n');
    git(repo, 'add', 'messages/en', 'messages/ko');
    git(repo, 'commit', '-qm', 'right copy');

    git(repo, 'switch', '-q', 'main');
    git(repo, 'merge', '-q', '--no-edit', 'left');
    git(repo, 'merge', '-q', '--no-edit', 'right');
    assert.equal(git(repo, 'status', '--short'), '', 'merge left conflicts or untracked output');
    for (const locale of ['en', 'ko']) {
      const composite = JSON.parse(readFileSync(join(repo, `messages/${locale}.json`), 'utf8'));
      assert.equal(composite.alpha.left, 'L');
      assert.equal(composite.beta.right, 'R');
      assert.equal(composite.delta.new, 'D');
      assert.ok(git(repo, 'check-ignore', `messages/${locale}.json`), 'the composite is not ignored');
    }
    assert.equal(run(repo, '--check').status, 0);

    // The composite can never be committed again.
    const forced = spawnSync('git', ['add', '-f', 'messages/en.json'], { cwd: repo, encoding: 'utf8' });
    assert.equal(forced.status, 0);
    const refused = spawnSync('git', ['commit', '-qm', 'composite'], { cwd: repo, encoding: 'utf8' });
    assert.notEqual(refused.status, 0, 'pre-commit accepted a composite');
    assert.match(refused.stdout + refused.stderr, /generated from messages\/<locale>\/<Namespace>\.json/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('--adopt carries a pre-split branch edit onto the parts after merging the split', () => {
  const repo = mkdtempSync(join(tmpdir(), 'atlas-messages-adopt-'));
  try {
    const catalogue = (locale, alpha, beta) => composeLocale([
      { namespace: 'alpha', text: `{\n  "title": "${alpha}"\n}\n` },
      { namespace: 'beta', text: `{\n  "title": "${beta}"\n}\n` },
    ]);
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Messages Probe');
    git(repo, 'config', 'commit.gpgsign', 'false');
    put(repo, 'messages/en.json', catalogue('en', 'a', 'b'));
    put(repo, 'messages/ko.json', catalogue('ko', 'a', 'b'));
    git(repo, 'add', 'messages');
    git(repo, 'commit', '-qm', 'single-file catalogue');

    git(repo, 'switch', '-qc', 'old-branch');
    put(repo, 'messages/en.json', catalogue('en', 'a from branch', 'b'));
    git(repo, 'commit', '-qam', 'branch copy');

    git(repo, 'switch', '-q', 'main');
    mkdirSync(join(repo, 'scripts'));
    cpSync(SCRIPT, join(repo, 'scripts/build-messages.mjs'));
    put(repo, '.gitignore', '/messages/*.json\n');
    for (const locale of ['en', 'ko']) {
      for (const part of splitComposite(readFileSync(join(repo, `messages/${locale}.json`), 'utf8'))) {
        put(repo, `messages/${locale}/${part.namespace}.json`, part.text);
      }
    }
    put(repo, 'messages/en/beta.json', '{\n  "title": "b from main"\n}\n');
    git(repo, 'rm', '-q', '--cached', 'messages/en.json', 'messages/ko.json');
    git(repo, 'add', '.gitignore', 'scripts', 'messages/en', 'messages/ko');
    git(repo, 'commit', '-qm', 'split');

    git(repo, 'switch', '-q', 'old-branch');
    const merge = spawnSync('git', ['merge', 'main'], { cwd: repo, encoding: 'utf8' });
    assert.notEqual(merge.status, 0, 'the fixture should reproduce the modify/delete conflict');
    const adopt = spawnSync(process.execPath, ['scripts/build-messages.mjs', '--adopt'], { cwd: repo, encoding: 'utf8' });
    assert.equal(adopt.status, 0, adopt.stderr);
    const alpha = JSON.parse(readFileSync(join(repo, 'messages/en/alpha.json'), 'utf8'));
    const beta = JSON.parse(readFileSync(join(repo, 'messages/en/beta.json'), 'utf8'));
    assert.equal(alpha.title, 'a from branch', 'the branch edit was lost');
    assert.equal(beta.title, 'b from main', 'the upstream edit was overwritten');
    assert.equal(existsSync(join(repo, 'messages/en/.beta.adopt.mine')), false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('accepts the separator pnpm passes through (pnpm messages:build -- --help)', () => {
  const script = new URL('./build-messages.mjs', import.meta.url).pathname;
  const result = spawnSync(process.execPath, [script, '--', '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: node scripts\/build-messages\.mjs/);
});
