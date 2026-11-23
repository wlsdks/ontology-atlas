/**
 * The map analysis record says what happened (criterion 2 of
 * `docs/specs/2026-11-24-map-analysis-record.md`): server sessions become
 * analyses, every count is validate_vault's at that write, no line names
 * anything, and the record never costs a write its result.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { runJsonRpcProcess } from '../../../../scripts/lib/mcp-test-rpc.mjs';
import {
  ANALYSIS_GAP_MS,
  createMapAnalysisRecorder,
  MAP_ANALYSIS_FILENAME,
  readMapAnalyses,
  RECORD_SESSIONS_KEPT,
} from './map-analysis-log.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = process.env.OATLAS_TEST_SERVER_ENTRY ?? join(here, '..', '..', 'index.js');

/** A handler file of the fixture: one ability the survey counts. */
const handlerPath = (area, part) => `src/area-${area}-${'commerce-'.repeat(9)}area/module-${part}-${'handler-'.repeat(8)}folder/handler.js`;

/**
 * A committed repository surveyed by area (four folders of thirty handler modules
 * under long names, so the flat map outgrows one answer), with an empty vault at
 * `atlas/` inside it.
 */
function repository() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-map-analysis-')));
  const exported = [];
  for (let area = 0; area < 4; area += 1) {
    for (let part = 0; part < 30; part += 1) {
      const name = `handle${'Request'.repeat(12)}${area}x${part}`;
      const file = handlerPath(area, part);
      mkdirSync(join(root, dirname(file)), { recursive: true });
      writeFileSync(join(root, file), `export function ${name}() {\n${'  return 1;\n'.repeat(8)}}\n`);
      exported.push(`export { ${name} } from './${file.slice('src/'.length)}';`);
    }
  }
  writeFileSync(join(root, 'src/index.js'), `${exported.join('\n')}\n`);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'shop', main: 'src/index.js' }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Atlas Test', '-c', 'user.email=atlas@example.invalid', 'commit', '-q', '-m', 'fixture'], { cwd: root });
  mkdirSync(join(root, 'atlas'));
  return root;
}

const recordPath = (root) => join(root, 'atlas', '.ontology-atlas', MAP_ANALYSIS_FILENAME);

/** One server process: the calls run in order and their structured results return. */
async function session(root, calls, { pressId = null } = {}) {
  const { responses } = await runJsonRpcProcess({
    command: process.execPath,
    args: [serverEntry],
    timeoutMs: 30_000,
    env: {
      ...process.env,
      OATLAS_VAULT: join(root, 'atlas'),
      OATLAS_REPO_ROOT: root,
      ...(pressId ? { OATLAS_MAP_ANALYSIS_ID: pressId } : {}),
    },
    requests: [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'map-analysis-test', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      ...calls.map(([name, args], index) => ({ jsonrpc: '2.0', id: index + 2, method: 'tools/call', params: { name, arguments: args } })),
    ],
  });
  return calls.map(([name], index) => {
    const result = responses.find(({ id }) => id === index + 2)?.result;
    assert.ok(result && !result.isError, `${name} failed: ${result?.content?.[0]?.text}`);
    return result.structuredContent ?? JSON.parse(result.content[0].text);
  });
}

const BODY = 'Defines the thing this fixture names.\n\n## Includes\n- One boundary.\n\n## Excludes\n- Another boundary.\n\n## Uncertainty\nNothing else was read.\n';

const capability = (name, part) => ({
  slug: `capabilities/${name}`,
  kind: 'capability',
  title: `Secret title ${name}`,
  labels: { en: `Secret title ${name}` },
  domain: 'domains/payments',
  path: handlerPath(0, part),
  body: `Handles ${name} (${handlerPath(0, part)}:L1-L3).\n\n${BODY}`,
});

/** validate_vault's share, read from its coverage sentence: abilities off the map and areas not mapped. */
function validateCounts(validated) {
  const abilities = /Areas: (\d+) of (\d+) abilities the survey found/.exec(validated.coverage ?? '');
  const areas = /(\d+) of (\d+) areas are not mapped yet/.exec(validated.coverage ?? '');
  assert.ok(abilities && areas, `validate_vault gave no share: ${validated.coverage}`);
  return {
    abilities: { total: Number(abilities[2]), offMap: Number(abilities[2]) - Number(abilities[1]) },
    areas: { total: Number(areas[2]), notMapped: Number(areas[1]) },
  };
}

function lastLine(root) {
  return JSON.parse(readFileSync(recordPath(root), 'utf8').trim().split('\n').at(-1));
}

test('sessions read as analyses, each count is validate_vault\'s, and no line names anything', async (t) => {
  const root = repository();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

  const pressed = [
    [{ slug: 'ledger', kind: 'project', title: 'Secret ledger', labels: { en: 'Secret ledger' }, body: BODY },
      { slug: 'domains/payments', kind: 'domain', title: 'Secret payments', labels: { en: 'Secret payments' }, body: BODY },
      capability('charge', 0)],
    [capability('refund', 1)],
    [capability('invoice', 2)],
  ];
  for (const concepts of pressed) {
    const [, validated] = await session(root, [['add_concepts', { concepts }], ['validate_vault', {}]], { pressId: 'press-7' });
    const line = lastLine(root);
    assert.deepEqual({ abilities: line.abilities, areas: line.areas }, validateCounts(validated));
    assert.equal(line.sourceCommit, head);
    assert.equal(line.sourceDirty, false, 'the vault folder inside the code is not a change to the code');
  }

  const [, validated] = await session(root, [
    ['patch_concept', { slug: 'capabilities/charge', body: `Charges an amount (${handlerPath(0, 3)}:L1-L3).\n\n${BODY}` }],
    ['validate_vault', {}],
  ]);
  assert.deepEqual((({ abilities, areas }) => ({ abilities, areas }))(lastLine(root)), validateCounts(validated));
  await session(root, [['get_concept', { slug: 'capabilities/charge' }]]);

  const { analyses } = readMapAnalyses(readFileSync(recordPath(root), 'utf8'));
  assert.deepEqual(
    analyses.map(({ number, origin, sessions, concepts }) => ({ number, origin, sessions, concepts })),
    [
      { number: 1, origin: 'press', sessions: 3, concepts: { added: 5, changed: 0, removed: 0 } },
      { number: 2, origin: 'session', sessions: 1, concepts: { added: 0, changed: 1, removed: 0 } },
    ],
    'three sessions of one press are one analysis; a session that only read is none',
  );
  assert.equal(analyses[0].agent, 'map-analysis-test');

  const text = readFileSync(recordPath(root), 'utf8');
  for (const named of ['src/', 'handler', 'commerce', 'charge', 'Secret', 'ledger', 'payments', 'capabilities/', root]) {
    assert.ok(!text.includes(named), `the record holds "${named}"`);
  }

  // The fifth session writes, then writes again 61 minutes later.
  let nowMs = Date.parse(analyses[1].at) + 60_000;
  const fifth = createMapAnalysisRecorder({ vaultRoot: join(root, 'atlas'), now: () => nowMs });
  const measure = () => ({ sourceCommit: head, sourceDirty: false, abilities: { total: 4, offMap: 1 }, areas: { total: 1, notMapped: 1 } });
  assert.equal(fifth.record({ effect: { added: [], changed: ['capabilities/refund'], removed: [] }, measure }), true);
  nowMs += ANALYSIS_GAP_MS + 60_000;
  assert.equal(fifth.record({ effect: { added: [], changed: ['capabilities/invoice'], removed: [] }, measure }), true);
  const after = readMapAnalyses(readFileSync(recordPath(root), 'utf8')).analyses;
  assert.deepEqual(after.map(({ number, sessions }) => ({ number, sessions })), [
    { number: 1, sessions: 3 }, { number: 2, sessions: 1 }, { number: 3, sessions: 1 }, { number: 4, sessions: 1 },
  ]);
  assert.deepEqual(after.slice(2).map(({ concepts }) => concepts.changed), [1, 1], 'a new analysis starts its own counts');
});

test('an append that fails leaves the write\'s own result unchanged', async (t) => {
  const healthy = repository();
  const broken = repository();
  t.after(() => {
    rmSync(healthy, { recursive: true, force: true });
    rmSync(broken, { recursive: true, force: true });
  });
  mkdirSync(recordPath(broken), { recursive: true });
  const write = ['add_concepts', { concepts: [{ slug: 'domains/payments', kind: 'domain', title: 'Payments', labels: { en: 'Payments' }, body: BODY }] }];
  const comparable = (root, result) => JSON.parse(JSON.stringify(result).replaceAll(root, '<root>').replace(/"mtime":[\d.]+/g, '"mtime":0'));
  const [fine] = await session(healthy, [write]);
  const [refused] = await session(broken, [write]);
  assert.deepEqual(comparable(broken, refused), comparable(healthy, fine));
  assert.equal(readFileSync(join(broken, 'atlas', 'domains', 'payments.md'), 'utf8').includes('title: Payments'), true);
});

test('a file this version cannot parse is appended to, never rewritten', () => {
  const root = repository();
  try {
    const garbage = 'not json at all\n{"v":9}\n';
    mkdirSync(dirname(recordPath(root)), { recursive: true });
    writeFileSync(recordPath(root), garbage);
    const recorder = createMapAnalysisRecorder({ vaultRoot: join(root, 'atlas') });
    const measure = () => ({ sourceCommit: null, sourceDirty: null, abilities: null, areas: null });
    assert.equal(recorder.record({ effect: { added: ['a'], changed: [], removed: [] }, measure }), true);
    const text = readFileSync(recordPath(root), 'utf8');
    assert.ok(text.startsWith(garbage));
    assert.deepEqual(readMapAnalyses(text).analyses.map(({ number }) => number), [1]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function plantedSessions(count) {
  const lines = [];
  for (let index = 0; index < count; index += 1) {
    const at = new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString();
    lines.push(JSON.stringify({
      v: 1, analysis: `planted-${index}`, number: index + 1, session: `session-${index}`, origin: 'session',
      startedAt: at, at, agent: 'codex', sourceCommit: null, sourceDirty: null,
      abilities: { total: 383, offMap: 383 - (index % 383) }, areas: { total: 45, notMapped: 3 }, concepts: { added: 1, changed: 0, removed: 0 },
    }));
  }
  return lines;
}

test('5,000 planted sessions read as 5,000 analyses, and a new session folds them to the newest it keeps', () => {
  const root = repository();
  try {
    const planted = plantedSessions(5000);
    const { analyses, broken } = readMapAnalyses(`${planted.join('\n')}\n`);
    assert.equal(analyses.length, 5000);
    assert.equal(broken, 0);
    assert.equal(analyses.at(-1).number, 5000);

    // A smaller planting the fold can read whole: two lines per session become one.
    const doubled = plantedSessions(300).flatMap((line) => [line, line.replace('"changed":0', '"changed":2')]);
    mkdirSync(dirname(recordPath(root)), { recursive: true });
    writeFileSync(recordPath(root), `${doubled.join('\n')}\n`);
    const recorder = createMapAnalysisRecorder({ vaultRoot: join(root, 'atlas') });
    recorder.record({ effect: { added: ['x'], changed: [], removed: [] }, measure: () => ({ sourceCommit: null, sourceDirty: null, abilities: null, areas: null }) });
    const lines = readFileSync(recordPath(root), 'utf8').trim().split('\n');
    assert.equal(lines.length, 301, 'every earlier session folds to its last line');
    const folded = readMapAnalyses(lines.join('\n')).analyses;
    assert.equal(folded.at(-1).number, 301);
    assert.equal(folded[0].concepts.changed, 2, 'the fold keeps each session\'s last line');
    assert.ok(RECORD_SESSIONS_KEPT >= 300);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a session reads the record once and appends one line per later write', () => {
  const work = { reads: 0, appends: 0, replaces: 0, measures: 0 };
  const lines = [];
  const io = {
    readTail: () => {
      work.reads += 1;
      return { text: `${plantedSessions(40).join('\n')}\n`, revision: null, truncated: false };
    },
    append: (_root, line) => {
      work.appends += 1;
      lines.push(line);
    },
    replace: (_root, text) => {
      work.replaces += 1;
      lines.push(text.trim().split('\n').at(-1));
    },
  };
  const recorder = createMapAnalysisRecorder({ vaultRoot: '/unused', io, now: () => Date.UTC(2026, 10, 24) });
  const measure = () => {
    work.measures += 1;
    return { sourceCommit: null, sourceDirty: null, abilities: null, areas: null };
  };
  for (let index = 0; index < 50; index += 1) {
    recorder.record({ effect: { added: [`c${index}`], changed: [], removed: [] }, measure });
  }
  recorder.record({ effect: { added: [], changed: [], removed: [] }, measure });
  assert.deepEqual(work, { reads: 1, appends: 49, replaces: 1, measures: 50 });
  assert.equal(JSON.parse(lines.at(-1)).concepts.added, 50);
  assert.equal(JSON.parse(lines.at(-1)).number, 41);
});
