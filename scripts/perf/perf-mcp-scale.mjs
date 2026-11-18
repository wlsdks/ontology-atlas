#!/usr/bin/env node
// Measures MCP read calls on a generated vault of thousands to tens of thousands of files.
// Usage: pnpm perf:mcp:scale -- --files=50000 --flow=a --flow=b [--server=<path>] [--dir=<path>] [--check]
//   flow a: every page is a node. flow b: a few thousand nodes over many plain documents.
//   --server: an entry script (run with node) or a compiled binary; default the source server.
//   --dir: where generated vaults are kept and reused; default the OS temp folder.
//   --check: exit 1 when a second call exceeds --max-cpu-ms (600) or memory exceeds --max-rss-mb (1024).
// CPU is the server process's user+system time across one call, read from the OS, so it
// includes everything the call cost and nothing the harness did.

import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateScaleVault } from './gen-scale-vault.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const flag = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const files = Number(flag('files', '10000'));
const flows = args.filter((arg) => arg.startsWith('--flow=')).map((arg) => arg.slice(7));
const server = resolve(flag('server', join(ROOT, 'mcp/src/index.js')));
const baseDir = resolve(flag('dir', join(tmpdir(), 'atlas-mcp-scale')));
const check = args.includes('--check');
const maxCpuMs = Number(flag('max-cpu-ms', '600'));
const maxRssMb = Number(flag('max-rss-mb', '1024'));
const TOTAL_CALLS = 20;
const SHAPES = { a: 'all', b: 'key' };

if (!Number.isInteger(files) || files < 100) usage('--files must be an integer of at least 100');
if (flows.length === 0) flows.push('a');
for (const flow of flows) if (!SHAPES[flow]) usage(`unknown --flow=${flow}`);

function usage(message) {
  console.error(`[perf-mcp-scale] ${message}`);
  console.error('usage: pnpm perf:mcp:scale -- --files=<n> --flow=a|b [--flow=b] [--server=<path>] [--dir=<path>] [--check]');
  process.exit(2);
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

function startServer(vault) {
  const runsWithNode = /\.(?:c|m)?js$/.test(server);
  const child = spawn(runsWithNode ? process.execPath : server, runsWithNode ? [server] : [], {
    env: { ...process.env, OATLAS_VAULT: vault, OATLAS_REPO_ROOT: vault },
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const waiters = new Map();
  let buffer = '';
  let nextId = 1;
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    for (let newline = buffer.indexOf('\n'); newline >= 0; newline = buffer.indexOf('\n')) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      waiters.get(message.id)?.(message);
      waiters.delete(message.id);
    }
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
];

async function measureFlow(flow) {
  const vault = ensureVault(flow);
  // A file written less than 2 s ago is re-read on every call by design (the racy
  // window); a vault generated just now would measure that, not the steady state.
  const age = Date.now() - statSync(join(vault, '.atlas-scale.json')).mtimeMs;
  if (age < 2500) await sleep(2500 - age);
  const { child, rpc } = startServer(vault);
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'perf-mcp-scale', version: '0' } });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
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

const results = [];
for (const flow of flows) results.push(await measureFlow(flow));

console.log(`# perf-mcp-scale — ${files} files, server ${server.replace(`${ROOT}/`, '')}`);
console.log(`${'call'.padEnd(18)}${results.map((result) => `flow ${result.flow} 1st / 2nd ms`.padStart(24)).join('')}`);
for (let index = 0; index < READS.length; index += 1) {
  console.log(`${READS[index][0].padEnd(18)}${results.map((result) => `${result.rows[index].first} / ${result.rows[index].second}`.padStart(24)).join('')}`);
}
console.log(`${'after 1-file edit'.padEnd(18)}${results.map((result) => `get_concept ${result.afterEdit}`.padStart(24)).join('')}`);
console.log(`${`rss after ${TOTAL_CALLS} calls`.padEnd(18)}${results.map((result) => `${result.rss} MB`.padStart(24)).join('')}`);
if (results.some((result) => result.footprint)) {
  console.log(`${'footprint / peak'.padEnd(18)}${results.map((result) => `${result.footprint?.now ?? '?'} / ${result.footprint?.peak ?? '?'} MB`.padStart(24)).join('')}`);
}

if (check) {
  const failures = [];
  for (const result of results) {
    for (const row of result.rows) {
      if (row.second > maxCpuMs) failures.push(`flow ${result.flow} ${row.name} second call ${row.second} ms > ${maxCpuMs} ms`);
    }
    if (result.rss > maxRssMb) failures.push(`flow ${result.flow} resident memory ${result.rss} MB > ${maxRssMb} MB`);
  }
  if (failures.length > 0) {
    console.error(failures.map((line) => `✗ ${line}`).join('\n'));
    process.exit(1);
  }
  console.log(`✓ every second call ≤ ${maxCpuMs} ms CPU and resident memory ≤ ${maxRssMb} MB`);
}
