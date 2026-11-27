import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeSamples } from './summarize-samples.mjs';

test('a failed sample never enters a median, and an even count takes the middle pair', () => {
  const samples = [
    { ok: true, wallMs: 10 },
    { ok: false, wallMs: 1 }, // a build that died at once must not make the tool look fast
    { ok: true, wallMs: 30 },
    { ok: true, wallMs: 20 },
    { ok: true, wallMs: 40 },
  ];
  const summary = summarizeSamples(samples, ['wallMs']);
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.median.wallMs, 25);
  assert.equal(summary.samples.length, 5);
});
