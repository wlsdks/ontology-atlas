import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { inferImports } from '../infer-imports.mjs';
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
