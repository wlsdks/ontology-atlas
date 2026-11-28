#!/usr/bin/env node
// Measures the MCP programs side by side, each row in a fresh process, and fails when the Rust
// program is larger, slower or heavier than the Bun binary in any row. The rows are the table
// "Today" of docs/specs/2026-11-27-mcp-server-in-rust.md.
//
//   pnpm perf:mcp:baseline -- [--programs=rust,bun] [--runs=7] [--rust=<path>] [--bun=<path>] [--json]
//
//   rust  the program `pnpm mcp:build-binary` placed in src-tauri/binaries
//   bun   the JavaScript server compiled by the pinned Bun with the flags the app once shipped,
//         built into a scratch folder on first use (needs Bun and `pnpm --dir mcp install`)
//   node  the JavaScript server on Node (printed, never gated)
//
// A row's time is the median of --runs runs; its memory is the most the process held over the run
// (resident set and, on macOS, the physical footprint Activity Monitor shows), read by
// `/usr/bin/time` from the operating system when the process ends, so it includes everything and
// nothing the harness itself held. Heap by space is not measured here: only a Node process can
// report it (`perf-mcp-scale --tool=<name>` does for the source server).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { BUN_VERSION_FILE, bunCompileArgs, bunVersionVerdict, pinnedBunVersion } from '../lib/packaging/mcp-binary.mjs';
import { hostProgramTriple, sidecarPath } from '../packaging/rust-mcp-program.mjs';
import { generateScaleVault } from './gen-scale-vault.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const flag = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const programNames = flag('programs', 'rust,bun').split(',');
const runs = Number(flag('runs', '7'));
const json = args.includes('--json');
const JAVASCRIPT_SERVER = join(ROOT, 'mcp', 'src', 'javascript-server.mjs');
const GENERATED_DOCUMENTS = 5000;
const ANSWER_LIMIT_MS = 120_000;
const MB = 1024 * 1024;

function usage(message) {
  console.error(`[perf-mcp-baseline] ${message}`);
  console.error('usage: pnpm perf:mcp:baseline -- [--programs=rust,bun,node] [--runs=<odd n>] [--rust=<path>] [--bun=<path>] [--json]');
  process.exit(2);
}
if (!Number.isInteger(runs) || runs < 1) usage('--runs must be a positive integer');
for (const name of programNames) if (!['rust', 'bun', 'node'].includes(name)) usage(`unknown program ${name}`);
if (!['darwin', 'linux'].includes(process.platform)) usage('memory is read with /usr/bin/time, which exists on macOS and Linux only');

function scratchFolder() {
  const folder = join(tmpdir(), 'atlas-mcp-baseline');
  mkdirSync(folder, { recursive: true });
  return folder;
}

/** The command and arguments that start each program. */
function resolveProgram(name) {
  if (name === 'node') return { name, command: process.execPath, args: [JAVASCRIPT_SERVER], bytes: null };
  if (name === 'rust') {
    const path = resolve(flag('rust', sidecarPath(ROOT, hostProgramTriple())));
    if (!existsSync(path)) usage(`no Rust program at ${path}; run pnpm mcp:build-binary`);
    return { name, command: path, args: [], bytes: statSync(path).size };
  }
  const path = resolve(flag('bun', join(scratchFolder(), 'bun-reference')));
  if (!existsSync(path)) buildBunReference(path);
  return { name, command: path, args: [], bytes: statSync(path).size };
}

function buildBunReference(outfile) {
  const version = spawnSync('bun', ['--version'], { encoding: 'utf8' });
  if (version.status !== 0) usage('the bun row needs Bun; install the pinned release or pass --bun=<binary>');
  const pinned = pinnedBunVersion(readFileSync(join(ROOT, BUN_VERSION_FILE), 'utf8'));
  const verdict = bunVersionVerdict(pinned, version.stdout);
  if (verdict) console.warn(`# ${verdict.message.split('\n')[0]}`);
  const compileArgs = bunCompileArgs({
    triple: hostProgramTriple(),
    entry: JAVASCRIPT_SERVER,
    outfile,
  });
  const compiled = spawnSync('bun', compileArgs, { stdio: 'inherit', cwd: ROOT });
  if (compiled.status !== 0) usage(`bun could not compile the JavaScript server (exit ${compiled.status})`);
  // macOS 27 kills a Bun-compiled binary with Bun's signature before its first instruction.
  if (process.platform === 'darwin') spawnSync('codesign', ['-s', '-', '-f', outfile], { stdio: 'ignore' });
}

/** A generated vault of `GENERATED_DOCUMENTS` documents, kept and reused between runs. */
async function generatedVault() {
  const directory = join(scratchFolder(), `all-${GENERATED_DOCUMENTS}`);
  const marker = join(directory, '.atlas-scale.json');
  if (!existsSync(marker)) {
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(directory, { recursive: true });
    writeFileSync(marker, JSON.stringify(generateScaleVault(directory, GENERATED_DOCUMENTS, 'all')));
  }
  // A file written less than two seconds ago is re-read on every call by design.
  const age = Date.now() - statSync(marker).mtimeMs;
  if (age < 2500) await sleep(2500 - age);
  return directory;
}

/** What `/usr/bin/time` printed, as bytes: the largest resident set and, on macOS, the peak footprint. */
function readPeaks(stderr) {
  if (process.platform === 'darwin') {
    const rss = /^\s*(\d+)\s+maximum resident set size/m.exec(stderr)?.[1];
    const footprint = /^\s*(\d+)\s+peak memory footprint/m.exec(stderr)?.[1];
    return { rss: rss ? Number(rss) : null, footprint: footprint ? Number(footprint) : null };
  }
  const kilobytes = /Maximum resident set size \(kbytes\): (\d+)/.exec(stderr)?.[1];
  return { rss: kilobytes ? Number(kilobytes) * 1024 : null, footprint: null };
}

/**
 * One fresh process: initialize, tools/list, then an optional call. The time is from the start of
 * the process to the `tools/list` answer, or the call alone when there is one.
 */
function runOnce(program, { vault, repositoryRoot, call }) {
  return new Promise((resolveRun, rejectRun) => {
    const timeArgs = process.platform === 'darwin' ? ['-l'] : ['-v'];
    const child = spawn('/usr/bin/time', [...timeArgs, program.command, ...program.args], {
      env: { ...process.env, OATLAS_VAULT: vault, ...(repositoryRoot ? { OATLAS_REPO_ROOT: repositoryRoot } : {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const started = performance.now();
    let callStarted = null;
    let result = null;
    let stdout = '';
    let stderr = '';
    const deadline = setTimeout(() => {
      child.kill('SIGKILL');
      rejectRun(new Error(`${program.name} did not answer within ${ANSWER_LIMIT_MS / 1000} s`));
    }, ANSWER_LIMIT_MS);
    const send = (id, method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      for (let newline = stdout.indexOf('\n'); newline >= 0; newline = stdout.indexOf('\n')) {
        const line = stdout.slice(0, newline);
        stdout = stdout.slice(newline + 1);
        if (!line.trim()) continue;
        const message = JSON.parse(line);
        const bytes = Buffer.byteLength(line);
        if (message.id === 1) {
          child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
          send(2, 'tools/list', {});
        } else if (message.id === 2) {
          const listAnswerMs = performance.now() - started;
          if (!call) {
            result = { ms: listAnswerMs, bytes };
            child.stdin.end();
          } else {
            callStarted = performance.now();
            send(3, 'tools/call', call);
          }
        } else if (message.id === 3) {
          if (message.error || message.result?.isError) {
            rejectRun(new Error(`${program.name} ${call.name} failed: ${JSON.stringify(message.error ?? message.result).slice(0, 300)}`));
            child.stdin.end();
          } else {
            result = { ms: performance.now() - callStarted, bytes };
            child.stdin.end();
          }
        }
      }
    });
    child.on('error', rejectRun);
    child.on('close', () => {
      clearTimeout(deadline);
      if (!result) return rejectRun(new Error(`${program.name} ended without an answer: ${stderr.slice(0, 300)}`));
      resolveRun({ ...result, ...readPeaks(stderr) });
    });
    send(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'perf-mcp-baseline', version: '0' } });
  });
}

const median = (values) => {
  const sorted = values.filter((value) => value !== null).sort((a, b) => a - b);
  return sorted.length === 0 ? null : sorted[Math.floor(sorted.length / 2)];
};

const toMb = (bytes) => (bytes === null ? null : bytes / MB);

async function measureRow(program, row) {
  const samples = [];
  for (let index = 0; index < runs; index += 1) samples.push(await runOnce(program, row));
  return {
    ms: median(samples.map((sample) => sample.ms)),
    rssMb: toMb(median(samples.map((sample) => sample.rss))),
    footprintMb: toMb(median(samples.map((sample) => sample.footprint))),
    bytes: samples[0].bytes,
  };
}

const generated = await generatedVault();
const ROWS = [
  { label: 'start to tools/list answered, samples/storefront', vault: join(ROOT, 'samples', 'storefront') },
  { label: 'validate_vault, docs/ontology (call only)', vault: join(ROOT, 'docs', 'ontology'), call: { name: 'validate_vault', arguments: {} } },
  { label: `${GENERATED_DOCUMENTS} documents, first list_concepts`, vault: generated, repositoryRoot: generated, call: { name: 'list_concepts', arguments: {} } },
  { label: `${GENERATED_DOCUMENTS} documents, validate_vault`, vault: generated, repositoryRoot: generated, call: { name: 'validate_vault', arguments: {} } },
];

const programs = programNames.map(resolveProgram);
const table = { programs: programNames, runs, sizeBytes: {}, rows: [] };
for (const program of programs) table.sizeBytes[program.name] = program.bytes;
for (const row of ROWS) {
  const measured = {};
  for (const program of programs) measured[program.name] = await measureRow(program, row);
  table.rows.push({ label: row.label, ...(row.call ? {} : { toolsListBytes: Object.fromEntries(programNames.map((name) => [name, measured[name].bytes])) }), measured });
}

// The rows a figure gates: Rust against Bun, never larger.
const failures = [];
const gate = (label, rust, bun) => {
  if (rust === null || rust === undefined || bun === null || bun === undefined) failures.push(`${label}: a figure is missing (rust ${rust}, bun ${bun})`);
  else if (rust > bun) failures.push(`${label}: Rust ${typeof rust === 'number' ? rust.toFixed(1) : rust} is larger than Bun ${bun.toFixed(1)}`);
};
if (programNames.includes('rust') && programNames.includes('bun')) {
  gate('program size (MiB)', table.sizeBytes.rust / MB, table.sizeBytes.bun / MB);
  for (const row of table.rows) {
    gate(`${row.label}, time (ms)`, row.measured.rust.ms, row.measured.bun.ms);
    gate(`${row.label}, resident (MB)`, row.measured.rust.rssMb, row.measured.bun.rssMb);
    if (process.platform === 'darwin') gate(`${row.label}, footprint (MB)`, row.measured.rust.footprintMb, row.measured.bun.footprintMb);
  }
}

if (json) {
  console.log(JSON.stringify({ ...table, failures }, null, 2));
} else {
  const cell = (value, digits = 0) => (value === null || value === undefined ? 'n/a' : value.toFixed(digits));
  console.log(`# perf-mcp-baseline: median of ${runs}, ${process.platform} ${process.arch}`);
  console.log(`program size (bytes)  ${programNames.map((name) => `${name} ${table.sizeBytes[name] ?? 'none'}`).join('   ')}`);
  for (const row of table.rows) {
    console.log(`\n${row.label}`);
    for (const name of programNames) {
      const figure = row.measured[name];
      console.log(`  ${name.padEnd(5)} ${cell(figure.ms).padStart(7)} ms  resident ${cell(figure.rssMb, 1).padStart(6)} MB  footprint ${cell(figure.footprintMb, 1).padStart(6)} MB  (${figure.bytes} bytes answered)`);
    }
  }
  console.log('\nheap by space: not measured here (only a Node process reports it).');
  console.log(failures.length === 0 ? '\n✓ no Rust figure is larger than the Bun binary\'s' : `\n${failures.map((line) => `✗ ${line}`).join('\n')}`);
}
process.exit(failures.length === 0 ? 0 : 1);
