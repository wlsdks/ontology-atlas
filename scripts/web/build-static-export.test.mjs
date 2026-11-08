import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { buildInputsDigest, builtFrom, isBuildInput, runStaticBuild } from './build-static-export.mjs';

describe('which files the static export is built from', () => {
  const CASES = [
    ['src/views/home/ui/Home.tsx', true],
    ['docs/ontology/elements/map.md', true],
    ['scripts/docs-vault/build-docs-vault.mjs', true],
    ['messages/en/Map.json', true],
    ['tests/e2e/map.spec.ts', false],
    ['src/shared/lib/slug.test.ts', false],
    ['scripts/web/build-static-export.test.mjs', false],
    ['.claude/rules/testing.md', false],
    ['.github/workflows/e2e.yml', false],
  ];
  for (const [path, expected] of CASES) {
    it(`${path} → ${expected ? 'input' : 'not an input'}`, () => assert.equal(isBuildInput(path), expected));
  }
});

describe('build stamp', () => {
  it('changes with a source edit or a new public variable, not with a spec edit', () => {
    const root = mkdtempSync(join(tmpdir(), 'build-static-'));
    try {
      const put = (path, text) => {
        mkdirSync(join(root, path, '..'), { recursive: true });
        writeFileSync(join(root, path), text);
      };
      spawnSync('git', ['init', '-q'], { cwd: root });
      put('src/a.ts', 'export const a = 1;\n');
      put('tests/e2e/a.spec.ts', 'test 1\n');
      const first = buildInputsDigest({ cwd: root, env: {} });
      put('tests/e2e/a.spec.ts', 'test 2\n');
      assert.equal(buildInputsDigest({ cwd: root, env: {} }), first);
      assert.notEqual(buildInputsDigest({ cwd: root, env: { NEXT_PUBLIC_X: '1' } }), first);
      put('src/a.ts', 'export const a = 2;\n');
      const edited = buildInputsDigest({ cwd: root, env: {} });
      assert.notEqual(edited, first);

      assert.equal(builtFrom(edited, { cwd: root }), false, 'no out/ yet');
      put('out/index.html', '<html></html>');
      put('out/.build-inputs', `${edited}\n`);
      assert.equal(builtFrom(edited, { cwd: root }), true);
      assert.equal(builtFrom(first, { cwd: root }), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('build input stability', () => {
  it('refuses to certify output when a source changes during the build, then caches a stable rebuild', () => {
    const root = mkdtempSync(join(tmpdir(), 'build-static-race-'));
    try {
      spawnSync('git', ['init', '-q'], { cwd: root });
      writeFileSync(join(root, '.gitignore'), 'out/\n');
      mkdirSync(join(root, 'src'));
      writeFileSync(join(root, 'src/a.ts'), 'before');
      const env = {};
      const log = () => {};
      const result = runStaticBuild({ cwd: root, env, log, build: () => {
        mkdirSync(join(root, 'out'));
        writeFileSync(join(root, 'out/index.html'), 'built before');
        writeFileSync(join(root, 'src/a.ts'), 'after');
        return 0;
      } });
      assert.equal(result, 1);
      assert.equal(builtFrom(buildInputsDigest({ cwd: root, env }), { cwd: root }), false);
      let builds = 0;
      const build = () => { builds++; writeFileSync(join(root, 'out/index.html'), 'built after'); return 0; };
      assert.equal(runStaticBuild({ cwd: root, env, log, build }), 0);
      assert.equal(runStaticBuild({ cwd: root, env, log, build }), 0);
      assert.equal(builds, 1);
      writeFileSync(join(root, 'src/a.ts'), 'failed edit');
      assert.equal(runStaticBuild({ cwd: root, env, log, build: () => 1 }), 1);
      writeFileSync(join(root, 'src/a.ts'), 'after');
      assert.equal(builtFrom(buildInputsDigest({ cwd: root, env }), { cwd: root }), false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
