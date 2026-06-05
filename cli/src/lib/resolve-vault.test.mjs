import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { resolveVaultRoot } from './resolve-vault.mjs';

test('resolveVaultRoot — explicit 인자가 1순위 (env 보다 강함)', () => {
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

test("resolveVaultRoot — explicit 이 '.' 면 default 로 취급 (env 가 다음 차례)", () => {
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

test('resolveVaultRoot — env 가 2순위', () => {
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

test('resolveVaultRoot — cwd/docs/ontology 자동 감지 (3 순위)', () => {
  // 임시 cwd 에 docs/ontology 디렉토리 만들고 chdir. macOS 의 tmp 는 symlink
  // (`/var/folders` → `/private/var/folders`) 라 realpathSync 로 정규화 후 비교.
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

test('resolveVaultRoot — fallback 은 cwd (4 순위, 아무것도 없을 때)', () => {
  // cwd 에 docs/ontology 없는 임시 디렉토리 — realpathSync 로 정규화.
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

test('resolveVaultRoot — 빈 문자열 explicit 은 default 로 취급', () => {
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
