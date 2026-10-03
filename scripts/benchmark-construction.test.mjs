import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { acpToolCalls, constructionReport, qualityMetrics, toolMetrics } from './benchmark-construction.mjs';

test('counts streamed ACP call ids once and preserves final failure status', () => {
  const update = (row) => ({ at: '2026-10-03T00:00:00Z', params: { update: row } });
  const calls = acpToolCalls([
    update({ sessionUpdate: 'tool_call', toolCallId: 'one', name: 'mcp.atlas-vault.read_source', status: 'in_progress' }),
    update({ sessionUpdate: 'tool_call_update', toolCallId: 'one', rawInput: { path: 'src/run.ts' } }),
    update({ sessionUpdate: 'tool_call_update', toolCallId: 'one', status: 'failed', rawOutput: { isError: true } }),
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'read_source');
  assert.deepEqual(calls[0].args, { path: 'src/run.ts' });
  assert.equal(toolMetrics(calls).failed, 1);
});

test('equivalent read arguments are measured as repeats but writes are not', () => {
  const calls = [{ name: 'read_source', args: { path: 'a', mode: 'outline' }, status: 'completed' },
    { name: 'read_source', args: { mode: 'outline', path: 'a' }, status: 'completed' },
    { name: 'patch_concept', args: {}, status: 'failed' },
    { name: 'patch_concept', args: {}, status: 'completed' }];
  assert.equal(toolMetrics(calls).repeatedReads, 1);
  assert.equal(toolMetrics(calls).errorRate, 0.25);
});

test('includes indexing and validation in repeated read measurements', () => {
  for (const name of ['index_project', 'validate_vault', 'compile_ontology', 'git_history']) {
    assert.equal(toolMetrics([{ name, args: {}, status: 'completed' },
      { name, args: {}, status: 'completed' }]).repeatedReads, 1, name);
  }
});

test('blank paths do not earn a path score and failed runs keep their failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'construction-report-'));
  try {
    mkdirSync(join(root, 'capabilities'));
    for (const [i, path] of ['', '   '].entries()) {
      writeFileSync(join(root, `capabilities/empty-${i}.md`),
        `---\nuid: 00000000-0000-4000-8000-00000000000${i}\nkind: capability\ntitle: Empty path ${i}\npath: ${JSON.stringify(path)}\n---\nReads a fixture.\n`);
    }
    const row = constructionReport({ id: 'failed', model: 'local', sourceRevision: 'frozen',
      wallMs: 10, vaultRoot: root, repoRoot: root, outcome: { status: 'failed', reason: 'request timeout' } });
    assert.equal(row.structure.declaredPathClaims, 0);
    assert.equal(row.structure.declaredPathAccuracy, null);
    assert.deepEqual(row.outcome, { status: 'failed', reason: 'request timeout' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('empty vault and unaudited quality do not earn perfect scores', () => {
  const root = mkdtempSync(join(tmpdir(), 'construction-report-'));
  try {
    const row = constructionReport({ id: 'empty', model: 'local', sourceRevision: 'frozen',
      wallMs: 10, vaultRoot: root, repoRoot: root });
    assert.equal(row.structure.authorableNodes, 0);
    assert.equal(row.structure.declaredPathAccuracy, null);
    assert.equal(row.tools.errorRate, null);
    assert.equal(row.quality.status, 'not_measured');
    assert.equal(qualityMetrics({ questions: [], claims: [] }).claimAccuracy, null);
    assert.equal(qualityMetrics({ questions: [], claims: [] }).status, 'insufficient');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('keeps partial, unsupported and unknown judgments separate from verified claims', () => {
  const result = qualityMetrics({ isolation: 'vault-only-tools',
    questions: [{ id: 'q1', verdict: 'answered' }, { id: 'q2', verdict: 'partial' }, { id: 'q3', verdict: 'unknown' }],
    claims: [{ id: 'c1', statement: 'One bounded claim', verdict: 'verified', sourceRef: 'src/a.ts:1' },
      { id: 'c2', statement: 'One unsupported claim', verdict: 'failed' },
      { id: 'c3', statement: 'One unmeasured claim', verdict: 'unknown' }] });
  assert.equal(result.claimAccuracy, 0.3333);
  assert.equal(result.unanswered.length, 2);
  assert.equal(result.failedClaims.length, 1);
  assert.throws(() => qualityMetrics({ questions: [], claims: [{ id: 'c', statement: 'Claim', verdict: 'verified' }] }), /source reference/);
});
