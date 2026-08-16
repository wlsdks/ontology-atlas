#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_WINDOWS_BUNDLE_DIR = 'src-tauri/target/release/bundle';
export const WINDOWS_STAGING_DIR = 'release-upload';

export function windowsInstallerName(version) {
  return `ontology-atlas_${version}_windows_x64-setup.exe`;
}

function exactlyOneNsisInstaller(nsisDir) {
  if (!fs.existsSync(nsisDir)) {
    throw new Error(`NSIS installer folder does not exist: ${nsisDir}`);
  }
  const installers = fs
    .readdirSync(nsisDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('-setup.exe'))
    .map((entry) => entry.name);
  if (installers.length !== 1) {
    throw new Error(
      `expected exactly one NSIS installer in ${nsisDir}, found ${installers.length}` +
        (installers.length > 0 ? `: ${installers.join(', ')}` : ''),
    );
  }
  return installers[0];
}

export function stageWindowsReleaseAssets({ bundleDir, outDir, version }) {
  if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`invalid release version: ${version ?? ''}`);
  }
  const bundle = bundleDir ?? DEFAULT_WINDOWS_BUNDLE_DIR;
  const out = outDir ?? WINDOWS_STAGING_DIR;
  const nsisDir = path.join(bundle, 'nsis');
  const sourceName = exactlyOneNsisInstaller(nsisDir);
  const publicName = windowsInstallerName(version);
  const sourcePath = path.join(nsisDir, sourceName);
  const bytes = fs.readFileSync(sourcePath);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  // 해시한 바로 그 바이트를 쓴다. sourcePath 를 다시 읽으면 둘 사이에 산출물이
  // 교체될 때 공개 installer 와 checksum 이 서로 다른 파일을 증명하게 된다.
  fs.writeFileSync(path.join(out, publicName), bytes);
  fs.writeFileSync(path.join(out, `${publicName}.sha256`), `${sha256}  ${publicName}\n`, 'utf8');

  return {
    outDir: out,
    version,
    arch: 'x64',
    files: [publicName, `${publicName}.sha256`],
    sha256,
  };
}

function flagValue(argv, name) {
  const match = argv.find((arg) => arg.startsWith(`--${name}=`));
  return match?.slice(`--${name}=`.length).trim();
}

function main() {
  const argv = process.argv.slice(2);
  const version = flagValue(argv, 'version');
  if (!version) {
    console.error('[windows-release-stage] --version=X.Y.Z is required');
    process.exit(1);
  }
  try {
    const staged = stageWindowsReleaseAssets({
      bundleDir: flagValue(argv, 'bundle-dir'),
      outDir: flagValue(argv, 'out'),
      version,
    });
    console.log(`[windows-release-stage] x64 → ${staged.outDir}`);
    for (const file of staged.files) console.log(`[windows-release-stage]   ${file}`);
  } catch (error) {
    console.error(`[windows-release-stage] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
