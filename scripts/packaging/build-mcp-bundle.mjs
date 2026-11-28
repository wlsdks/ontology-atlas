#!/usr/bin/env node
/**
 * Packs the compiled Rust MCP program into an `.mcpb` bundle and proves the one program this
 * machine can run boots from the unpacked artifact (fail-closed: unpack, start, initialize, list
 * tools, read a concept).
 *
 *   node scripts/packaging/build-mcp-bundle.mjs [--tag=<vX.Y.Z>] [--program=<triple>=<path> ...] [--check]
 *
 * A program comes from `--program`, or else from `src-tauri/binaries/` (what `pnpm mcp:build-binary`
 * placed). A host picks by operating system only, so a system given two architectures starts a
 * script that picks by architecture; two programs for one system and architecture are refused.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  bundleManifest,
  bundleProgramPath,
  bundleProgramsByPlatform,
  bundleSelectorPath,
  bundleSelectorScript,
  bundleProgramProblems,
  bundleProvenance,
} from '../lib/packaging/mcp-bundle.mjs';
import { PROGRAM_TARGET_TRIPLES, hostProgramTriple, sidecarPath } from './rust-mcp-program.mjs';
import { verifyMcpBinary } from './verify-mcp-binary.mjs';

const ROOT = process.cwd();
const MCP_DIR = path.join(ROOT, 'mcp');
const OUTPUT_DIR = path.join(ROOT, '.tmp', 'mcp-bundle');
const VERIFY_VAULT = path.join(ROOT, 'docs', 'ontology');

const argv = process.argv.slice(2);
const checkOnly = argv.includes('--check');
const releaseTag = argv.find((arg) => arg.startsWith('--tag='))?.slice('--tag='.length) ?? null;

function fail(message) {
  console.error(`[mcp-bundle] ✖ ${message}`);
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function headCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : 'unknown';
}

/** `{ triple, file }` for each program: the `--program` flags, else every program `mcp:build-binary` placed. */
function programsToBundle() {
  const given = argv.filter((arg) => arg.startsWith('--program=')).map((arg) => arg.slice('--program='.length));
  if (given.length > 0) {
    return given.map((entry) => {
      const split = entry.indexOf('=');
      if (split < 0) fail(`--program wants <triple>=<path>, received ${entry}`);
      return { triple: entry.slice(0, split), file: path.resolve(entry.slice(split + 1)) };
    });
  }
  return PROGRAM_TARGET_TRIPLES.map((triple) => ({ triple, file: sidecarPath(ROOT, triple) })).filter(({ file }) => existsSync(file));
}

function stage(programs, pkg) {
  const stageDir = mkdtempSync(path.join(tmpdir(), 'ontology-atlas-mcpb-'));
  mkdirSync(path.join(stageDir, 'server'), { recursive: true });
  for (const { triple, file } of programs) {
    const destination = path.join(stageDir, bundleProgramPath(triple));
    copyFileSync(file, destination);
    chmodSync(destination, 0o755);
  }
  for (const [platform, platformTriples] of bundleProgramsByPlatform(programs.map(({ triple }) => triple))) {
    if (platformTriples.length < 2) continue;
    const selector = path.join(stageDir, bundleSelectorPath(platform));
    writeFileSync(selector, bundleSelectorScript(platformTriples));
    chmodSync(selector, 0o755);
  }
  // manifest.json and the image label both say MIT; the artifact should carry the licence that claim refers to.
  copyFileSync(path.join(ROOT, 'LICENSE'), path.join(stageDir, 'server', 'LICENSE'));
  writeFileSync(
    path.join(stageDir, 'manifest.json'),
    `${JSON.stringify(bundleManifest({ version: pkg.version, description: pkg.description, triples: programs.map(({ triple }) => triple) }), null, 2)}\n`,
  );
  return stageDir;
}

function zip(stageDir, artifact) {
  mkdirSync(path.dirname(artifact), { recursive: true });
  rmSync(artifact, { force: true });
  const zipped = spawnSync('zip', ['-qr', artifact, '.', '-x', '.*'], { cwd: stageDir, encoding: 'utf8' });
  if (zipped.status !== 0) fail(`zip failed: ${zipped.stderr || zipped.stdout}`);
}

function main() {
  const pkg = readJson(path.join(MCP_DIR, 'package.json'));
  const programs = programsToBundle();
  const problems = bundleProgramProblems(programs.map(({ triple }) => triple));
  if (problems.length > 0) fail(problems.join('\n  '));
  for (const { file } of programs) if (!statSync(file, { throwIfNoEntry: false })?.isFile()) fail(`program is missing: ${file}`);
  if (!statSync(VERIFY_VAULT, { throwIfNoEntry: false })?.isDirectory()) fail(`verification vault is missing: ${path.relative(ROOT, VERIFY_VAULT)}`);
  if (checkOnly) {
    console.log(`[mcp-bundle] inputs current · ${programs.length} program(s) · v${pkg.version} ✓`);
    return 0;
  }

  const stageDir = stage(programs, pkg);
  const host = hostProgramTriple();
  // A static musl program starts on a glibc Linux of the same architecture.
  const bootable = [host, host?.replace(/-gnu$/, '-musl')];
  const booted = programs.find(({ triple }) => bootable.includes(triple));
  if (!booted) fail(`none of the programs (${programs.map(({ triple }) => triple).join(', ')}) runs on this machine (${host}), so none could be booted before the artifact was written`);
  writeFileSync(
    path.join(stageDir, 'server', 'BUILD-PROVENANCE.txt'),
    bundleProvenance({
      version: pkg.version,
      commit: headCommit(),
      tag: releaseTag,
      builtAt: new Date().toISOString(),
      triples: programs.map(({ triple }) => triple),
      bootedTriple: booted.triple,
    }),
  );
  const artifact = path.join(OUTPUT_DIR, `ontology-atlas-mcp-${pkg.version}.mcpb`);
  zip(stageDir, artifact);

  const unpacked = mkdtempSync(path.join(tmpdir(), 'ontology-atlas-mcpb-installed-'));
  const unzipped = spawnSync('unzip', ['-q', artifact, '-d', unpacked], { encoding: 'utf8' });
  if (unzipped.status !== 0) fail(`could not unpack the artifact: ${unzipped.stderr || unzipped.stdout}`);
  const manifest = readJson(path.join(unpacked, 'manifest.json'));
  for (const { triple } of programs) {
    if (!existsSync(path.join(unpacked, bundleProgramPath(triple)))) fail(`the artifact lacks ${bundleProgramPath(triple)}`);
  }
  // Booted the way a host starts it: the command the manifest names for this system, which for a
  // system with two architectures is the selector, so the boot also proves it picks this machine's.
  const hostCommand = manifest.server.mcp_config.platform_overrides[process.platform]?.command;
  if (!hostCommand) fail(`the manifest names no command for ${process.platform}`);
  const bootedFrom = hostCommand.replace('${__dirname}', unpacked);
  return verifyMcpBinary({ binaryPath: bootedFrom, vaultPath: VERIFY_VAULT }).then((verified) => {
    const sha256 = createHash('sha256').update(readFileSync(artifact)).digest('hex');
    const bytes = statSync(artifact).size;
    rmSync(stageDir, { recursive: true, force: true });
    rmSync(unpacked, { recursive: true, force: true });
    writeFileSync(
      `${artifact}.provenance.json`,
      `${JSON.stringify({ version: pkg.version, commit: headCommit(), tag: releaseTag, sha256, programs: programs.map(({ triple }) => triple), booted: booted.triple }, null, 2)}\n`,
    );
    console.log(`[mcp-bundle] ${path.relative(ROOT, artifact)}`);
    console.log(`[mcp-bundle] ${bytes} bytes · v${verified.version} · ${verified.toolCount} tools · ${manifest.compatibility.platforms.join(', ')}`);
    console.log(`[mcp-bundle] sha256 ${sha256}`);
    console.log(`[mcp-bundle] booted ${booted.triple} from the unpacked artifact and read one real concept ✓`);
    return 0;
  });
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}

