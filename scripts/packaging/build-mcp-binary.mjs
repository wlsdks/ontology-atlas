#!/usr/bin/env node
/**
 * Builds the Rust MCP program and places it where the app bundle and the source launcher pick it
 * up, so one download installs the human and the agent surface together.
 *
 *   node scripts/packaging/build-mcp-binary.mjs                     # host target
 *   node scripts/packaging/build-mcp-binary.mjs --target x86_64-apple-darwin
 *   node scripts/packaging/build-mcp-binary.mjs --skip-verify       # build only
 *
 * Fail-closed: right after the build, the placed program is spawned for an `initialize`,
 * `tools/list` and `get_concepts` round trip, so a program that cannot boot is caught here.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

import { verifyMcpBinary, verifyMcpExactCase } from './verify-mcp-binary.mjs';
import {
  CARGO_PACKAGE,
  PROGRAM_TARGET_TRIPLES,
  cargoProgramPath,
  hostProgramTriple,
  pinnedToolchain,
  reportedToolchain,
  sidecarPath,
  toolchainNotice,
} from './rust-mcp-program.mjs';

const root = process.cwd();
const argv = process.argv.slice(2);

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function flagValue(name) {
  const inline = argv.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
}

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(
    [
      'Usage: node scripts/packaging/build-mcp-binary.mjs [--target <triple>] [--skip-verify]',
      '',
      `  --target        ${PROGRAM_TARGET_TRIPLES.join(' | ')} (default: host)`,
      '  --skip-verify   build without spawning the result',
    ].join('\n'),
  );
  process.exit(0);
}

const hostTriple = hostProgramTriple();
const triple = flagValue('--target') ?? hostTriple;
if (!triple) fail(`Unsupported host platform/architecture: ${process.platform}/${process.arch}`);
if (!PROGRAM_TARGET_TRIPLES.includes(triple)) {
  fail(`Unsupported target triple: ${triple}. Supported: ${PROGRAM_TARGET_TRIPLES.join(', ')}`);
}

const manifest = path.join(root, 'src-tauri', 'Cargo.toml');
if (!existsSync(manifest)) fail('src-tauri/Cargo.toml not found (run from the repository root)');

const rustc = spawnSync('rustc', ['--version'], { encoding: 'utf-8' });
if (rustc.error || rustc.status !== 0) {
  fail('Rust is required to build the MCP server.\n  Install it with rustup: https://rustup.rs');
}
const notice = toolchainNotice(
  pinnedToolchain(readFileSync(path.join(root, 'rust-toolchain.toml'), 'utf-8')),
  reportedToolchain(rustc.stdout),
);
if (notice) console.warn(`⚠ ${notice}`);

const cargoArgs = [
  'build',
  '--release',
  '--locked',
  '-p',
  CARGO_PACKAGE,
  '--manifest-path',
  manifest,
  ...(triple === hostTriple ? [] : ['--target', triple]),
];
console.log(`▸ cargo ${cargoArgs.join(' ')}`);
const built = spawnSync('cargo', cargoArgs, { stdio: 'inherit', cwd: root });
if (built.status !== 0) fail(`cargo build failed with exit ${built.status}`);

const compiled = cargoProgramPath(root, triple, hostTriple);
if (!existsSync(compiled)) fail(`cargo reported success but ${compiled} is missing`);

/*
 * Written beside the final name and renamed over it: the program replaces one a running agent may
 * hold, and macOS caches a signature by file, so overwriting the bytes in place can get the new
 * program killed on its first start. A rename gives it a new file.
 */
const placed = sidecarPath(root, triple);
mkdirSync(path.dirname(placed), { recursive: true });
const staging = `${placed}.new`;
copyFileSync(compiled, staging);
chmodSync(staging, 0o755);
try {
  rmSync(placed, { force: true });
} catch {
  // Windows refuses to delete a program an agent is running but allows renaming it.
  renameSync(placed, `${placed}.replaced`);
}
renameSync(staging, placed);
try {
  rmSync(`${placed}.replaced`, { force: true });
} catch {
  // Still running: a later build replaces it.
}

const sizeMb = (statSync(placed).size / (1024 * 1024)).toFixed(1);
console.log(`✔ ${path.relative(root, placed)} — ${sizeMb} MB (rustc ${reportedToolchain(rustc.stdout)})`);

if (argv.includes('--skip-verify')) process.exit(0);

if (triple !== hostTriple) {
  console.log('ℹ cross-built program — skipping the spawn check (cannot run it here).');
  process.exit(0);
}

const vault = path.join(root, 'docs', 'ontology');
try {
  const result = await verifyMcpBinary({ binaryPath: placed, vaultPath: vault });
  console.log(
    `✔ spawn check — version ${result.version}, ${result.toolCount} tools, vault ${path.relative(root, vault)}`,
  );
  const exactCase = await verifyMcpExactCase({ binaryPath: placed });
  console.log(
    `✔ exact-case source address — readme.md ${exactCase.lowercaseAddresses}, ` +
      `README.md ${exactCase.uppercaseAddresses}, project evidence present`,
  );
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
