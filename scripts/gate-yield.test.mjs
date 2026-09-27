import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { aggregateYield, fetchRun, formatTable, main, normaliseCommand, parseReport, readCache } from './gate-yield.mjs';

const NOW = Date.parse('2026-12-01T00:00:00Z');
const daysAgo = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
const line = (command, status, at, runId) => ({ lane: 'unit', shard: '1/3', command, status, ms: 1, sha: 'x', runId: String(runId), at });

test('a command reduces to the check it runs', () => {
  assert.equal(normaliseCommand("pnpm decisions:check -- --base='origin/main'"), 'pnpm decisions:check --');
  assert.equal(
    normaliseCommand("pnpm exec vitest run --changed='abc123' --exclude='tests/contract/**' --project=jsdom --passWithNoTests --shard=2/3"),
    "pnpm exec vitest run --exclude=_ --project=jsdom",
  );
  assert.equal(
    normaliseCommand('pnpm exec eslint --max-warnings 0 --no-warn-ignored src/a.ts scripts/b.mjs'),
    normaliseCommand('pnpm exec eslint --max-warnings 0 --no-warn-ignored app/c.tsx'),
  );
  assert.equal(normaliseCommand('pnpm exec vitest run tests/contract/a.test.ts tests/contract/b.test.ts'), 'pnpm exec vitest run');
});

test('runs and failures count distinct runs, not report lines', () => {
  const rows = aggregateYield([
    line('pnpm exec vitest run tests/contract --shard=1/3', 'pass', daysAgo(1), 7),
    line('pnpm exec vitest run tests/contract --shard=2/3', 'fail', daysAgo(1), 7),
    line('pnpm exec vitest run tests/contract --shard=3/3', 'fail', daysAgo(1), 7),
    line('pnpm exec vitest run tests/contract --shard=1/3', 'pass', daysAgo(2), 8),
  ], { now: NOW });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].runs, 2);
  assert.equal(rows[0].failures, 1);
});

test('a check reads "no CI failure" only with 50 runs, no failed run, and 60 days of history', () => {
  const records = [];
  for (let i = 0; i < 50; i += 1) records.push(line('old-quiet', 'pass', daysAgo(61 - i), i));
  for (let i = 0; i < 80; i += 1) records.push(line('one-run', 'pass', daysAgo(90), 1));
  for (let i = 0; i < 80; i += 1) records.push(line('young', 'pass', daysAgo(59), i));
  records.push(line('catcher', 'pass', daysAgo(100), 1), line('catcher', 'fail', daysAgo(3), 2));
  records.push(line('skipped', 'skip', daysAgo(100), 1));

  const rows = aggregateYield(records, { now: NOW });
  assert.deepEqual(Object.fromEntries(rows.map((row) => [row.command, row.verdict])), {
    'old-quiet': 'no CI failure',
    'one-run': 'collecting',
    young: 'collecting',
    catcher: 'catches',
  });
  assert.deepEqual(rows.map((row) => row.command), ['young', 'old-quiet', 'one-run', 'catcher']);
  const catcher = rows.at(-1);
  assert.equal(catcher.firstSeen, Date.parse(daysAgo(100)));
  assert.equal(catcher.lastFailure, Date.parse(daysAgo(3)));
  assert.match(formatTable(rows), /catches\s+catcher/);
});

test('report parsing keeps records and drops garbage', () => {
  const text = `${JSON.stringify({ command: 'a', status: 'pass' })}\nnot json\n\n${JSON.stringify({ status: 'pass' })}\n`;
  assert.deepEqual(parseReport(text, { at: 'T', runId: '9' }), [{ command: 'a', status: 'pass', runId: '9', at: 'T' }]);
  assert.deepEqual(aggregateYield([]), []);
});

/*
 * The download path end to end: a real zip, shaped like `actions/upload-artifact` makes
 * it, fed through fetchRun's `gh` and the real `unzip`, then read back from the cache.
 */
test('a downloaded lane-report artifact lands in the cache and aggregates', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'gate-yield-test-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const source = join(scratch, 'source');
  mkdirSync(source);
  const report = [
    { lane: 'gates', shard: '1/3', command: 'pnpm lint', status: 'fail', ms: 5, sha: 's', runId: '101' },
    { lane: 'gates', shard: '1/3', command: 'pnpm typecheck', status: 'pass', ms: 5, sha: 's', runId: '101' },
  ].map((entry) => JSON.stringify(entry)).join('\n');
  writeFileSync(join(source, 'ci-lane-report.jsonl'), `${report}\n`);
  execFileSync('zip', ['-q', '-j', join(scratch, 'a.zip'), join(source, 'ci-lane-report.jsonl')]);
  const zipBytes = readFileSync(join(scratch, 'a.zip'));

  const calls = [];
  const gh = (args) => {
    calls.push(args[0]);
    if (args[0].includes('/runs/101/artifacts')) {
      return JSON.stringify({ artifacts: [
        { id: 555, name: 'ci-lane-report-gates', expired: false },
        { id: 556, name: 'playwright-timings-1', expired: false },
      ] });
    }
    if (args[0].endsWith('/artifacts/555/zip')) return zipBytes;
    throw new Error(`unexpected call ${args[0]}`);
  };
  const root = join(scratch, 'cache');
  fetchRun({ run: { id: 101, created_at: '2026-09-27T00:00:00Z', conclusion: 'failure' }, dir: join(root, '101'), gh });
  fetchRun({ run: { id: 102, created_at: '2026-09-27T01:00:00Z', conclusion: 'skipped' }, dir: join(root, '102'), gh });
  assert.equal(calls.length, 2, 'one artifact list and one download; the skipped run costs nothing');

  const rows = aggregateYield(readCache(root), { now: NOW });
  assert.deepEqual(rows.map(({ command, runs, failures }) => ({ command, runs, failures })), [
    { command: 'pnpm typecheck', runs: 1, failures: 0 },
    { command: 'pnpm lint', runs: 1, failures: 1 },
  ]);
});

test('the listing stops with a partial table when the quota runs low', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gate-yield-quota-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let quotaReads = 0;
  const gh = (args) => {
    if (args[0] === 'rate_limit') {
      quotaReads += 1;
      return JSON.stringify({ resources: { core: { remaining: quotaReads === 1 ? 5000 : 10 } } });
    }
    if (args[0].includes('/workflows/checks.yml/runs')) return JSON.stringify({ workflow_runs: [] });
    throw new Error(`unexpected call ${args[0]}`);
  };
  let out = '';
  const status = main({ argv: ['--runs=500'], env: { ATLAS_GATE_YIELD_CACHE: root }, gh, now: NOW, stdout: { write(text) { out += text; } }, stderr: { write() {} } });
  assert.equal(status, 0);
  assert.equal(quotaReads, 2);
  assert.match(out, /PARTIAL/);
  assert.match(out, /50 REST call\(s\)/);
});
