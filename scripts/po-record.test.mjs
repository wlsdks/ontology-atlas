import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { writePoPilotFragment } from './lib/po-pilot-records.mjs';

test('writes one immutable UUID fragment and refuses the same path twice', () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-po-writer-'));
  const id = '20000000-0000-4000-8000-000000000001';
  try {
    const first = writePoPilotFragment('policy', { id, outcome: 'adjust' }, { root, now: () => '2026-09-13T12:00:00.000Z' });
    assert.equal(first.path, `docs/records/po-policy/${id}.json`);
    assert.throws(() => writePoPilotFragment('policy', { id, outcome: 'keep' }, { root }), /EEXIST/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('refuses a run that could be created without its initial pending outcome', () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-po-writer-'));
  try {
    assert.throws(() => writePoPilotFragment('run', { decision: 'incomplete' }, { root }), /initialUpdate/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
