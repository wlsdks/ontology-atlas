import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = resolve(__dirname, '..', 'index.mjs');
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function makeVault() {
  const root = mkdtempSync(join(tmpdir(), 'ontology-atlas-connect-source-cli-'));
  mkdirSync(join(root, 'projects'), { recursive: true });
  writeFileSync(join(root, 'projects', 'example.md'), [
    '---',
    'uid: 00000000-0000-4000-8000-000000000001',
    'slug: projects/example',
    'kind: project',
    'title: Example',
    'path: package.json',
    '---',
    '',
  ].join('\n'));
  return root;
}

function runConnectSource(vaultRoot, rootArgs) {
  const output = execFileSync(process.execPath, [
    CLI_ENTRY,
    'connect-source',
    'projects/example',
    vaultRoot,
    ...rootArgs,
    '--json',
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return JSON.parse(output);
}

test('connect-source accepts the documented --root <path> form', () => {
  const vaultRoot = makeVault();
  try {
    const result = runConnectSource(vaultRoot, ['--root', REPO_ROOT]);
    assert.equal(result.changed, false);
    assert.equal(result.binding.rootPath, REPO_ROOT);
    assert.equal(result.previewReceipt.witnessSummary.missing, 0);
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
  }
});

test('connect-source accepts the --root=<path> form', () => {
  const vaultRoot = makeVault();
  try {
    const result = runConnectSource(vaultRoot, [`--root=${REPO_ROOT}`]);
    assert.equal(result.changed, false);
    assert.equal(result.binding.rootPath, REPO_ROOT);
    assert.equal(result.previewReceipt.witnessSummary.missing, 0);
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
  }
});
