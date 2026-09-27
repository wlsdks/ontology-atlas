import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { resolveVaultRoot } from './resolve-vault.mjs';

test('resolveVaultRoot prefers the explicit argument over env', () => {
  const tmp = realpathSync(mkdtempSync(resolve(tmpdir(), 'ontology-atlas-vault-test-')));
  const explicit = resolve(tmp, 'my-vault');
  mkdirSync(explicit, { recursive: true });
  process.env.OATLAS_VAULT = '/tmp/env-vault';
  try {
    const got = resolveVaultRoot(explicit);
    assert.equal(got, explicit);
  } finally {
    delete process.env.OATLAS_VAULT;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("resolveVaultRoot treats an explicit '.' as default and falls to env", () => {
  const tmp = realpathSync(mkdtempSync(resolve(tmpdir(), 'ontology-atlas-vault-test-')));
  process.env.OATLAS_VAULT = tmp;
  try {
    const got = resolveVaultRoot('.');
    assert.equal(got, tmp);
  } finally {
    delete process.env.OATLAS_VAULT;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('resolveVaultRoot uses env second', () => {
  const tmp = realpathSync(mkdtempSync(resolve(tmpdir(), 'ontology-atlas-vault-test-')));
  delete process.env.OATLAS_VAULT;
  process.env.OATLAS_VAULT = tmp;
  try {
    const got = resolveVaultRoot();
    assert.equal(got, tmp);
  } finally {
    delete process.env.OATLAS_VAULT;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('resolveVaultRoot — explicit/env vault paths must exist and be directories', () => {
  const tmp = realpathSync(mkdtempSync(resolve(tmpdir(), 'ontology-atlas-vault-test-')));
  const file = resolve(tmp, 'not-a-vault.md');
  writeFileSync(file, 'not a directory\n');

  try {
    assert.throws(
      () => resolveVaultRoot(resolve(tmp, 'missing')),
      /Vault root not found:/,
    );
    assert.throws(
      () => resolveVaultRoot(file),
      /Vault root is not a directory:/,
    );

    process.env.OATLAS_VAULT = resolve(tmp, 'missing-env');
    assert.throws(() => resolveVaultRoot(), /Vault root not found:/);
  } finally {
    delete process.env.OATLAS_VAULT;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('resolveVaultRoot detects cwd/docs/ontology third', () => {
  // Create docs/ontology under a temporary cwd and chdir into it. macOS tmp is a
  // symlink (`/var/folders` → `/private/var/folders`), so compare after
  // normalising with realpathSync.
  const tmp = realpathSync(mkdtempSync(resolve(tmpdir(), 'ontology-atlas-vault-test-')));
  const vaultDir = resolve(tmp, 'docs/ontology');
  mkdirSync(vaultDir, { recursive: true });
  const prevCwd = process.cwd();
  process.chdir(tmp);
  try {
    delete process.env.OATLAS_VAULT;
    const got = resolveVaultRoot();
    assert.equal(got, vaultDir);
  } finally {
    process.chdir(prevCwd);
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('resolveVaultRoot falls back to cwd when nothing else applies', () => {
  // A temporary directory with no docs/ontology in cwd — normalised with realpathSync.
  const tmp = realpathSync(mkdtempSync(resolve(tmpdir(), 'ontology-atlas-vault-test-')));
  const prevCwd = process.cwd();
  process.chdir(tmp);
  try {
    delete process.env.OATLAS_VAULT;
    const got = resolveVaultRoot();
    assert.equal(got, tmp);
  } finally {
    process.chdir(prevCwd);
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('resolveVaultRoot treats an empty explicit argument as default', () => {
  const tmp = realpathSync(mkdtempSync(resolve(tmpdir(), 'ontology-atlas-vault-test-')));
  process.env.OATLAS_VAULT = tmp;
  try {
    const got = resolveVaultRoot('');
    assert.equal(got, tmp);
  } finally {
    delete process.env.OATLAS_VAULT;
    rmSync(tmp, { recursive: true, force: true });
  }
});
