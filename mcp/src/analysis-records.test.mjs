import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { analysisDigest, analysisRecordFileName, serializeAnalysisRecord } from './analysis-record.mts';
import { listAnalysisRecords, readAnalysisRecord } from './analysis-records.mjs';
const CLI_ENTRY = fileURLToPath(new URL('../../cli/src/index.mjs', import.meta.url));

function fixture(id, at = '2026-09-05T08:00:00.000Z') {
  return {
    schema: 'atlas-analysis/v1', recordType: 'run', id, createdAt: at, mode: 'meaning',
    scope: { projectSlug: 'demo', projectUid: null, targetSlugs: [], profileSlug: null },
    request: { id: `request-${id}`, text: 'Review the recorded boundary.', parentRunId: null },
    origin: { surface: 'map', runtimeId: 'test', sessionId: null, userEventId: 'user-1', answerEventId: 'answer-1', startedAt: '2026-09-05T07:59:00.000Z', stopReason: 'end_turn', outcome: 'completed' },
    basis: { graphHash: null, sourceFingerprint: null, profileHash: null, documents: [] },
    evidence: [], observations: [], profileSnapshot: null, toolReads: [], sourceAccess: 'unproven', findings: [],
    qualification: { status: 'unverified', reasons: ['no_evidence'] }, answer: 'Useful raw output.\nUnknown: application impact.\n',
  };
}

test('analysis history pages and reads exact immutable Markdown without a graph', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'atlas-record-read-'));
  try {
    const directory = path.join(root, '.ontology-atlas/analyses');
    await mkdir(directory, { recursive: true });
    const records = [fixture('95f4ba81-41f7-483b-a617-2a4be815be32'), fixture('24e7bc39-013c-46e7-86b2-ff2f3aeab58c', '2026-09-05T08:01:00.000Z')];
    for (const record of records) await writeFile(path.join(directory, analysisRecordFileName(record)), serializeAnalysisRecord(record));
    const first = await listAnalysisRecords(root, { limit: 1 });
    assert.equal(first.totalFiles, 2);
    assert.equal(first.records[0].id, records[1].id);
    assert.equal(first.pagination.hasMore, true);
    const older = await listAnalysisRecords(root, { limit: 1, cursor: first.pagination.nextCursor });
    assert.equal(older.records[0].id, records[0].id);
    assert.equal(older.pagination.hasMore, false);
    assert.deepEqual((await readAnalysisRecord(root, records[0].id)).record, records[0]);
    const cli = JSON.parse(execFileSync(process.execPath, [CLI_ENTRY, 'analysis', `--vault=${root}`, '--history', '--limit=1', '--json'], { encoding: 'utf8' }));
    assert.equal(cli.records[0].id, records[1].id);
    const restored = JSON.parse(execFileSync(process.execPath, [CLI_ENTRY, 'analysis', `--vault=${root}`, `--record=${records[0].id}`, '--json'], { encoding: 'utf8' }));
    assert.deepEqual(restored.record, records[0]);
    assert.equal(await readFile(path.join(directory, analysisRecordFileName(records[0])), 'utf8'), serializeAnalysisRecord(records[0]));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('analysis readers refuse unsafe identities and symlinked archive/record paths', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'atlas-record-boundary-'));
  const outside = await mkdtemp(path.join(tmpdir(), 'atlas-record-outside-'));
  try {
    await assert.rejects(readAnalysisRecord(root, '../secret'), /UUID/);
    await mkdir(path.join(root, '.ontology-atlas'));
    await symlink(outside, path.join(root, '.ontology-atlas/analyses'));
    await assert.rejects(listAnalysisRecords(root), /real directory/);
    await rm(path.join(root, '.ontology-atlas/analyses'));
    await mkdir(path.join(root, '.ontology-atlas/analyses'));
    const record = fixture('95f4ba81-41f7-483b-a617-2a4be815be32');
    await writeFile(path.join(outside, 'record.md'), serializeAnalysisRecord(record));
    await symlink(path.join(outside, 'record.md'), path.join(root, '.ontology-atlas/analyses', analysisRecordFileName(record)));
    const history = await listAnalysisRecords(root);
    assert.equal(history.records.length, 0);
    assert.equal(history.problems.length, 1);
    await assert.rejects(readAnalysisRecord(root, record.id), /regular file/);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('analysis readers reject altered evidence even when metadata still claims grounded', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'atlas-record-integrity-'));
  try {
    const directory = path.join(root, '.ontology-atlas/analyses');
    await mkdir(directory, { recursive: true });
    const record = fixture('95f4ba81-41f7-483b-a617-2a4be815be32');
    record.request.id = record.origin.userEventId;
    const evidence = { slug: 'refund', uid: null, title: 'Refund', kind: 'capability', body: 'Refund within 30 days.', frontmatter: { kind: 'capability' }, toolCallId: 'read-1' };
    evidence.digest = await analysisDigest({ frontmatter: evidence.frontmatter, body: evidence.body });
    record.evidence = [evidence]; record.toolReads = [{ id: 'read-1', name: 'get_concept', status: 'completed' }];
    record.sourceAccess = 'atlas-only'; record.basis.graphHash = `sha256:${'a'.repeat(64)}`;
    record.basis.documents = [{ slug: evidence.slug, digest: evidence.digest }];
    record.qualification = { status: 'grounded', reasons: [] };
    const file = path.join(directory, analysisRecordFileName(record));
    await writeFile(file, serializeAnalysisRecord(record));
    assert.equal((await readAnalysisRecord(root, record.id)).record.qualification.status, 'grounded');
    record.evidence[0].body = 'Refund at any time.';
    await writeFile(file, serializeAnalysisRecord(record));
    const page = await listAnalysisRecords(root);
    assert.equal(page.records.length, 0);
    assert.match(page.problems[0].reason, /evidence_digest_mismatch/);
    await assert.rejects(readAnalysisRecord(root, record.id), /evidence_digest_mismatch/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('archive CLI accepts separated values and never falls through to a write on malformed read flags', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'atlas-record-cli-'));
  const root = path.join(parent, 'vault');
  try {
    await mkdir(path.join(root, '.ontology-atlas/analyses'), { recursive: true });
    const record = fixture('95f4ba81-41f7-483b-a617-2a4be815be32');
    await writeFile(path.join(root, '.ontology-atlas/analyses', analysisRecordFileName(record)), serializeAnalysisRecord(record));
    const restored = JSON.parse(execFileSync(process.execPath, [CLI_ENTRY, 'analysis', '--vault', root, '--record', record.id, '--json'], { encoding: 'utf8', cwd: parent }));
    assert.deepEqual(restored.record, record);
    for (const flags of [['--record'], ['--mode=meaning'], ['--histroy'], ['--history', '--out=other'], ['--record', record.id, '--limit=1'], ['--history', '--limit']]) {
      const result = spawnSync(process.execPath, [CLI_ENTRY, 'analysis', `--vault=${root}`, ...flags], { encoding: 'utf8', cwd: parent });
      assert.equal(result.status, 2, result.stdout || result.stderr);
      assert.equal(existsSync(path.join(parent, 'analyses')), false, 'a malformed read must not create a legacy report');
    }
  } finally { await rm(parent, { recursive: true, force: true }); }
});
