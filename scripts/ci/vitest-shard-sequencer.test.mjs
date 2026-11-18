import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { measureLines, mergeDurations } from './refresh-vitest-durations.mjs';
import { assignShards, DURATIONS, specKey } from './vitest-shard-sequencer.mjs';

const entries = (weights) => Object.entries(weights).map(([key, seconds]) => ({ key, seconds }));

test('every file lands on exactly one shard, whatever order the shards see it in', () => {
  const weights = { 'jsdom:a': 9, 'jsdom:b': 7, 'jsdom:c': 5, 'jsdom:d': 3, 'jsdom:e': 1, 'contract-node:f': 1 };
  const forward = assignShards(entries(weights), 3);
  const backward = assignShards(entries(weights).reverse(), 3);
  assert.deepEqual(forward, backward, 'shards computed from differently ordered lists disagree');
  assert.deepEqual(forward.flat().sort(), Object.keys(weights).sort());
});

test('shards balance by seconds, where equal file counts would not', () => {
  const weights = { 'jsdom:heavy': 30, ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`jsdom:light-${i}`, 5])) };
  const shards = assignShards(entries(weights), 3);
  const loads = shards.map((keys) => keys.reduce((sum, key) => sum + weights[key], 0));
  // Three files a shard would give one runner the heavy file and two light ones, 40 s; the
  // heavy file alone is the floor.
  assert.deepEqual(loads, [30, 20, 20]);
  assert.deepEqual(shards[0], ['jsdom:heavy']);
});

test('an unmeasured file weighs the median, and an empty sweep yields empty shards', () => {
  const shards = assignShards([{ key: 'jsdom:new' }, { key: 'jsdom:a', seconds: 4 }, { key: 'jsdom:b', seconds: 4 }], 2);
  assert.deepEqual(shards.flat().sort(), ['jsdom:a', 'jsdom:b', 'jsdom:new']);
  assert.deepEqual(assignShards([], 3), [[], [], []]);
});

test('keys name the Vitest project and the repository-relative path', () => {
  assert.equal(specKey('jsdom', '/repo', '/repo/src/a.test.ts'), 'jsdom:src/a.test.ts');
});

test('timing lines fold into weights, keeping the slower of two runs and dropping removed files', () => {
  const measured = measureLines('{"key":"jsdom:a","ms":1200}\nnot json\n{"key":"jsdom:a","ms":3000}\n{"key":"x","ms":-1}\n');
  assert.deepEqual([...measured], [['jsdom:a', 3]]);
  const merged = mergeDurations({ files: { 'jsdom:gone': 2, 'jsdom:b': 1 } }, measured, (key) => key !== 'jsdom:gone');
  assert.deepEqual(merged, { version: 1, files: { 'jsdom:a': 3, 'jsdom:b': 1 } });
});

test('the committed weights cover the sweep they balance', () => {
  const { files } = JSON.parse(readFileSync(DURATIONS, 'utf8'));
  const keys = Object.keys(files);
  assert.ok(keys.length > 1000, `only ${keys.length} files are weighed`);
  assert.ok(keys.every((key) => /^(?:jsdom|contract-node):/.test(key)), 'a weight names an unknown project');
  assert.ok(!keys.some((key) => key.startsWith('perf:')), 'the measurement project never rides a shard');
});
