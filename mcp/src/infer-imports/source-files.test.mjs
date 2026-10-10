import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { inferImports } from '../infer-imports.mjs';
import { discoverDeclaredWorkspacePackages } from './workspace-packages.mjs';
import { withRepo } from './repo-fixture.mjs';

test('node_modules / dist / .next ignored', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/a'), { recursive: true });
    mkdirSync(join(r, 'node_modules/foo'), { recursive: true });
    mkdirSync(join(r, 'dist'), { recursive: true });
    writeFileSync(join(r, 'src/a/index.ts'), 'export const a = 1;');
    writeFileSync(join(r, 'node_modules/foo/index.js'), 'should not be scanned');
    writeFileSync(join(r, 'dist/build.js'), 'also not scanned');
  });
  try {
    const r = inferImports(root);
    assert.equal(r.filesScanned, 1, 'files under node_modules and dist are not walked');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('coverage and .turbo folders are never read, even when named as source folders', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src', 'coverage'), { recursive: true });
    mkdirSync(join(r, 'coverage'), { recursive: true });
    mkdirSync(join(r, '.turbo'), { recursive: true });
    writeFileSync(join(r, 'src', 'index.ts'), 'export const a = 1;\n');
    writeFileSync(join(r, 'src', 'coverage', 'report.ts'), 'export const c = 1;\n');
    writeFileSync(join(r, 'coverage', 'report.ts'), 'export const c = 1;\n');
    writeFileSync(join(r, '.turbo', 'cache.ts'), 'export const t = 1;\n');
  });
  try {
    const result = inferImports(root, { sourceFolders: ['src', 'coverage', '.turbo'] });
    assert.equal(result.filesScanned, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a workspace package declared under coverage or .turbo is reported as ignored', () => {
  for (const folder of ['coverage', '.turbo']) {
    const root = withRepo((r) => {
      writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'workspace-root', private: true }));
      writeFileSync(join(r, 'pnpm-workspace.yaml'), `packages:\n  - '${folder}/pkg'\n`);
      mkdirSync(join(r, folder, 'pkg'), { recursive: true });
      writeFileSync(join(r, folder, 'pkg', 'package.json'), '{"name":"pkg"}\n');
    });
    try {
      const discovery = discoverDeclaredWorkspacePackages(root);
      assert.deepEqual(discovery.packages, [], folder);
      assert.ok(
        discovery.skipped.some((row) => row.reason === `workspace-declaration-ignored: ${folder}/pkg`),
        `${folder}: ${JSON.stringify(discovery.skipped)}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
