import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { importGraph, staleFiles } from './run-main-copy.mjs';

// Fixture repositories must never inherit a hook's GIT_DIR (lesson 390c0c51).
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

test('importGraph follows relative imports, including multi-line ones, and stops at built-ins', () => {
  const files = {
    'scripts/a.mjs': "import { b } from './b.mjs';\nimport {\n  c,\n} from './lib/c.mjs';\nimport fs from 'node:fs';\n",
    'scripts/b.mjs': "export { c } from './lib/c.mjs';\n",
    'scripts/lib/c.mjs': 'export const c = 1;\n',
  };
  assert.deepEqual(importGraph('scripts/a.mjs', (f) => files[f] ?? null), ['scripts/a.mjs', 'scripts/b.mjs', 'scripts/lib/c.mjs']);
  assert.equal(importGraph('scripts/a.mjs', (f) => (f === 'scripts/b.mjs' ? null : files[f])), null, 'a file main lacks means no copy to run');
});

test('staleFiles names every file whose content differs, a missing local file included', () => {
  const main = { a: '1', b: '2', c: '3' };
  const local = { a: '1', b: 'changed' };
  assert.deepEqual(staleFiles(['a', 'b', 'c'], (f) => main[f], (f) => local[f] ?? null), ['b', 'c']);
});

test('a checkout with an older script runs main\'s copy; an opt-out runs its own', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-main-copy-test-')));
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: cleanEnv, stdio: 'pipe' }).toString().trim();
  try {
    const origin = join(root, 'origin.git');
    const seed = join(root, 'seed');
    const clone = join(root, 'clone');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    mkdirSync(join(seed, 'scripts/lib'), { recursive: true });
    git(seed, 'init', '-q', '-b', 'main');
    git(seed, 'config', 'user.name', 'Fixture');
    git(seed, 'config', 'user.email', 'fixture@example.invalid');
    const write = (dir, body) => {
      writeFileSync(join(dir, 'scripts/entry.mjs'), `import { word } from './lib/word.mjs';\nconsole.log(word, process.argv.slice(2).join(' '));\n`);
      writeFileSync(join(dir, 'scripts/lib/word.mjs'), `export const word = '${body}';\n`);
    };
    write(seed, 'old');
    git(seed, 'add', '.');
    git(seed, 'commit', '-q', '-m', 'old');
    git(seed, 'remote', 'add', 'origin', origin);
    git(seed, 'push', '-q', 'origin', 'main');
    git(root, 'clone', '-q', origin, clone);
    write(seed, 'new');
    git(seed, 'commit', '-q', '-am', 'new');
    git(seed, 'push', '-q', 'origin', 'main');

    const moduleUrl = new URL('./run-main-copy.mjs', import.meta.url).href;
    const run = (extraEnv = {}) => spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { runMainCopyIfStale } from ${JSON.stringify(moduleUrl)};
      const status = runMainCopyIfStale({ entry: 'scripts/entry.mjs', argv: ['--flag'] });
      if (status === null) console.log('ran local');
      else process.exitCode = status;
    `], { cwd: clone, encoding: 'utf8', env: { ...cleanEnv, ...extraEnv } });

    const stale = run();
    assert.equal(stale.status, 0, stale.stderr);
    assert.match(stale.stdout, /^new --flag$/m, 'the clone still has "old"; main\'s copy must be what ran');
    assert.match(stale.stderr, /scripts\/lib\/word\.mjs/, 'names the file that differs');

    const optOut = run({ ATLAS_PR_LAND_LOCAL: '1' });
    assert.match(optOut.stdout, /ran local/);

    git(clone, 'pull', '-q', 'origin', 'main');
    assert.match(run().stdout, /ran local/, 'a current checkout runs its own copy');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
