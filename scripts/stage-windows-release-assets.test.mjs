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
