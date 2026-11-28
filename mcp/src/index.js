#!/usr/bin/env node
/**
 * ontology-atlas-mcp from a source checkout. The server is the Rust program `pnpm mcp:build-binary`
 * builds into `src-tauri/binaries/`; this file only starts it, so every agent config that names
 * `node <checkout>/mcp/src/index.js` keeps working. It holds no server logic and imports nothing
 * from this package: a checkout that has not built the program must still be able to say so.
 *
 * "Older than the checkout" is the program's modification time against the newest file of the
 * crates it is built from (the `mcp-server` crate and every crate it names by path), the workspace
 * manifest and the lockfile. An embedded source hash would need the build to record it and this
 * file to read every source on each start; the modification time costs one stat per file, needs
 * nothing from the build, and errs toward asking for a rebuild, which `cargo` makes a no-op when
 * nothing changed. A pull, a branch switch or an edit all move a source's time past the program's.
 *
 * Arguments, environment and the standard streams pass through unchanged. The program exits when
 * its input closes, so an agent that dies without signalling this file still ends it.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const PROGRAM = 'ontology-atlas-mcp';
const SERVER_CRATE = 'mcp-server';
const checkout = path.resolve(import.meta.dirname, '..', '..');
const workspace = path.join(checkout, 'src-tauri');

const TRIPLES = {
  'darwin arm64': 'aarch64-apple-darwin',
  'darwin x64': 'x86_64-apple-darwin',
  'win32 x64': 'x86_64-pc-windows-msvc',
  'linux x64': 'x86_64-unknown-linux-gnu',
  'linux arm64': 'aarch64-unknown-linux-gnu',
};

function say(...lines) {
  for (const line of lines) process.stderr.write(`[${PROGRAM}] ${line}\n`);
}

const BUILD_ADVICE = 'Run `pnpm mcp:build-binary` in the checkout, then restart your agent.';

function refuseNotBuilt() {
  say(
    'The MCP server is now a compiled program, and this checkout has not built it.',
    BUILD_ADVICE,
    'Your agent config is unchanged and will work after the build.',
  );
  process.exit(1);
}

function refuseStale() {
  say('The built MCP server is older than this checkout, so it was not started.', BUILD_ADVICE);
  process.exit(1);
}

/** The crate folders `crate` is built from: itself and every crate its manifests name by `path`. */
function crateFolders(crate, found = new Set()) {
  const folder = path.join(workspace, 'crates', crate);
  if (found.has(folder) || !existsSync(path.join(folder, 'Cargo.toml'))) return found;
  found.add(folder);
  const manifest = readFileSync(path.join(folder, 'Cargo.toml'), 'utf8');
  for (const [, dependency] of manifest.matchAll(/\bpath\s*=\s*"\.\.\/([^"/]+)"/g)) {
    crateFolders(dependency, found);
  }
  return found;
}

/** Every file of `folder` that can change what is built; a crate's own tests and notes cannot. */
function* buildInputs(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.isDirectory() && (entry.name === 'tests' || entry.name === 'target')) continue;
    if (entry.isFile() && entry.name.endsWith('.md')) continue;
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) yield* buildInputs(full);
    else yield full;
  }
}

/** The newest modification time among the build inputs, or null when this is not a full checkout. */
function newestSourceMs() {
  const folders = crateFolders(SERVER_CRATE);
  if (folders.size === 0) return null;
  const files = [path.join(workspace, 'Cargo.toml'), path.join(workspace, 'Cargo.lock')];
  for (const folder of folders) files.push(...buildInputs(folder));
  return Math.max(...files.filter(existsSync).map((file) => statSync(file).mtimeMs));
}

const triple = TRIPLES[`${process.platform} ${process.arch}`];
const program = triple
  ? path.join(workspace, 'binaries', `${PROGRAM}-${triple}${process.platform === 'win32' ? '.exe' : ''}`)
  : null;

if (!program || !existsSync(program)) refuseNotBuilt();
const sourceMs = newestSourceMs();
if (sourceMs !== null && statSync(program).mtimeMs < sourceMs) refuseStale();

const child = spawn(program, process.argv.slice(2), { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
child.on('error', (error) => {
  say(`Could not start ${program}: ${error.message}`, BUILD_ADVICE);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) {
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
