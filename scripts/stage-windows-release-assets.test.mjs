import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { stageWindowsReleaseAssets, windowsInstallerName } from './stage-windows-release-assets.mjs';

test('stages one NSIS installer under a deterministic public name with SHA-256', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-windows-stage-'));
  const bundleDir = path.join(root, 'bundle');
  const nsisDir = path.join(bundleDir, 'nsis');
  const outDir = path.join(root, 'release-upload');
  fs.mkdirSync(nsisDir, { recursive: true });
  const bytes = Buffer.from('native-windows-installer');
  fs.writeFileSync(path.join(nsisDir, 'Ontology Atlas_1.2.3_x64-setup.exe'), bytes);

  const staged = stageWindowsReleaseAssets({ bundleDir, outDir, version: '1.2.3' });
  const expectedName = 'ontology-atlas_1.2.3_windows_x64-setup.exe';
  const expectedSha = crypto.createHash('sha256').update(bytes).digest('hex');

  assert.equal(windowsInstallerName('1.2.3'), expectedName);
  assert.deepEqual(staged.files, [expectedName, `${expectedName}.sha256`]);
  assert.deepEqual(fs.readFileSync(path.join(outDir, expectedName)), bytes);
  assert.equal(
    fs.readFileSync(path.join(outDir, `${expectedName}.sha256`), 'utf8'),
    `${expectedSha}  ${expectedName}\n`,
  );
});

test('stages the exact installer bytes that were hashed even if the source changes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-windows-stage-swap-'));
  const bundleDir = path.join(root, 'bundle');
  const nsisDir = path.join(bundleDir, 'nsis');
  const outDir = path.join(root, 'release-upload');
  const sourcePath = path.join(nsisDir, 'Ontology Atlas_1.2.3_x64-setup.exe');
  const originalBytes = Buffer.from('installer-bytes-that-were-hashed');
  const replacementBytes = Buffer.from('installer-bytes-swapped-after-hash');
  fs.mkdirSync(nsisDir, { recursive: true });
  fs.writeFileSync(sourcePath, originalBytes);

  // Replaces the source right after hashing to reproduce deterministically a swap
  // between the two reads. The check below confirms the swap really happened in the new
  // implementation too, preventing a vacuous pass.
  const createHash = crypto.createHash;
  crypto.createHash = (...args) => {
    const hash = createHash(...args);
    const digest = hash.digest.bind(hash);
    hash.digest = (...digestArgs) => {
      const value = digest(...digestArgs);
      fs.writeFileSync(sourcePath, replacementBytes);
      return value;
    };
    return hash;
  };
  try {
    stageWindowsReleaseAssets({ bundleDir, outDir, version: '1.2.3' });
  } finally {
    crypto.createHash = createHash;
  }

  const publicName = windowsInstallerName('1.2.3');
  const stagedBytes = fs.readFileSync(path.join(outDir, publicName));
  const checksum = fs.readFileSync(path.join(outDir, `${publicName}.sha256`), 'utf8');
  const stagedSha = crypto.createHash('sha256').update(stagedBytes).digest('hex');

  assert.deepEqual(fs.readFileSync(sourcePath), replacementBytes, 'fixture did not swap the source');
  assert.deepEqual(stagedBytes, originalBytes);
  assert.equal(checksum, `${stagedSha}  ${publicName}\n`);
  fs.rmSync(root, { recursive: true, force: true });
});

test('fails closed when the NSIS output is missing or ambiguous', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-windows-stage-'));
  const bundleDir = path.join(root, 'bundle');
  const nsisDir = path.join(bundleDir, 'nsis');
  fs.mkdirSync(nsisDir, { recursive: true });

  assert.throws(
    () => stageWindowsReleaseAssets({ bundleDir, outDir: path.join(root, 'out'), version: '1.2.3' }),
    /NSIS installer/i,
  );

  fs.writeFileSync(path.join(nsisDir, 'one-setup.exe'), 'one');
  fs.writeFileSync(path.join(nsisDir, 'two-setup.exe'), 'two');
  assert.throws(
    () => stageWindowsReleaseAssets({ bundleDir, outDir: path.join(root, 'out'), version: '1.2.3' }),
    /NSIS installer.*found 2/i,
  );
});
