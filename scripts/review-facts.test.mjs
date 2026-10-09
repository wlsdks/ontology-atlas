import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';

import { collectFacts, formatFacts, main } from './review-facts.mjs';

const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
let repo;
let facts;

function write(path, body) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), body);
}

function git(...args) {
  return execFileSync('git', args, { cwd: repo, env: cleanEnv, encoding: 'utf8' });
}

before(() => {
  repo = mkdtempSync(join(tmpdir(), 'review-facts-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'fixture@example.com');
  git('config', 'user.name', 'fixture');
  write('scripts/tool.mjs', '// old note\nexport function keep() {}\nexport const gone = 1;\n');
  write('scripts/tool.test.mjs', "import { keep } from './tool.mjs';\n");
  write('scripts/big.mjs', 'const a = 1;\n');
  write('package.json', JSON.stringify({ dependencies: { left: '1.0.0', bump: '1.0.0' } }));
  write('.github/workflows/ci.yml', 'jobs:\n  a:\n    steps: []\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  git('branch', 'base');
  write('scripts/tool.mjs', 'export function keep() {}\nexport { keep as fresh };\n');
  write('scripts/big.mjs', 'const a = 1;\n'.repeat(801));
  write('package.json', JSON.stringify({ dependencies: { bump: '2.0.0', added: '0.1.0' } }));
  write('.github/workflows/ci.yml', 'jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@0123456789abcdef0123456789abcdef01234567\n');
  write('mcp/src/server.mjs', 'export const x = 1;\n');
  git('add', '.');
  git('commit', '-q', '-m', 'head');
  facts = collectFacts({ base: 'base', head: 'HEAD', cwd: repo, env: cleanEnv });
});

after(() => rmSync(repo, { recursive: true, force: true }));

test('files lists status, counts, and marks a source file over 800 lines that grew', () => {
  const big = facts.files.find((f) => f.path === 'scripts/big.mjs');
  assert.deepEqual([big.status, big.linesBefore, big.linesAfter, big.marks], ['M', 1, 801, ['>800', 'grew']]);
  assert.match(formatFacts(facts), /M scripts\/big\.mjs \+800\/-0 1→801 >800 grew/);
  const many = { ...facts, files: Array.from({ length: 300 }, (_, i) => ({ status: 'D', path: `docs/old-${i}.md`, added: 0, removed: 3, linesBefore: 3, linesAfter: 0, marks: [] })), security: ['src-tauri/src/lib.rs'] };
  const text = formatFacts(many);
  assert.match(text, /300 files \(300 D\)/);
  assert.match(text, /security:\n  src-tauri\/src\/lib\.rs/, 'sections a reviewer must see survive a large diff');
  assert.ok(text.split('\n').length < 100, 'the summary stays bounded');
});

test('exports reports added and removed names, including export-list aliases', () => {
  assert.deepEqual(facts.exports.find((e) => e.path === 'scripts/tool.mjs'), { path: 'scripts/tool.mjs', added: ['fresh'], removed: ['gone'] });
});

test('dependencies reports added, removed, re-versioned, and a non-SHA uses line', () => {
  const kinds = facts.dependencies.map((d) => `${d.kind}:${d.name}`).sort();
  assert.deepEqual(kinds, ['added:added', 'changed:bump', 'removed:left', 'unpinned-action:actions/checkout@v4']);
});

test('untested names a sibling test missing from the diff', () => {
  assert.deepEqual(facts.untested, [{ path: 'scripts/tool.mjs', tests: ['scripts/tool.test.mjs'] }]);
});

test('comments counts removed comment lines per file', () => {
  assert.deepEqual(facts.comments, [{ path: 'scripts/tool.mjs', removed: 1 }]);
});

test('security lists paths the security-surface rule matches', () => {
  assert.deepEqual(facts.security, ['.github/workflows/ci.yml', 'mcp/src/server.mjs']);
});

test('--json prints the same data as JSON and exits 0', () => {
  let text = '';
  const code = main({ argv: ['--', '--base=base', '--json'], cwd: repo, env: cleanEnv, stdout: { write: (s) => { text += s; } } });
  assert.equal(code, 0);
  const parsed = JSON.parse(text);
  assert.deepEqual(Object.keys(parsed), ['base', 'head', 'files', 'exports', 'dependencies', 'untested', 'comments', 'security']);
  assert.equal(parsed.files.length, facts.files.length);
});
