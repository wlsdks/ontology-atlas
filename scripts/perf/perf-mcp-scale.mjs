#!/usr/bin/env node
// Measures MCP read calls on a generated vault of thousands to tens of thousands of files.
// Usage: pnpm perf:mcp:scale -- --files=50000 --flow=a --flow=b [--server=<path>] [--dir=<path>] [--check] [--tool=<name>]
//   flow a: every page is a node. flow b: a few thousand nodes over many plain documents.
//   --server: an entry script (run with node) or a compiled binary; default the source server.
//   --dir: where generated vaults are kept and reused; default the OS temp folder.
//   --check: at 50,000 files and both flows unless given, gates the compiled binary the app ships (--server, or the one `pnpm mcp:build-binary`
//     placed): exit 1 when a second call exceeds --max-cpu-ms (600) or, on macOS, the physical
//     footprint after 20 calls exceeds --max-footprint-mb (185) or its peak --max-peak-footprint-mb
//     (470): the most two runs measured on either flow (159 and 410 MB) with about 15% added, so a
//     regression of a few dozen MB fails. The footprint is what Activity Monitor shows and what the user pays. RSS is printed,
//     never gated: on macOS it keeps counting freed pages the allocator holds for reuse, and
//     elsewhere the footprint is not read, so memory is not gated there. The source server is
//     measured after it and printed, not gated.
//   --tool: measure one tool with no arguments instead of the read table: two calls, each with
//     its response size in bytes and its wall time, for a call whose cost is the reply itself.
// CPU is the server process's user+system time across one call, read from the OS, so it
// includes everything the call cost and nothing the harness did.

import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { binaryFileNameForTriple, hostTargetTriple, MCP_BINARY_OUTPUT_DIR } from '../lib/packaging/mcp-binary.mjs';
import { generateScaleVault } from './gen-scale-vault.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const flag = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const flows = args.filter((arg) => arg.startsWith('--flow=')).map((arg) => arg.slice(7));
const SOURCE_SERVER = join(ROOT, 'mcp/src/index.js');
const check = args.includes('--check');
// The gate measures the scale the budgets were set for; a smaller default would pass by size alone.
const files = Number(flag('files', check ? '50000' : '10000'));
const explicitServer = flag('server', null);
const server = explicitServer ? resolve(explicitServer) : check ? builtBinary() : SOURCE_SERVER;
const isScript = (path) => /\.(?:c|m)?js$/.test(path);
const baseDir = resolve(flag('dir', join(tmpdir(), 'atlas-mcp-scale')));
const maxCpuMs = Number(flag('max-cpu-ms', '600'));
const maxFootprintMb = Number(flag('max-footprint-mb', '185'));
const maxPeakFootprintMb = Number(flag('max-peak-footprint-mb', '470'));
const TOTAL_CALLS = 20;
const SHAPES = { a: 'all', b: 'key' };
const tool = flag('tool', null);

if (!Number.isInteger(files) || files < 100) usage('--files must be an integer of at least 100');
if (tool !== null && check) usage('--tool measures one call and gates nothing; drop --check');
if (check && isScript(server)) usage('--check gates the compiled binary the app ships; pass --server=<binary> or omit --server');
if (flows.length === 0) flows.push(...(check ? ['a', 'b'] : ['a']));
for (const flow of flows) if (!SHAPES[flow]) usage(`unknown --flow=${flow}`);

function usage(message) {
  console.error(`[perf-mcp-scale] ${message}`);
  console.error('usage: pnpm perf:mcp:scale -- --files=<n> --flow=a|b [--flow=b] [--server=<path>] [--dir=<path>] [--check] [--tool=<name>]');
  process.exit(2);
}

function builtBinary() {
  const path = join(ROOT, MCP_BINARY_OUTPUT_DIR, binaryFileNameForTriple(hostTargetTriple()));
  if (!existsSync(path)) usage(`--check gates the compiled server; build it with \`pnpm mcp:build-binary\` or pass --server=<binary> (looked for ${path})`);
  return path;
}

/** Reuses a vault generated with the same flow and size; the marker is a dotfile, which the walk skips. */
function ensureVault(flow) {
  const dir = join(baseDir, `${flow}-${files}`);
  const marker = join(dir, '.atlas-scale.json');
  if (existsSync(marker)) return dir;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const started = performance.now();
  const written = generateScaleVault(dir, files, SHAPES[flow]);
  writeFileSync(marker, JSON.stringify(written));
  console.log(`# generated flow ${flow}: ${written.files} files, ${written.nodes} nodes, ${(written.bytes / 1048576).toFixed(0)} MB in ${((performance.now() - started) / 1000).toFixed(1)} s`);
  return dir;
}

function cpuMs(pid) {
  if (process.platform === 'linux') {
    const fields = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
    return (Number(fields[11]) + Number(fields[12])) * 10;
  }
  const text = execFileSync('ps', ['-o', 'cputime=', '-p', String(pid)], { encoding: 'utf8' }).trim();
  const match = text.match(/^(?:(\d+):)?(\d+):(\d+)(?:\.(\d+))?$/);
  if (!match) return Number.NaN;
  const [, hours = '0', minutes, seconds, fraction = '0'] = match;
  return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + Number(fraction.padEnd(3, '0').slice(0, 3));
}

function rssMb(pid) {
  return Math.round(Number(execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' }).trim()) / 1024);
}

/**
 * macOS RSS also counts pages the allocator has already marked reusable; the
 * physical footprint (what Activity Monitor shows) excludes them. Null elsewhere.
 */
function footprintMb(pid) {
  if (process.platform !== 'darwin') return null;
  try {
    const text = execFileSync('vmmap', ['--summary', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const read = (label) => {
      const match = text.match(new RegExp(`${label}:\\s+([\\d.]+)([KMG])`));
      if (!match) return null;
      const scale = { K: 1 / 1024, M: 1, G: 1024 }[match[2]];
      return Math.round(Number(match[1]) * scale);
    };
    return { now: read('Physical footprint'), peak: read('Physical footprint \\(peak\\)') };
  } catch {
    return null;
  }
}

function startServer(serverPath, vault) {
  const runsWithNode = isScript(serverPath);
  const child = spawn(runsWithNode ? process.execPath : serverPath, runsWithNode ? [serverPath] : [], {
    env: { ...process.env, OATLAS_VAULT: vault, OATLAS_REPO_ROOT: vault },
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const waiters = new Map();
  // Chunks are kept apart until a newline arrives: appending each to one string and
  // searching it from the start is quadratic in a reply's size, which turned a
  // 200 MB reply into minutes of this harness's own CPU.
  let pending = [];
  let nextId = 1;
  // Decoded by the stream, so a character split across two chunks stays whole.
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    let rest = chunk;
    for (let newline = rest.indexOf('\n'); newline >= 0; newline = rest.indexOf('\n')) {
      pending.push(rest.slice(0, newline));
      rest = rest.slice(newline + 1);
      const line = pending.join('');
      pending = [];
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      Object.defineProperty(message, 'bytes', { value: Buffer.byteLength(line, 'utf8') });
      waiters.get(message.id)?.(message);
      waiters.delete(message.id);
    }
    if (rest) pending.push(rest);
  });
  const rpc = (method, params) => new Promise((resolveCall) => {
    const id = nextId;
    nextId += 1;
    waiters.set(id, resolveCall);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  return { child, rpc };
}

const READS = [
  ['get_concept', { slug: 'capabilities/cap-5' }],
  ['find_backlinks', { slug: 'elements/el-15' }],
  ['find_path', { from: 'capabilities/cap-5', to: 'domains/dom-1' }],
  ['compile_ontology', { summary: true }],
  // The one read that scores file text, which the server reads back from disk: a
  // phrase few files hold, and a word about half of them hold, so half the bodies
  // are read and scored.
  ['find_evidence', { title: 'relation boundary meaning' }, 'evidence phrase'],
  ['find_evidence', { title: 'meaning' }, 'evidence word'],
];

async function openFlow(serverPath, flow) {
  const vault = ensureVault(flow);
  // A file written less than 2 s ago is re-read on every call by design (the racy
  // window); a vault generated just now would measure that, not the steady state.
  const age = Date.now() - statSync(join(vault, '.atlas-scale.json')).mtimeMs;
  if (age < 2500) await sleep(2500 - age);
  const { child, rpc } = startServer(serverPath, vault);
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'perf-mcp-scale', version: '0' } });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  return { vault, child, rpc };
}

/** Two calls of one tool: the reply's size and the wall time the caller waited, then CPU. */
async function measureTool(serverPath, flow, name) {
  const { child, rpc } = await openFlow(serverPath, flow);
  const calls = [];
  try {
    for (let index = 0; index < 2; index += 1) {
      const before = cpuMs(child.pid);
      const started = performance.now();
      const response = await rpc('tools/call', { name, arguments: {} });
      const wallMs = Math.round(performance.now() - started);
      if (response.error || response.result?.isError) {
        throw new Error(`${name} failed: ${JSON.stringify(response.error ?? response.result).slice(0, 300)}`);
      }
      calls.push({ bytes: response.bytes, wallMs, cpuMs: cpuMs(child.pid) - before });
    }
  } finally {
    child.kill();
  }
  return { flow, calls };
}

async function measureFlow(serverPath, flow) {
  const { vault, child, rpc } = await openFlow(serverPath, flow);
  let calls = 0;
  const call = async (name, argumentsValue) => {
    const before = cpuMs(child.pid);
    const response = await rpc('tools/call', { name, arguments: argumentsValue });
    calls += 1;
    const failed = response.error || response.result?.isError;
    if (failed) throw new Error(`${name} failed: ${JSON.stringify(response.error ?? response.result).slice(0, 300)}`);
    return cpuMs(child.pid) - before;
  };
  const rows = [];
  for (const [name, argumentsValue] of READS) {
    const first = await call(name, argumentsValue);
    const second = await call(name, argumentsValue);
    rows.push({ name, first, second });
  }
  // Touch one file, as an editor would, and pay for what changed.
  const touched = join(vault, 'capabilities/cap-7.md');
  const original = readFileSync(touched, 'utf8');
  appendFileSync(touched, '\n- perf touch\n');
  let afterEdit;
  try {
    afterEdit = await call('get_concept', { slug: 'capabilities/cap-7' });
  } finally {
    writeFileSync(touched, original);
  }
  while (calls < TOTAL_CALLS) {
    const [name, argumentsValue] = READS[calls % READS.length];
    await call(name, argumentsValue);
  }
  const rss = rssMb(child.pid);
  const footprint = footprintMb(child.pid);
  child.kill();
  return { flow, files, rows, afterEdit, calls, rss, footprint };
}

function printTable(serverPath, results, note = '') {
  console.log(`# perf-mcp-scale — ${files} files, server ${serverPath.replace(`${ROOT}/`, '')}${note}`);
  console.log(`${'call'.padEnd(18)}${results.map((result) => `flow ${result.flow} 1st / 2nd ms`.padStart(24)).join('')}`);
  for (let index = 0; index < READS.length; index += 1) {
    console.log(`${(READS[index][2] ?? READS[index][0]).padEnd(18)}${results.map((result) => `${result.rows[index].first} / ${result.rows[index].second}`.padStart(24)).join('')}`);
  }
  console.log(`${'after 1-file edit'.padEnd(18)}${results.map((result) => `get_concept ${result.afterEdit}`.padStart(24)).join('')}`);
  if (results.some((result) => result.footprint)) {
    console.log(`${`footprint after ${TOTAL_CALLS}`.padEnd(18)}${results.map((result) => `${result.footprint?.now ?? '?'} MB`.padStart(24)).join('')}`);
    console.log(`${'footprint peak'.padEnd(18)}${results.map((result) => `${result.footprint?.peak ?? '?'} MB`.padStart(24)).join('')}`);
  }
  console.log(`${'rss (not gated)'.padEnd(18)}${results.map((result) => `${result.rss} MB`.padStart(24)).join('')}`);
  if (process.platform !== 'darwin') console.log('# memory is not gated on this OS: only macOS reports the physical footprint here');
}

if (tool !== null) {
  console.log(`# perf-mcp-scale — ${tool}, ${files} files, server ${server.replace(`${ROOT}/`, '')}`);
  for (const flow of flows) {
    const { calls } = await measureTool(server, flow, tool);
    calls.forEach((row, index) => {
      console.log(`flow ${flow} call ${index + 1}: ${row.bytes} bytes (${(row.bytes / 1024).toFixed(1)} KiB), ${row.wallMs} ms wall, ${row.cpuMs} ms CPU`);
    });
  }
  process.exit(0);
}

const results = [];
for (const flow of flows) results.push(await measureFlow(server, flow));
printTable(server, results, check ? ' (gated)' : '');

if (check && !isScript(server)) {
  const sourceResults = [];
  for (const flow of flows) sourceResults.push(await measureFlow(SOURCE_SERVER, flow));
  printTable(SOURCE_SERVER, sourceResults, ' (printed, not gated)');
}

if (check) {
  const failures = [];
  for (const result of results) {
    for (const row of result.rows) {
      if (row.second > maxCpuMs) failures.push(`flow ${result.flow} ${row.name} second call ${row.second} ms > ${maxCpuMs} ms`);
    }
    if (process.platform !== 'darwin') continue;
    const footprint = result.footprint;
    if (footprint?.now == null || footprint?.peak == null) {
      failures.push(`flow ${result.flow} physical footprint could not be read (vmmap)`);
      continue;
    }
    if (footprint.now > maxFootprintMb) failures.push(`flow ${result.flow} physical footprint after ${TOTAL_CALLS} calls ${footprint.now} MB > ${maxFootprintMb} MB`);
    if (footprint.peak > maxPeakFootprintMb) failures.push(`flow ${result.flow} peak physical footprint ${footprint.peak} MB > ${maxPeakFootprintMb} MB`);
  }
  if (failures.length > 0) {
    console.error(failures.map((line) => `✗ ${line}`).join('\n'));
    process.exit(1);
  }
  console.log(process.platform === 'darwin'
    ? `✓ every second call ≤ ${maxCpuMs} ms CPU; physical footprint ≤ ${maxFootprintMb} MB after ${TOTAL_CALLS} calls, peak ≤ ${maxPeakFootprintMb} MB`
    : `✓ every second call ≤ ${maxCpuMs} ms CPU; memory not gated on this OS`);
}
