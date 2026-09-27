#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'mcp', 'src', 'index.js');
const PROBE = join(ROOT, 'scripts/lib/mcp-memory-probe.mjs');
const KB = 1024;
const MB = 1024 * 1024;

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const check = args.includes('--check');
const json = args.includes('--json');
const calls = integerFlag('--calls=', 50, { min: 10, max: 500 });
const commits = integerFlag('--commits=', 10, { min: 4, max: 20 });
const WARM_UP_CALLS = 5;
const FIRST_MEASURED_COMMIT = 2;

const BUDGETS = {
  // measured 2026-09-28: at most 12.9 KB per call (agent_brief)
  leakBytesPerCall: 64 * KB,
  // measured 2026-09-28: 85 KB per commit
  headMoveBytesPerCommit: 2 * MB,
};

function integerFlag(prefix, fallback, { min, max }) {
  const raw = args.find((arg) => arg.startsWith(prefix));
  if (!raw) return fallback;
  const value = Number(raw.slice(prefix.length));
  if (!Number.isInteger(value) || value < min || value > max) {
    console.error(`[perf-mcp-memory] ${prefix.slice(0, -1)} must be an integer from ${min} to ${max}`);
    process.exit(2);
  }
  return value;
}

function buildFixture() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-mcp-memory-'));
  const git = (...gitArgs) => execFileSync('git', ['-C', root, ...gitArgs], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Atlas Memory Check');
  git('config', 'user.email', 'memory-check@example.invalid');
  const DOMAINS = 12;
  const CAPABILITIES = 160;
  const ELEMENTS = 60;
  const REVISIONS = 40;
  const uid = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  const sources = Array.from({ length: 24 }, (_, index) => `src/module-${index}.mjs`);
  const sourceText = (index) => `import { helper } from './module-${(index + 1) % 24}.mjs';\nexport function run${index}() { return helper(); }\n`;
  const domainOf = (index) => `domains/d-${index % DOMAINS}`;
  const capabilities = Array.from({ length: CAPABILITIES }, (_, index) => `capabilities/c-${index}`);
  const elements = Array.from({ length: ELEMENTS }, (_, index) => `elements/e-${index}`);
  const prose = (words) => Array.from({ length: words }, (_, index) => ['vault', 'graph', 'relation', 'review', 'evidence', 'summary', 'domain', 'boundary'][index % 8]).join(' ');
  const body = (subject, index) => [
    `The ${subject} ${index} exists so that a reviewer can follow ${prose(14)}.`,
    '',
    '## Includes',
    `- ${prose(12)}`,
    '',
    '## Excludes',
    `- ${prose(10)}`,
    ...(index % 3 === 0 ? [] : ['', '## Uncertainty', `- Not read: ${prose(8)}.`]),
    '',
  ].join('\n');
  const frontmatter = (fields) => ['---', ...Object.entries(fields).map(([key, value]) => (
    Array.isArray(value) ? `${key}: [${value.join(', ')}]` : `${key}: ${value}`
  )), '---', ''].join('\n');
  const files = new Map();
  sources.forEach((path, index) => files.set(path, sourceText(index)));
  files.set('vault/project.md', `${frontmatter({
    uid: uid(0), slug: 'project', kind: 'project', title: 'Memory Fixture',
    domains: Array.from({ length: DOMAINS }, (_, index) => `domains/d-${index}`),
  })}${body('project', 0)}`);
  capabilities.forEach((slug, index) => files.set(`vault/${slug}.md`, `${frontmatter({
    uid: uid(1000 + index), slug, kind: 'capability', title: `Capability ${index}`, domain: domainOf(index),
    path: sources[index % sources.length],
    depends_on: [capabilities[(index + 7) % CAPABILITIES]],
    elements: [elements[index % ELEMENTS]],
  })}${body('capability', index)}`));
  elements.forEach((slug, index) => files.set(`vault/${slug}.md`, `${frontmatter({
    uid: uid(5000 + index), slug, kind: 'element', title: `Element ${index}`, domain: domainOf(index),
    path: sources[(index + 3) % sources.length],
  })}${body('element', index)}`));
  const domainFile = (index, revision) => {
    const members = capabilities.filter((_, capability) => capability % DOMAINS === index)
      .slice(0, 4 + (revision % 10));
    const summary = Array.from({ length: 150 }, () => `Revision ${revision} of domain ${index}: ${prose(16)}.`).join('\n');
    return `${frontmatter({
      uid: uid(9000 + index), slug: `domains/d-${index}`, kind: 'domain', title: `Domain ${index}`, capabilities: members,
    })}${body('domain', index)}\n${summary}\n`;
  };
  const stream = [];
  const blob = (path, text) => [`M 100644 inline ${path}`, `data ${Buffer.byteLength(text)}`, text];
  for (let revision = 0; revision < REVISIONS; revision += 1) {
    const message = `fixture revision ${revision}`;
    stream.push(
      'commit refs/heads/main',
      `committer Atlas Memory Check <memory-check@example.invalid> ${1_700_000_000 + revision * 3600} +0000`,
      `data ${Buffer.byteLength(message)}`,
      message,
    );
    if (revision === 0) for (const [path, text] of files) stream.push(...blob(path, text));
    for (let index = 0; index < DOMAINS; index += 1) stream.push(...blob(`vault/domains/d-${index}.md`, domainFile(index, revision)));
    stream.push('');
  }
  execFileSync('git', ['-C', root, 'fast-import', '--quiet'], { input: `${stream.join('\n')}\n` });
  git('checkout', '-q', '-f', 'main');
  return { root, vault: join(root, 'vault'), git };
}

async function startServer(vault) {
  const child = spawn(process.execPath, ['--expose-gc', '--import', PROBE, SERVER], {
    env: { ...process.env, OATLAS_VAULT: vault, OATLAS_MEMORY_PROBE_FD: '3' },
    stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
  });
  const replies = new Map();
  const onLines = (stream, handle) => {
    let pending = '';
    stream.on('data', (chunk) => {
      pending += chunk.toString('utf8');
      for (let end = pending.indexOf('\n'); end >= 0; end = pending.indexOf('\n')) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        if (line.trim()) handle(JSON.parse(line));
      }
    });
  };
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
  const exited = new Promise((settle) => child.on('exit', (code, signal) => settle({ code, signal })));
  const waitFor = (key) => new Promise((settle, fail) => {
    replies.set(key, settle);
    exited.then(({ code, signal }) => fail(new Error(`server exited (${code ?? signal}) waiting for ${key}: ${stderr}`)));
  });
  const settleReply = (key, value) => {
    const settle = replies.get(key);
    replies.delete(key);
    settle?.(value);
  };
  onLines(child.stdout, (message) => settleReply(`rpc:${message.id}`, message));
  onLines(child.stdio[3], (message) => settleReply(`probe:${message.id}`, message));
  let nextId = 1;
  const rpc = (method, params) => {
    const id = nextId++;
    const reply = waitFor(`rpc:${id}`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return reply;
  };
  const heap = async () => {
    const id = nextId++;
    const reply = waitFor(`probe:${id}`);
    child.stdio[3].write(`${JSON.stringify({ id })}\n`);
    const { heapUsed } = await reply;
    if (!Number.isFinite(heapUsed)) throw new Error('the heap probe answered without a number');
    return heapUsed;
  };
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'perf-mcp-memory', version: '1' } });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  const call = async (name, argumentsValue) => {
    const reply = await rpc('tools/call', { name, arguments: argumentsValue });
    if (reply.error || reply.result?.isError) {
      throw new Error(`${name} failed: ${JSON.stringify(reply.error ?? reply.result?.content)}`.slice(0, 400));
    }
    return reply.result;
  };
  const stop = async () => {
    child.kill('SIGKILL');
    await exited;
  };
  return { call, heap, stop };
}

const LEAK_CALLS = [
  ['list_concepts', {}],
  ['get_concept', { slug: 'capabilities/c-5' }],
  ['find_evidence', { title: 'vault', limit: 10 }],
  ['find_neighbors', { slug: 'capabilities/c-5' }],
  ['compile_ontology', { summary: true }],
  ['query_ontology', { operation: 'health' }],
  ['query_ontology', { operation: 'agent_brief' }],
  ['query_ontology', { operation: 'node_profile', slug: 'capabilities/c-5' }],
  ['validate_vault', {}],
];

async function measureLeaks(server) {
  const rows = [];
  for (const [name, argumentsValue] of LEAK_CALLS) {
    // measurement window: calls 1-5 fill the caches a repeated call is entitled
    // to (compiled graph, revision and path walks, compiled code), so the slope
    // is read from call 5 to call 5 + calls.
    for (let index = 0; index < WARM_UP_CALLS; index += 1) await server.call(name, argumentsValue);
    const before = await server.heap();
    for (let index = 0; index < calls; index += 1) await server.call(name, argumentsValue);
    const after = await server.heap();
    const label = argumentsValue.operation ? `${name} ${argumentsValue.operation}` : name;
    rows.push({ window: 'leak', label, calls, bytesPerCall: Math.round((after - before) / calls) });
  }
  return rows;
}

async function measureHeadMoves(server, fixture) {
  const heaps = [];
  for (let commit = 1; commit <= commits; commit += 1) {
    fixture.git('commit', '-q', '--allow-empty', '-m', `memory check commit ${commit}`);
    await server.call('query_ontology', { operation: 'health' });
    heaps.push(await server.heap());
  }
  // measurement window: every commit moves HEAD, so each `health` walks the
  // summary history again; from commit 2 the per-HEAD caches are warm and what
  // remains is what one more commit keeps.
  const measured = commits - FIRST_MEASURED_COMMIT;
  const bytesPerCommit = Math.round((heaps.at(-1) - heaps[FIRST_MEASURED_COMMIT - 1]) / measured);
  return [{ window: 'head-moves', label: `commits ${FIRST_MEASURED_COMMIT}-${commits}`, commits: measured, bytesPerCommit }];
}

function overBudget(row) {
  if (row.window === 'leak') return row.bytesPerCall > BUDGETS.leakBytesPerCall;
  if (row.window === 'head-moves') return row.bytesPerCommit > BUDGETS.headMoveBytesPerCommit;
  return true;
}

function describe(row) {
  const kilobytes = (bytes) => `${(bytes / KB).toFixed(1)} KB`;
  if (row.window === 'leak') {
    return `${row.label.padEnd(26)} ${kilobytes(row.bytesPerCall).padStart(10)} per call  (budget ${kilobytes(BUDGETS.leakBytesPerCall)}, ${row.calls} calls)`;
  }
  return `${row.label.padEnd(26)} ${kilobytes(row.bytesPerCommit).padStart(10)} per commit (budget ${kilobytes(BUDGETS.headMoveBytesPerCommit)})`;
}

const fixture = buildFixture();
let rows = [];
let failure = null;
try {
  const leakServer = await startServer(fixture.vault);
  try {
    rows.push(...await measureLeaks(leakServer));
  } finally {
    await leakServer.stop();
  }
  const headServer = await startServer(fixture.vault);
  try {
    rows.push(...await measureHeadMoves(headServer, fixture));
  } finally {
    await headServer.stop();
  }
} catch (error) {
  failure = error;
} finally {
  rmSync(fixture.root, { recursive: true, force: true });
}

if (failure) {
  console.error(`[perf-mcp-memory] ${failure instanceof Error ? failure.message : String(failure)}`);
  process.exit(1);
}
const expectedRows = LEAK_CALLS.length + 1;
if (rows.length !== expectedRows) {
  console.error(`[perf-mcp-memory] measured ${rows.length} of ${expectedRows} windows`);
  process.exit(1);
}
rows = rows.map((row) => ({ ...row, overBudget: overBudget(row) }));
if (json) {
  console.log(JSON.stringify({ budgets: BUDGETS, rows }, null, 2));
} else {
  console.log('[perf-mcp-memory] heap after two forced collections, per window');
  for (const row of rows) console.log(`  ${row.overBudget ? '✗' : '✓'} ${row.window.padEnd(10)} ${describe(row)}`);
}
if (check && rows.some((row) => row.overBudget)) {
  console.error('[perf-mcp-memory] over budget: a repeated call or a moved HEAD keeps memory it should release');
  process.exit(1);
}
