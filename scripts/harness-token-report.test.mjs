import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { collectRuns, formatReport, summarizeTurns } from './harness-token-report.mjs';

const turn = (id, read, write, output) => JSON.stringify({
  type: 'assistant',
  message: { id, usage: { input_tokens: 1, cache_read_input_tokens: read, cache_creation_input_tokens: write, output_tokens: output } },
});

test('counts one response once even when each content block is logged separately', async () => {
  const summary = await summarizeTurns([
    turn('a', 100, 10, 1), turn('a', 100, 10, 40), turn('a', 100, 10, 40),
    JSON.stringify({ type: 'user', message: { content: 'usage of the tool' } }),
    turn('b', 300, 5, 7),
  ]);
  assert.deepEqual(summary, { turns: 2, context: 417, cacheRead: 400, cacheWrite: 15, output: 47, maxContext: 306, startContext: 111 });
});

test('reads lead and subagent transcripts of matching projects inside the date range', async () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-tokens-'));
  const put = (path, text) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  try {
    put('-repo-main/s1.jsonl', turn('a', 900, 0, 1));
    put('-repo-main/s1/subagents/agent-x.jsonl', [turn('a', 50, 0, 1), turn('b', 250, 0, 1)].join('\n'));
    put('-repo-main/s1/subagents/agent-x.meta.json', JSON.stringify({ agentType: 'investigator', description: 'Fix a flake' }));
    put('-repo-main/old.jsonl', turn('a', 5, 0, 1));
    utimesSync(join(root, '-repo-main/old.jsonl'), new Date('2020-01-01'), new Date('2020-01-01'));
    put('-other/s2.jsonl', turn('a', 5, 0, 1));
    const runs = await collectRuns({ projectsDir: root, match: 'repo', sinceMs: Date.parse('2024-01-01') });
    assert.deepEqual(runs.map((run) => [run.type, run.turns, run.description]).sort(), [['investigator', 2, 'Fix a flake'], ['lead', 1, '']]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('counts runs that grew past the compaction window or ran over their turn cap', () => {
  const run = (type, turns, maxContext) => ({ type, turns, maxContext, context: turns * 1000, output: 1, startContext: 10, description: '' });
  const lines = formatReport([run('investigator', 300, 900_000), run('investigator', 20, 150_000), run('lead', 50, 210_000)], { window: 200_000, caps: { investigator: 250 } });
  assert.ok(lines.includes('window 200K: 1 runs grew past it (largest 900K)'));
  assert.ok(lines.includes("turn caps: 1 runs over their type's maxTurns"));
});
