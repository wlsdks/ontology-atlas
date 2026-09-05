import { describe, expect, it } from 'vitest';

import {
  analysisRecordFileName,
  compareAnalysisBasis,
  parseAnalysisRecord,
  serializeAnalysisRecord,
  analysisDigest,
  verifyAnalysisEvidence,
  type AnalysisRun,
} from './analysis-record.mts';

const HASH = `sha256:${'a'.repeat(64)}`;

function run(): AnalysisRun {
  return {
    schema: 'atlas-analysis/v1',
    recordType: 'run',
    id: '95f4ba81-41f7-483b-a617-2a4be815be32',
    createdAt: '2026-09-05T08:00:00.000Z',
    mode: 'meaning',
    scope: { projectSlug: 'store', projectUid: null, targetSlugs: ['capabilities/refund'], profileSlug: null },
    request: { id: 'user-1', text: 'Explain this boundary.\nKeep unknowns visible.', parentRunId: null },
    origin: { surface: 'map', runtimeId: 'test', sessionId: 'session-1', userEventId: 'user-1', answerEventId: 'agent-1', startedAt: '2026-09-05T07:59:00.000Z', stopReason: 'end_turn', outcome: 'completed' },
    basis: { graphHash: HASH, sourceFingerprint: null, profileHash: null, documents: [{ slug: 'capabilities/refund', digest: HASH }] },
    evidence: [{ slug: 'capabilities/refund', uid: null, title: 'Refund', kind: 'capability', body: '\n## Definition\nRefund a settled purchase.\n', frontmatter: { kind: 'capability' }, digest: HASH, toolCallId: 'read-1' }],
    observations: [], profileSnapshot: null,
    toolReads: [{ id: 'read-1', name: 'get_concept', status: 'completed' }],
    sourceAccess: 'atlas-only',
    findings: [{ id: 'finding-1', category: 'boundary', title: 'Check the time boundary', detail: 'The requested behavior may cross the recorded limit.', targetSlugs: ['capabilities/refund'], evidenceSlugs: ['capabilities/refund'], roleIds: [], relation: null, suggestedAction: 'Check the recorded policy.' }],
    qualification: { status: 'grounded', reasons: [] },
    answer: '# A useful answer\n\nUnknown: downstream effects.\n\n---\nLiteral delimiter stays in the answer.\n',
  };
}

describe('immutable analysis record format', () => {
  it('roundtrips the exact raw answer, request, evidence and uncertainty without a kind', () => {
    const value = run();
    const markdown = serializeAnalysisRecord(value);
    expect(markdown).not.toMatch(/^kind:/m);
    expect(parseAnalysisRecord(markdown)).toEqual(value);
  });

  it('retains an unstructured answer even when there is no qualified finding', () => {
    const value = { ...run(), answer: 'No headings or citations.\r\nA useful but unverified answer.', evidence: [], findings: [], qualification: { status: 'unverified' as const, reasons: ['no_full_body_evidence'] } };
    expect(parseAnalysisRecord(serializeAnalysisRecord(value))).toEqual(value);
  });

  it('uses a timestamp and immutable id so same-second analyses are different files', () => {
    const first = run();
    const second = { ...first, id: '24e7bc39-013c-46e7-86b2-ff2f3aeab58c' };
    expect(analysisRecordFileName(first)).not.toBe(analysisRecordFileName(second));
    expect(analysisRecordFileName(first)).toBe('2026-09-05T08-00-00-000Z-95f4ba81-41f7-483b-a617-2a4be815be32.md');
  });

  it('refuses path-shaped ids and untrusted record discriminators', () => {
    expect(() => serializeAnalysisRecord({ ...run(), id: '../other' })).toThrow();
    const text = serializeAnalysisRecord(run()).replace('"atlas-analysis/v1"', '"future/v9"');
    expect(() => parseAnalysisRecord(text)).toThrow();
  });

  it('refuses duplicated metadata and a forged qualified unread finding', () => {
    const text = serializeAnalysisRecord(run()).replace('---\n', '---\nanalysis_schema: "atlas-analysis/v1"\n');
    expect(() => parseAnalysisRecord(text)).toThrow(/duplicate/i);
    expect(() => serializeAnalysisRecord({ ...run(), evidence: [] })).toThrow(/evidence/i);
  });

  it('retains a review as a separate immutable document', () => {
    const review = { schema: 'atlas-analysis/v1' as const, recordType: 'review' as const, id: '24e7bc39-013c-46e7-86b2-ff2f3aeab58c', createdAt: '2026-09-05T08:05:00.000Z', runId: run().id, findingId: 'finding-1', disposition: 'dismiss' as const, actor: 'user-action' as const, rationale: 'The policy permits this case.\nKeep the original analysis.' };
    expect(parseAnalysisRecord(serializeAnalysisRecord(review))).toEqual(review);
    expect(parseAnalysisRecord(serializeAnalysisRecord(run()))).toEqual(run());
  });
  it('detects changed embedded evidence and a mismatched basis after parsing', async () => {
    const value = run();
    value.evidence[0].digest = await analysisDigest({ frontmatter: value.evidence[0].frontmatter, body: value.evidence[0].body });
    value.basis.documents[0].digest = value.evidence[0].digest;
    expect(await verifyAnalysisEvidence(value)).toEqual([]);
    value.evidence[0].body += 'A later assertion.';
    expect(await verifyAnalysisEvidence(parseAnalysisRecord(serializeAnalysisRecord(value)) as AnalysisRun)).toContain('evidence_digest_mismatch:capabilities/refund');
    value.basis.documents[0].digest = HASH;
    expect(await verifyAnalysisEvidence(value)).toContain('evidence_basis_mismatch:capabilities/refund');
  });
});

describe('analysis basis compatibility', () => {
  it('detects body-only changes even when the graph is unchanged', () => {
    const value = run();
    expect(compareAnalysisBasis(value.basis, value.basis).status).toBe('current');
    const changed = { ...value.basis, documents: [{ slug: 'capabilities/refund', digest: `sha256:${'b'.repeat(64)}` }] };
    expect(compareAnalysisBasis(value.basis, changed)).toEqual({ status: 'stale', reasons: ['document_changed:capabilities/refund'] });
  });

  it('keeps missing current evidence unknown and does not infer resolution', () => {
    const value = run();
    expect(compareAnalysisBasis(value.basis, { ...value.basis, documents: [] })).toEqual({ status: 'unknown', reasons: ['document_unavailable:capabilities/refund'] });
    expect(compareAnalysisBasis(value.basis, { ...value.basis, graphHash: null }).status).toBe('unknown');
  });

  it('invalidates changed source or architecture profile evidence', () => {
    const basis = { ...run().basis, sourceFingerprint: 'source-v1', profileHash: HASH };
    expect(compareAnalysisBasis(basis, { ...basis, sourceFingerprint: 'source-v2' }).status).toBe('stale');
    expect(compareAnalysisBasis(basis, { ...basis, profileHash: null }).status).toBe('unknown');
    expect(compareAnalysisBasis(run().basis, basis).status).toBe('unknown');
  });
});
