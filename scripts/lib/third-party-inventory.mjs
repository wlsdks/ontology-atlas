import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MAX_BUFFER = 64 * 1024 * 1024;
const LICENSE_FILE = /^(?:licen[cs]e|copying|copyright|notice|unlicense)(?:[-_.][^/]*)?$/i;

export function listLicenseFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && LICENSE_FILE.test(entry.name) && !/\.spdx$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Packages that declare `os`, `cpu` or `libc` install per build machine and never ship. */
function isPlatformSpecific(manifest) {
  return ['os', 'cpu', 'libc'].some((field) => Array.isArray(manifest[field]) && manifest[field].length > 0);
}

function readManifest(dir, cwd) {
  const file = path.join(dir, 'package.json');
  if (!fs.existsSync(file)) {
    throw new Error(`${path.relative(cwd, dir)} is not installed; run pnpm install in ${path.basename(cwd)} first`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function collectNpmPackages({ cwd, scope }) {
  const raw = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], { cwd, encoding: 'utf8', maxBuffer: MAX_BUFFER });
  const packages = [];
  for (const [license, entries] of Object.entries(JSON.parse(raw))) {
    for (const entry of entries) {
      for (const dir of entry.paths) {
        const manifest = readManifest(dir, cwd);
        packages.push({
          ecosystem: 'npm',
          scope,
          name: entry.name,
          version: manifest.version,
          license,
          authors: entry.author ? [entry.author] : [],
          dir,
          platformSpecific: isPlatformSpecific(manifest),
        });
      }
    }
  }
  return packages;
}

function collectRustCrates({ manifestPath }) {
  const raw = execFileSync(
    'cargo',
    ['metadata', '--locked', '--manifest-path', manifestPath, '--format-version', '1', '--all-features'],
    { encoding: 'utf8', maxBuffer: MAX_BUFFER },
  );
  const meta = JSON.parse(raw);
  const ours = new Set(meta.workspace_members);
  return meta.packages
    .filter((pkg) => !ours.has(pkg.id))
    .map((pkg) => ({
      ecosystem: 'cargo',
      scope: 'desktop',
      name: pkg.name,
      version: pkg.version,
      license: pkg.license ?? (pkg.license_file ? `SEE LICENSE IN ${pkg.license_file}` : 'UNKNOWN'),
      authors: (pkg.authors ?? []).map((author) => author.replace(/\s*<[^>]*>/g, '').trim()).filter(Boolean),
      dir: path.dirname(pkg.manifest_path),
      platformSpecific: false,
    }));
}

/**
 * The three shipped dependency trees. `rust` is null when `cargo` is not installed outside
 * CI, so a machine without Rust still checks the npm trees; in CI a missing `cargo` fails.
 */
export function collectInventories({ root, env = process.env }) {
  const web = collectNpmPackages({ cwd: root, scope: 'web' });
  const mcp = collectNpmPackages({ cwd: path.join(root, 'mcp'), scope: 'mcp' });
  let rust = null;
  try {
    rust = collectRustCrates({ manifestPath: path.join(root, 'src-tauri', 'Cargo.toml') });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    if (env.CI) throw new Error('cargo is not installed, so the Rust crates cannot be judged; CI must provide it');
  }
  const floors = [['web export npm', web], ['MCP sidecar npm', mcp], ...(rust ? [['Rust', rust]] : [])];
  for (const [label, packages] of floors) {
    if (packages.length === 0) throw new Error(`the ${label} inventory is empty; install dependencies first`);
  }
  return { web, mcp, rust };
}
