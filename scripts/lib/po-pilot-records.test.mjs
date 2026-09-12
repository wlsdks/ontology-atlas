import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { evaluatePoPilot, parsePoPilot, pilotCheckFailures } from './po-pilot.mjs';
import { loadPoPilotRecords, readPoPilotSource } from './po-pilot-records.mjs';

const LEGACY = readFileSync(new URL('../../docs/PO-PILOT.md', import.meta.url), 'utf8');
const UUIDS = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
];
const boundaries = { truth: 'unchanged', transfer: 'unchanged', 'agent-write': 'unchanged', 'human-correction': 'unchanged' };

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-po-records-'));
  mkdirSync(join(root, 'docs/records/po-runs'), { recursive: true });
  mkdirSync(join(root, 'docs/records/po-updates'), { recursive: true });
  mkdirSync(join(root, 'docs/records/po-policy'), { recursive: true });
  writeFileSync(join(root, 'docs/PO-PILOT.md'), LEGACY.replace(/^outcome: .*$/m, 'outcome: pending'));
  return root;
}
function run(id, recordedAt, decision = id) {
  return { schema: 'po-pilot-run/v1', id, recordedAt, date: '2026-09-13', decision, door: 'two-way', route: 'solo', outcome: 'explain', changes: ['rollback-cheap'], boundaries, risk: 'none', firstTurns: 0, rebuttalTurns: 0, delta: 'unchanged', uniqueContributors: [], initialUpdate: { date: '2026-09-13', proof: 'pending', ownerClear: 'pending', boundaryMiss: 'pending', laterResult: 'pending' } };
}
function write(root, dir, name, value) { writeFileSync(join(root, `docs/records/${dir}/${name}.json`), `${JSON.stringify(value)}\n`); }

test('same-day independent UUID runs merge deterministically without losing legacy metrics', () => {
  const root = repo();
  try {
    const before = loadPoPilotRecords({ root });
    assert.deepEqual(evaluatePoPilot(before.pilot, '2026-09-13').metrics, evaluatePoPilot(parsePoPilot(readFileSync(join(root, 'docs/PO-PILOT.md'), 'utf8')), '2026-09-13').metrics);
    write(root, 'po-runs', 'b', run(UUIDS[1], '2026-09-13T10:00:00.000Z', 'second'));
    write(root, 'po-runs', 'a', run(UUIDS[0], '2026-09-13T10:00:00.000Z', 'first'));
    const after = loadPoPilotRecords({ root });
    assert.equal(after.pilot.runs.length, before.pilot.runs.length + 2);
    assert.deepEqual(after.pilot.runs.slice(-2).map(({ id }) => id), UUIDS.slice(0, 2));
    assert.equal(after.pilot.updates.length, before.pilot.updates.length + 2);
    assert.equal(evaluatePoPilot(after.pilot, '2026-09-13').metrics.eligibleDecisions, evaluatePoPilot(before.pilot, '2026-09-13').metrics.eligibleDecisions + 2);
    assert.deepEqual(readPoPilotSource('docs/PO-PILOT.md', { root }).inputs.slice(-2), ['docs/records/po-runs/a.json', 'docs/records/po-runs/b.json']);
    assert.equal(readPoPilotSource('docs/OTHER.md', { root }), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('stable UUID updates preserve safety-stop and policy adjust does not retire the pilot', () => {
  const root = repo();
  try {
    write(root, 'po-runs', 'run', run(UUIDS[0], '2026-09-13T10:00:00.000Z'));
    write(root, 'po-updates', 'update', { schema: 'po-pilot-update/v1', id: UUIDS[1], runId: UUIDS[0], recordedAt: '2026-09-13T11:00:00.000Z', date: '2026-09-13', proof: 'fail-shipped', ownerClear: 'no', boundaryMiss: 'yes', laterResult: 'reversed' });
    const stopped = evaluatePoPilot(loadPoPilotRecords({ root }).pilot, '2026-09-13');
    assert.equal(stopped.phase, 'safety-stop');
    assert.equal(pilotCheckFailures(stopped).length, 2);
    write(root, 'po-policy', 'adjust', { schema: 'po-pilot-policy/v1', id: UUIDS[2], recordedAt: '2026-09-13T12:00:00.000Z', outcome: 'adjust' });
    const adjusted = evaluatePoPilot(loadPoPilotRecords({ root }).pilot, '2026-09-13');
    assert.equal(adjusted.phase, 'adjusted');
    assert.equal(adjusted.metrics.eligibleDecisions, stopped.metrics.eligibleDecisions);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects duplicate, unknown, predating, ambiguous, and malformed fragments', () => {
  for (const [name, arrange, pattern] of [
    ['duplicate', (root) => { const one = run(UUIDS[0], '2026-09-13T10:00:00.000Z'); write(root, 'po-runs', 'a', one); write(root, 'po-runs', 'b', one); }, /duplicate record id/],
    ['unknown', (root) => write(root, 'po-updates', 'u', { schema:'po-pilot-update/v1', id:UUIDS[1], runId:UUIDS[0], recordedAt:'2026-09-13T11:00:00.000Z', date:'2026-09-13', proof:'pass', ownerClear:'yes', boundaryMiss:'no', laterResult:'held' }), /unknown run/],
    ['predating', (root) => { write(root, 'po-runs', 'r', run(UUIDS[0], '2026-09-13T10:00:00.000Z')); write(root, 'po-updates', 'u', { schema:'po-pilot-update/v1', id:UUIDS[1], runId:UUIDS[0], recordedAt:'2026-09-13T11:00:00.000Z', date:'2026-09-12', proof:'pass', ownerClear:'yes', boundaryMiss:'no', laterResult:'held' }); }, /predates/],
    ['ambiguous', (root) => { write(root, 'po-runs', 'r', run(UUIDS[0], '2026-09-13T10:00:00.000Z')); write(root, 'po-updates', 'a', { schema:'po-pilot-update/v1', id:UUIDS[1], runId:UUIDS[0], recordedAt:'2026-09-13T11:00:00.000Z', date:'2026-09-13', proof:'pass', ownerClear:'yes', boundaryMiss:'no', laterResult:'held' }); write(root, 'po-updates', 'b', { schema:'po-pilot-update/v1', id:UUIDS[2], runId:UUIDS[0], recordedAt:'2026-09-13T11:00:00.000Z', date:'2026-09-13', proof:'fail-caught', ownerClear:'yes', boundaryMiss:'no', laterResult:'held' }); }, /ambiguous updates/],
    ['malformed', (root) => write(root, 'po-runs', 'r', { ...run(UUIDS[0], 'bad'), recordedAt:'bad' }), /ISO instant/],
  ]) {
    const root = repo();
    try { arrange(root); assert.throws(() => loadPoPilotRecords({ root }), pattern, name); }
    finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('an additive keep policy still passes through the unsupported-keep gate', () => {
  const root = repo();
  try {
    write(root, 'po-runs', 'run', run(UUIDS[0], '2026-09-13T10:00:00.000Z'));
    write(root, 'po-policy', 'keep', { schema: 'po-pilot-policy/v1', id: UUIDS[2], recordedAt: '2026-09-13T12:00:00.000Z', outcome: 'keep' });
    const result = evaluatePoPilot(loadPoPilotRecords({ root }).pilot, '2026-09-13');
    assert.equal(result.phase, 'invalid-keep');
    assert.ok(pilotCheckFailures(result).length > 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

/**
 * A CRLF checkout broke `parsePoPilot`'s duplicate-key pre-scan (`startsWith('---\n')`)
 * and its table reader, both of which test `\n` directly even though the shared
 * frontmatter parser normalizes for itself. Found sweeping v1.2.2's Windows failure.
 */
test('parses the register identically on a CRLF checkout', () => {
  const lf = parsePoPilot(LEGACY);
  const crlf = parsePoPilot(LEGACY.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'));
  assert.deepEqual(crlf, lf);
});
