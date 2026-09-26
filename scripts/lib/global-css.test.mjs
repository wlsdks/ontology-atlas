import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { censusFor, designSpecChangesBetween, specTextAt, specTriggerPath } from './design-spec-census.mjs';
import { locateGlobalCssLine, readGlobalCss, readGlobalCssAt } from './global-css.mjs';

const repo = mkdtempSync(path.join(tmpdir(), 'global-css-'));
after(() => rmSync(repo, { recursive: true, force: true }));

const git = (...args) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd: repo,
    stdio: 'ignore',
  });
const write = (file, text) => {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  writeFileSync(path.join(repo, file), text);
};

git('init', '-q');
write('app/globals.css', '@import "tailwindcss";\n.a { color: red; }\n');
git('add', '.');
git('commit', '-qm', 'before split');
write('app/globals.css', '@import "tailwindcss";\n@import "./styles/one.css";\n');
write('app/styles/one.css', '.a { color: red; }\n');
git('add', '.');
git('commit', '-qm', 'split');

test('joins the parts into the entry in import order', () => {
  assert.equal(readGlobalCss(repo), '@import "tailwindcss";\n.a { color: red; }\n');
});

test('reads the joined stylesheet at a ref, after and before the split', () => {
  assert.equal(readGlobalCssAt('HEAD', repo), '@import "tailwindcss";\n.a { color: red; }\n');
  assert.equal(readGlobalCssAt('HEAD~1', repo), '@import "tailwindcss";\n.a { color: red; }\n');
});

test('an absent entry at a ref is null, not an empty stylesheet', () => {
  assert.equal(readGlobalCssAt('does-not-exist', repo), null);
});

test('the design-spec census reads ramp tokens through the parts', () => {
  assert.equal(specTextAt('HEAD', 'app/globals.css', repo), readGlobalCss(repo));
  assert.equal(censusFor('app/globals.css', ':root { --text-body: 13px; }').size, 1);
  assert.equal(specTriggerPath('app/styles/one.css'), 'app/globals.css');
  assert.equal(specTriggerPath('src/a.ts'), 'src/a.ts');
});

test('a ramp change made only in an app/styles part reaches the spec census', () => {
  write('app/styles/one.css', ':root { --text-body: 13px; }\n');
  git('add', '.');
  git('commit', '-qm', 'ramp in a part');
  write('app/styles/one.css', ':root { --text-body: 14px; }\n');
  git('add', '.');
  git('commit', '-qm', 'ramp value change');
  const found = designSpecChangesBetween(
    'HEAD~1',
    'HEAD',
    new Set(['app/styles/one.css']),
    ['app/globals.css'],
    repo,
  );
  assert.equal(found.length, 1);
  assert.match(found[0], /--text-body/);
  // Before the split, the entry itself held the tokens; that base still compares.
  assert.equal(
    designSpecChangesBetween('HEAD~3', 'HEAD', new Set(['app/globals.css']), ['app/globals.css'], repo)
      .length > 0,
    true,
  );
});

test('maps a joined line back to the part that holds it', () => {
  assert.deepEqual(locateGlobalCssLine(1, repo), { file: 'app/globals.css', line: 1 });
  assert.deepEqual(locateGlobalCssLine(2, repo), { file: 'app/styles/one.css', line: 1 });
});
