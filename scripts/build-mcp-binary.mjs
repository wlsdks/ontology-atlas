#!/usr/bin/env node
/**
 * Compiles the MCP server into a single self-contained binary and places it
 * where the app bundle picks it up.
 *
 *   node scripts/build-mcp-binary.mjs                     # host architecture
 *   node scripts/build-mcp-binary.mjs --target x86_64-apple-darwin
 *   node scripts/build-mcp-binary.mjs --skip-verify       # compile only
 *
 * Why: it removes the contradiction of installing the app and still having no
 * agent surface. One download installs the human surface and the agent surface
 * together.
 *
 * fail-closed: right after compiling, the binary is actually spawned for an
 * `initialize` → `tools/list` round trip and the tool count is compared against
 * the expectation. Shipping a binary that cannot boot is this slice's worst
 * failure mode, so it is caught here.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  MCP_BINARY_OUTPUT_DIR,
  MCP_SERVER_ENTRY,
  binaryFileNameForTriple,
  bunCompileArgs,
  hostTargetTriple,
  SUPPORTED_TARGET_TRIPLES,
} from './lib/mcp-binary.mjs';
import { verifyMcpBinary, verifyMcpParity } from './verify-mcp-binary.mjs';

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
      'Usage: node scripts/build-mcp-binary.mjs [--target <triple>] [--skip-verify]',
      '',
      `  --target        ${SUPPORTED_TARGET_TRIPLES.join(' | ')} (default: host)`,
      '  --skip-verify   compile without spawning the result',
    ].join('\n'),
  );
  process.exit(0);
}

const triple = flagValue('--target') ?? hostTargetTriple();
if (!triple) fail(`Unsupported host platform/architecture: ${process.platform}/${process.arch}`);

const outDir = path.join(root, MCP_BINARY_OUTPUT_DIR);
const outFile = path.join(outDir, binaryFileNameForTriple(triple));

if (!existsSync(path.join(root, MCP_SERVER_ENTRY))) {
  fail(`MCP entry not found: ${MCP_SERVER_ENTRY} (run from the repository root)`);
}

const bunProbe = spawnSync('bun', ['--version'], { encoding: 'utf-8' });
if (bunProbe.status !== 0) {
  fail(
    'bun is required to compile the bundled MCP binary.\n' +
      '  Install: curl -fsSL https://bun.sh/install | bash',
  );
}

mkdirSync(outDir, { recursive: true });

let compileArgs;
try {
  compileArgs = bunCompileArgs({ triple, outfile: outFile });
} catch (error) {
  fail(error.message);
}

console.log(`▸ bun ${compileArgs.join(' ')}`);
const compiled = spawnSync('bun', compileArgs, { stdio: 'inherit', cwd: root });
if (compiled.status !== 0) fail(`bun compile failed with exit ${compiled.status}`);
if (!existsSync(outFile)) fail(`bun reported success but ${outFile} is missing`);

const sizeMb = (statSync(outFile).size / (1024 * 1024)).toFixed(1);
console.log(`✔ ${path.relative(root, outFile)} — ${sizeMb} MB (bun ${bunProbe.stdout.trim()})`);

if (argv.includes('--skip-verify')) process.exit(0);

if (triple !== hostTargetTriple()) {
  console.log('ℹ cross-compiled binary — skipping the spawn check (cannot run it here).');
  process.exit(0);
}

const vault = path.join(root, 'docs', 'ontology');
try {
  const result = await verifyMcpBinary({ binaryPath: outFile, vaultPath: vault });
  console.log(
    `✔ spawn check — version ${result.version}, ${result.toolCount} tools, vault ${path.relative(root, vault)}`,
  );
  const parity = await verifyMcpParity({ binaryPath: outFile, vaultPath: vault });
  console.log(
    `✔ source/bundled parity — ${parity.toolCount} tools, ${parity.sourceVersion} / ${parity.bundledVersion}`,
  );
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
