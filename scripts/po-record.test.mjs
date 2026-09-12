import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

test('preflights an update against the composed pilot before creating a file', () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-po-writer-'));
  try {
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, 'docs/PO-PILOT.md'), readFileSync(new URL('../docs/PO-PILOT.md', import.meta.url)));
    assert.throws(() => writePoPilotFragment('update', {
      id: '20000000-0000-4000-8000-000000000002',
      runId: '20000000-0000-4000-8000-000000000003',
      recordedAt: '2026-09-13T12:00:00.000Z',
      date: '2026-09-13', proof: 'pass', ownerClear: 'yes', boundaryMiss: 'no', laterResult: 'held',
    }, { root }), /unknown run/);
    assert.equal(existsSync(join(root, 'docs/records/po-updates')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
