#!/usr/bin/env node
/**
 * Packs the MCP server into an `.mcpb` bundle and proves it boots.
 *
 *   pnpm mcp:build-bundle                      # build, verify, print the sha256
 *   pnpm mcp:build-bundle -- --check           # verify inputs only; write nothing
 *   pnpm mcp:build-bundle -- --keep-dir        # leave the staged folder for inspection
 *   pnpm mcp:build-bundle -- --tag=v1.1.0      # stamp the release this artifact belongs to
 *   pnpm mcp:build-bundle -- --also-node=/path # witness a second runtime, not just this one
 *
 * Why this exists: the official MCP Registry accepts an MCPB artifact hosted on
 * a GitHub Release, verifying only its URL and SHA-256. That makes Atlas
 * discoverable in the MCP ecosystem without publishing to npm, which
 * `docs/DECISIONS.md` (2026-07-27) retired.
 *
 * fail-closed: the bundle is unpacked into a scratch directory and started the
 * way a host starts it — `node server/src/index.js` with `OATLAS_VAULT` — then
 * asked to `initialize`, list its tools, and read one real concept. A bundle
 * that cannot boot is this channel's worst failure mode, so it never reaches an
 * artifact.
 *
 * A host supplies its own Node, so one runtime is one data point. This build
 * witnesses the Node it runs under, plus every `--also-node=<path>` it is given;
 * the manifest's `>=20` floor rests on a hand measurement (Node 20, 22, 24 and
 * 25 each answered with every tool) until a build passes those binaries in.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { parseJsonRpcResponses } from '../mcp/scripts/json-rpc-lines.mjs';
import {
  BUNDLE_ENTRY_POINT,
  BUNDLE_SERVER_DIR,
  STRIPPED_MODULE,
  TYPED_MODULE,
  bundleFileList,
  bundleManifest,
  bundlePackageJson,
  bundleProvenance,
  dependencyClosure,
  isBundleBallast,
} from './lib/mcp-bundle.mjs';

const ROOT = process.cwd();
const MCP_DIR = path.join(ROOT, 'mcp');
const OUTPUT_DIR = path.join(ROOT, '.tmp', 'mcp-bundle');
const MCP_SURFACE = path.join(ROOT, 'docs', '.generated', 'mcp-surface.json');
const VERIFY_VAULT = path.join(ROOT, 'docs', 'ontology');
// The generated surface record is the machine-owned count `pnpm docs:surface:check`
// keeps current by asking the running server for `tools/list`.
const TOOL_INVENTORY_COUNT = JSON.parse(readFileSync(MCP_SURFACE, 'utf8')).mcp.toolCount;
const VERIFY_CONCEPT = 'capabilities/mcp-tool-server';

const argv = process.argv.slice(2);
const checkOnly = argv.includes('--check');
const keepDir = argv.includes('--keep-dir');
const releaseTag = argv.find((arg) => arg.startsWith('--tag='))?.slice('--tag='.length) ?? null;
const alsoNode = argv.filter((arg) => arg.startsWith('--also-node=')).map((arg) => arg.slice('--also-node='.length));

function fail(message) {
  console.error(`[mcp-bundle] ✖ ${message}`);
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** The commit the artifact was built from — the identity the zip otherwise lacks. */
function headCommit() {
  const rev = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  return rev.status === 0 ? rev.stdout.trim() : 'unknown (not a git checkout)';
}

/**
 * A dependency's real directory, resolved from the package that depends on it —
 * pnpm links `zod` only under the SDK, so a flat lookup in `mcp/node_modules`
 * misses it.
 */
function resolvePackageDir(name, fromDir) {
  const require = createRequire(path.join(fromDir, 'package.json'));
  try {
    return path.dirname(require.resolve(`${name}/package.json`));
  } catch {
    // A package whose `exports` map does not expose `./package.json` — both MCP
    // SDK packages are like this. Resolve its entry point instead and walk up to
    // the directory whose manifest carries that name.
  }
  try {
    let dir = path.dirname(require.resolve(name));
    for (let depth = 0; depth < 12; depth += 1) {
      const manifest = packageManifest(dir);
      if (manifest?.name === name) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    return null;
  }
  return null;
}

function packageManifest(dir) {
  const file = path.join(dir, 'package.json');
  return existsSync(file) ? readJson(file) : null;
}

/**
 * `mcp/src/analysis-record.mts` is imported directly and relies on Node's type
 * stripping, unflagged only from Node 23.6. A host supplies its own Node, so the
 * one typed module is compiled to `.mjs` for the bundle and its importer is
 * pointed at the stripped name. Nothing else in the server is TypeScript.
 */
function stripTypedModule(stageServerDir) {
  const source = path.join(MCP_DIR, TYPED_MODULE);
  const compiled = spawnSync(
    'pnpm',
    [
      'exec',
      'tsc',
      '--ignoreConfig',
      source,
      '--target',
      'es2022',
      '--module',
      'nodenext',
      '--moduleResolution',
      'nodenext',
      '--outDir',
      path.join(stageServerDir, 'src'),
    ],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (compiled.status !== 0) {
    fail(`could not strip types from ${TYPED_MODULE}:\n${compiled.stderr || compiled.stdout}`);
  }
  const stripped = path.join(stageServerDir, STRIPPED_MODULE);
  if (!existsSync(stripped)) fail(`type stripping produced no ${STRIPPED_MODULE}`);
  rmSync(path.join(stageServerDir, TYPED_MODULE), { force: true });

  // The importer must follow. It is the only file that names the typed module.
  const importer = path.join(stageServerDir, 'src', 'analysis-records.mjs');
  const before = readFileSync(importer, 'utf8');
  const after = before.replaceAll('./analysis-record.mts', './analysis-record.mjs');
  if (after === before) fail('src/analysis-records.mjs no longer imports the typed module — update this build');
  writeFileSync(importer, after);
}

function stage(pkg) {
  const stageDir = mkdtempSync(path.join(tmpdir(), 'ontology-atlas-mcpb-'));
  const serverDir = path.join(stageDir, BUNDLE_SERVER_DIR);
  mkdirSync(serverDir, { recursive: true });

  for (const file of pkg.files) {
    if (file === TYPED_MODULE) continue; // compiled below
    if (bundleFileList(pkg.files).includes(file) === false) continue; // excluded fixtures
    const source = path.join(MCP_DIR, file);
    if (!existsSync(source)) fail(`mcp/package.json declares a file that is missing: ${file}`);
    const destination = path.join(serverDir, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(source, destination);
  }
  writeFileSync(
    path.join(serverDir, 'package.json'),
    `${JSON.stringify(bundlePackageJson({ version: pkg.version }), null, 2)}\n`,
  );
  // manifest.json and the image label both say MIT; the artifact should carry the
  // licence that claim refers to.
  cpSync(path.join(ROOT, 'LICENSE'), path.join(serverDir, 'LICENSE'));
  stripTypedModule(serverDir);

  const { packages, missing } = dependencyClosure({
    rootDependencies: pkg.dependencies,
    rootDir: MCP_DIR,
    resolvePackageDir,
    readManifest: packageManifest,
  });
  if (missing.length > 0) {
    fail(`runtime dependencies are not installed (${missing.join(', ')}) — run \`pnpm --dir mcp install --frozen-lockfile\``);
  }
  for (const { name, dir } of packages) {
    // dereference: pnpm's node_modules entries are symlinks into its store.
    // The filter drops each dependency's own tests and source maps; a host needs
    // the code and the licence, and nothing else.
    cpSync(dir, path.join(serverDir, 'node_modules', name), {
      recursive: true,
      dereference: true,
      filter: (source) => !isBundleBallast(path.relative(dir, source)),
    });
  }

  writeFileSync(
    path.join(stageDir, 'manifest.json'),
    `${JSON.stringify(bundleManifest({ version: pkg.version, description: pkg.description }), null, 2)}\n`,
  );
  return { stageDir, closure: packages.map(({ name }) => name) };
}

function zip(stageDir, artifact) {
  mkdirSync(path.dirname(artifact), { recursive: true });
  rmSync(artifact, { force: true });
  const zipped = spawnSync('zip', ['-qr', artifact, '.', '-x', '.*'], { cwd: stageDir, encoding: 'utf8' });
  if (zipped.status !== 0) fail(`zip failed: ${zipped.stderr || zipped.stdout}`);
}

/** Start the unpacked bundle the way a host does and require a real answer. */
async function verifyUnpacked(entry, nodeBinary) {
  const requests = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp-bundle-verify', version: '0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_concept', arguments: { slug: VERIFY_CONCEPT } } },
  ];

  return await new Promise((resolve, reject) => {
    const child = spawn(nodeBinary, [entry], {
      env: { ...process.env, OATLAS_VAULT: VERIFY_VAULT },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const deadline = setTimeout(() => finish(new Error('bundle did not answer within 25s')), 25_000);

    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      child.kill();
      if (error) reject(new Error(`${error.message}${stderr ? `\n${stderr.slice(0, 800)}` : ''}`));
      else resolve(result);
    }

    child.on('error', (error) => finish(new Error(`could not spawn ${nodeBinary}: ${error.message}`)));
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const messages = parseJsonRpcResponses(stdout);
      const initialize = messages.find((message) => message.id === 1)?.result;
      const tools = messages.find((message) => message.id === 2)?.result?.tools;
      const concept = messages.find((message) => message.id === 3)?.result;
      if (!initialize || !tools || !concept) return;
      if (concept.isError) return finish(new Error('the bundle started but could not read the verification vault'));
      // Equality, not a floor: a floor of 32 let six tools disappear while the
      // published description still claimed the full surface.
      if (tools.length !== TOOL_INVENTORY_COUNT) {
        return finish(new Error(`the bundle advertised ${tools.length} tools, the inventory declares ${TOOL_INVENTORY_COUNT}`));
      }
      finish(null, {
        version: initialize.serverInfo?.version ?? 'unknown',
        toolCount: tools.length,
        nodeVersion: null,
      });
    });

    for (const request of requests) child.stdin.write(`${JSON.stringify(request)}\n`);
  });
}

async function main() {
  const pkg = readJson(path.join(MCP_DIR, 'package.json'));
  for (const file of pkg.files) {
    if (!existsSync(path.join(MCP_DIR, file))) fail(`mcp/package.json declares a file that is missing: ${file}`);
  }
  if (!existsSync(path.join(MCP_DIR, TYPED_MODULE))) {
    fail(`${TYPED_MODULE} is gone — the type-stripping step in this build is stale`);
  }
  if (!statSync(VERIFY_VAULT, { throwIfNoEntry: false })?.isDirectory()) {
    fail(`verification vault is missing: ${path.relative(ROOT, VERIFY_VAULT)}`);
  }
  if (checkOnly) {
    console.log(`[mcp-bundle] inputs current · ${pkg.files.length} declared files · v${pkg.version} ✓`);
    return 0;
  }

  const { stageDir, closure } = stage(pkg);
  writeFileSync(
    path.join(stageDir, BUNDLE_SERVER_DIR, 'BUILD-PROVENANCE.txt'),
    bundleProvenance({
      version: pkg.version,
      commit: headCommit(),
      tag: releaseTag,
      builtAt: new Date().toISOString(),
      // Written before the boot check, so it names the runtimes this build will
      // witness rather than claiming a result it does not have yet. A failed
      // boot never produces an artifact, so the two cannot disagree.
      witnessedRuntimes: [`node ${process.versions.node}`, ...alsoNode],
    }),
  );
  const artifact = path.join(OUTPUT_DIR, `ontology-atlas-mcp-${pkg.version}.mcpb`);
  zip(stageDir, artifact);

  const unpacked = mkdtempSync(path.join(tmpdir(), 'ontology-atlas-mcpb-installed-'));
  const unzipped = spawnSync('unzip', ['-q', artifact, '-d', unpacked], { encoding: 'utf8' });
  if (unzipped.status !== 0) fail(`could not unpack the artifact: ${unzipped.stderr || unzipped.stdout}`);

  const entry = path.join(unpacked, BUNDLE_ENTRY_POINT);
  const verified = await verifyUnpacked(entry, process.execPath);
  const witnessed = [`node ${process.versions.node}`];
  for (const binary of alsoNode) {
    const extra = await verifyUnpacked(entry, binary);
    witnessed.push(`node ${extra.nodeVersion ?? binary}`);
  }

  const sha256 = createHash('sha256').update(readFileSync(artifact)).digest('hex');
  const bytes = statSync(artifact).size;

  if (!keepDir) {
    rmSync(stageDir, { recursive: true, force: true });
    rmSync(unpacked, { recursive: true, force: true });
  }

  writeFileSync(
    `${artifact}.provenance.json`,
    `${JSON.stringify({ version: pkg.version, commit: headCommit(), tag: releaseTag, sha256, witnessed }, null, 2)}\n`,
  );

  console.log(`[mcp-bundle] ${path.relative(ROOT, artifact)}`);
  console.log(`[mcp-bundle] ${bytes} bytes · v${verified.version} · ${verified.toolCount} tools · vendored ${closure.join(', ')}`);
  console.log(`[mcp-bundle] sha256 ${sha256}`);
  console.log(`[mcp-bundle] booted from the unpacked artifact under ${witnessed.join(', ')} and read one real concept ✓`);
  if (keepDir) console.log(`[mcp-bundle] staged ${stageDir}\n[mcp-bundle] unpacked ${unpacked}`);
  return 0;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
