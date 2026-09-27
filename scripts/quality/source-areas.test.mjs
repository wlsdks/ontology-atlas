import assert from 'node:assert/strict';
import test from 'node:test';

import { areaGate, sourceArea } from './source-areas.mjs';

test('assigns each path to its area', () => {
  const cases = {
    'src/widgets/ontology-map/model/a.ts': 'src/widgets',
    'src/middleware.ts': 'src',
    'app/[locale]/page.tsx': 'app',
    'tests/contract/a.contract.test.ts': 'tests/contract',
    'tests/setup.ts': 'tests',
    'mcp/src/index.js': 'mcp',
    'cli/src/lib/a.mjs': 'cli',
    'scripts/quality/source-areas.mjs': 'scripts',
    'src-tauri/src/lib.rs': 'src-tauri',
    '.claude/hooks/a.sh': 'harness',
    '.github/workflows/ci.yml': 'harness',
    'eslint.config.mjs': 'root',
    'e2e/a.spec.ts': 'root',
  };
  for (const [path, area] of Object.entries(cases)) assert.equal(sourceArea(path), area, path);
});

test('excludes docs, public assets, samples and generated vault data', () => {
  for (const path of [
    'docs/ARCHITECTURE.md',
    'public/docs-vault/a.json',
    'samples/storefront/a.md',
    'src/entities/docs-vault/data/manifest.json',
    'cli/templates/vault-ko/README.md',
  ]) {
    assert.equal(sourceArea(path), null, path);
  }
});

test('names gates without a path separator so raise records can be files', () => {
  assert.equal(areaGate('comment-bytes', 'src/widgets'), 'comment-bytes.src-widgets');
  assert.equal(areaGate('comment-bytes', 'mcp'), 'comment-bytes.mcp');
});
