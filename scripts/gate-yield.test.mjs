import assert from 'node:assert/strict';
import test from 'node:test';

import { aggregateYield, formatTable, normaliseCommand, parseReport } from './gate-yield.mjs';

const NOW = Date.parse('2026-12-01T00:00:00Z');
const daysAgo = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
const line = (command, status, at) => ({ lane: 'unit', shard: '1/3', command, status, ms: 1, sha: 'x', runId: '1', at });

test('volatile bases and shards collapse into one command', () => {
  assert.equal(normaliseCommand("pnpm decisions:check -- --base='origin/main'"), 'pnpm decisions:check --');
  assert.equal(
    normaliseCommand("pnpm exec vitest run --changed='abc123' --project=jsdom --shard=2/3"),
    'pnpm exec vitest run --changed --project=jsdom',
  );
  const rows = aggregateYield([
    line('pnpm exec vitest run tests/contract --shard=1/3', 'pass', daysAgo(1)),
    line('pnpm exec vitest run tests/contract --shard=3/3', 'pass', daysAgo(1)),
  ], { now: NOW });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].runs, 2);
});

test('a check is a retire candidate only with 50 runs, no failure, and 60 days of history', () => {
  const records = [];
  for (let i = 0; i < 50; i += 1) records.push(line('old-quiet', 'pass', daysAgo(61 - i)));
  for (let i = 0; i < 49; i += 1) records.push(line('few-runs', 'pass', daysAgo(90)));
  for (let i = 0; i < 80; i += 1) records.push(line('young', 'pass', daysAgo(59)));
  records.push(line('catcher', 'pass', daysAgo(100)), line('catcher', 'fail', daysAgo(3)));
  records.push(line('skipped', 'skip', daysAgo(100)));

  const rows = aggregateYield(records, { now: NOW });
  assert.deepEqual(Object.fromEntries(rows.map((row) => [row.command, row.verdict])), {
    'old-quiet': 'retire candidate',
    'few-runs': 'collecting',
    young: 'collecting',
    catcher: 'catches',
  });
  // failures ascending, then runs descending
  assert.deepEqual(rows.map((row) => row.command), ['young', 'old-quiet', 'few-runs', 'catcher']);
  const catcher = rows.at(-1);
  assert.equal(catcher.firstSeen, Date.parse(daysAgo(100)));
  assert.equal(catcher.lastFailure, Date.parse(daysAgo(3)));
  assert.match(formatTable(rows), /catches\s+catcher/);
});

test('report parsing keeps records and drops garbage', () => {
  const text = `${JSON.stringify({ command: 'a', status: 'pass' })}\nnot json\n\n${JSON.stringify({ status: 'pass' })}\n`;
  assert.deepEqual(parseReport(text, 'T'), [{ command: 'a', status: 'pass', at: 'T' }]);
  assert.deepEqual(aggregateYield([]), []);
});
