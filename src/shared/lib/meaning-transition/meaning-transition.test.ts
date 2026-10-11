import { describe, expect, it } from 'vitest';
import { parseMeaningTransition, prepareMeaningTransition, serializeMeaningTransition, verifyMeaningTransitionDigest, type MeaningTransitionInput } from './meaning-transition';

const A = `sha256:${'a'.repeat(64)}` as const;
const B = `sha256:${'b'.repeat(64)}` as const;
const C = `sha256:${'c'.repeat(64)}` as const;
const ROW_MANIFEST = 'sha256:1e03c199dba6b81f51853b13c3e85a141b0dbe0f1aa34b97725beea47cf98b09' as const;
const identity = { vaultId: 'vault:a', sessionGeneration: 2, userEventId: 'event:1', requestId: 'request:1', toolCallId: 'tool:1' };
const doc = (path: string, contentDigest = A) => ({ path, contentDigest, sourceRevision: 'source:before', meaningRevision: 'meaning:before', graphRevision: 'graph:before' });
const acceptanceDoc = (path: string, contentDigest = A) => ({ path, contentDigest, sourceRevision: 'source:accepted', meaningRevision: 'meaning:accepted', graphRevision: 'graph:accepted' });

function input(): MeaningTransitionInput {
  return {
    eventId: '95f4ba81-41f7-483b-a617-2a4be815be32', createdAt: '2026-09-14T08:00:00.000Z', identity,
    task: { label: 'Change refund eligibility.', digest: A },
    proposal: { digest: B, operation: 'update meaning', artifact: { ref: 'artifacts/proposal.json', contentDigest: B }, rows: [
      { rowId: 'row:condition', operation: 'patch', target: 'capabilities/refund.md', rawGuardDigest: A, expectedPersistedDigest: B },
      { rowId: 'row:exception', operation: 'patch', target: 'capabilities/refund-exception.md', rawGuardDigest: C, expectedPersistedDigest: C },
    ] },
    decision: { actor: 'user_action', disposition: 'accepted', proposalDigest: B, rowManifestDigest: ROW_MANIFEST, taskDigest: A, identity, acceptanceBasis: { vaultId: identity.vaultId, documents: [acceptanceDoc('capabilities/refund.md'), acceptanceDoc('capabilities/refund-exception.md', B)] }, rationale: 'The new condition matches the reviewed policy.', acceptedGaps: ['Retry timing remains unknown.'] },
    historicalBefore: [doc('capabilities/refund.md'), doc('capabilities/refund-exception.md', B)],
    currentAcceptance: { vaultId: identity.vaultId, proposalDigest: B, taskDigest: A, documents: [acceptanceDoc('capabilities/refund.md'), acceptanceDoc('capabilities/refund-exception.md', B)] },
    verifiedAfter: [{ rowId: 'row:condition', ...acceptanceDoc('capabilities/refund.md', B) }, { rowId: 'row:exception', ...acceptanceDoc('capabilities/refund-exception.md', C) }],
    rowEvidence: [
      { rowId: 'row:condition', execution: 'completed', readback: 'matched', persistedDigest: B, error: null },
      { rowId: 'row:exception', execution: 'completed', readback: 'matched', persistedDigest: C, error: null },
    ],
    codeEvidence: {
      sourceRepository: { repositoryId: 'repo:source', baseRevision: 'source:base', currentRevision: 'source:head' },
      vaultRepository: { repositoryId: 'repo:vault', baseRevision: 'vault:base', currentRevision: 'vault:head' },
      observedTaskPaths: ['src/refund.ts'], diffArtifact: { ref: 'artifacts/source.diff', contentDigest: C },
    },
    receipts: { codeChecks: { status: 'passed', refs: ['check:unit'] }, merge: { status: 'pending', refs: [] }, deployment: { status: 'not_applicable', refs: [] } },
    remainingQuestions: ['Does retry timing change for legacy refunds?'],
  };
}

async function record(overrides: Partial<MeaningTransitionInput> = {}) {
  const result = await prepareMeaningTransition({ ...input(), ...overrides, semanticDelta: 'present' });
  if (result.status !== 'candidate') throw new Error('Expected candidate.');
  return result.record;
}

describe('meaning transition evidence', () => {
  it('roundtrips deterministically and preserves rationale, gaps, owner-note-bound bytes, refs, and repository identities', async () => {
    const value = await record();
    const markdown = serializeMeaningTransition(value);
    expect(serializeMeaningTransition(await parseMeaningTransition(markdown))).toBe(markdown);
    expect(await parseMeaningTransition(markdown)).toEqual(value);
    expect(value.historicalBefore[0].contentDigest).toBe(A);
    expect(value.decision.rationale).toContain('reviewed policy');
    expect(value.decision.acceptedGaps).toEqual(['Retry timing remains unknown.']);
    expect(value.proposal.artifact.ref).toBe('artifacts/proposal.json');
    expect(value.codeEvidence.sourceRepository.repositoryId).not.toBe(value.codeEvidence.vaultRepository.repositoryId);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.proposal.rows[0])).toBe(true);
  });

  it('derives accepted completion only from exact current binding and every exact persisted row', async () => {
    expect((await record()).outcome).toBe('accepted_complete');
    const partial = await record({ rowEvidence: input().rowEvidence.slice(0, 1) });
    expect(partial.outcome).toBe('accepted_partial');
    const mismatch = input(); mismatch.rowEvidence[1] = { ...mismatch.rowEvidence[1], persistedDigest: A };
    expect((await record({ rowEvidence: mismatch.rowEvidence })).outcome).toBe('accepted_partial');
    await expect(record({ rowEvidence: [...input().rowEvidence, input().rowEvidence[0]] })).rejects.toThrow(/Duplicate row evidence/);
  });

  it('fails closed for wrong task, revision, proposal, and permission-shaped or rejected decisions', async () => {
    const wrongTask = input(); wrongTask.decision = { ...wrongTask.decision, taskDigest: C };
    expect((await record({ decision: wrongTask.decision })).outcome).toBe('accepted_unverified');
    const wrongProposal = input(); wrongProposal.currentAcceptance = { ...wrongProposal.currentAcceptance, proposalDigest: C };
    expect((await record({ currentAcceptance: wrongProposal.currentAcceptance })).outcome).toBe('accepted_unverified');
    const wrongRevision = input(); wrongRevision.currentAcceptance = { ...wrongRevision.currentAcceptance, documents: [acceptanceDoc('capabilities/refund.md', C), acceptanceDoc('capabilities/refund-exception.md', B)] };
    expect((await record({ currentAcceptance: wrongRevision.currentAcceptance })).outcome).toBe('accepted_unverified');
    await expect(record({ decision: { ...input().decision, actor: 'allowed' as never } })).rejects.toThrow(/actor/);
    expect((await record({ decision: { ...input().decision, disposition: 'rejected' } })).outcome).toBe('rejected');
  });

  it('keeps task-start history distinct from the accepted current basis and detects later drift', async () => {
    const intendedChange = await record();
    expect(intendedChange.historicalBefore[0].sourceRevision).toBe('source:before');
    expect(intendedChange.decision.acceptanceBasis.documents[0].sourceRevision).toBe('source:accepted');
    expect(intendedChange.outcome).toBe('accepted_complete');

    const drifted = input();
    drifted.currentAcceptance.documents[0] = { ...drifted.currentAcceptance.documents[0], sourceRevision: 'source:later' };
    expect((await record({ currentAcceptance: drifted.currentAcceptance })).outcome).toBe('accepted_unverified');
  });

  it('preserves numeric JSON-RPC request identity without conflating it with a string', async () => {
    const numeric = input(); numeric.identity = { ...identity, requestId: 0 }; numeric.decision = { ...numeric.decision, identity: { ...identity, requestId: 0 } };
    expect((await record(numeric)).outcome).toBe('accepted_complete');
    numeric.decision = { ...numeric.decision, identity: { ...identity, requestId: '0' } };
    expect((await record(numeric)).outcome).toBe('accepted_unverified');
  });

  it('retains unknown, partial, and failed execution honestly', async () => {
    expect((await record({ decision: { ...input().decision, disposition: 'unknown' } })).outcome).toBe('unknown');
    const failed = input(); failed.rowEvidence[0] = { ...failed.rowEvidence[0], execution: 'failed', readback: 'missing', persistedDigest: null, error: 'writer failed' };
    expect((await record({ rowEvidence: failed.rowEvidence })).outcome).toBe('accepted_partial');
  });

  it('does not complete with an empty or source-unknown current acceptance basis', async () => {
    const empty = input();
    empty.decision.acceptanceBasis.documents = [];
    empty.currentAcceptance.documents = [];
    expect((await record(empty)).outcome).toBe('accepted_unverified');

    const unknown = input();
    for (const document of unknown.decision.acceptanceBasis.documents) document.sourceRevision = null;
    for (const document of unknown.currentAcceptance.documents) document.sourceRevision = null;
    expect((await record(unknown)).outcome).toBe('accepted_unverified');
  });

  it('requires current acceptance coverage for every distinct row target while allowing extra context', async () => {
    const missing = input();
    missing.decision.acceptanceBasis.documents = missing.decision.acceptanceBasis.documents.slice(0, 1);
    missing.currentAcceptance.documents = missing.currentAcceptance.documents.slice(0, 1);
    expect((await record(missing)).outcome).toBe('accepted_unverified');

    const context = acceptanceDoc('domains/payments.md', C);
    const extra = input();
    extra.decision.acceptanceBasis.documents.push(context);
    extra.currentAcceptance.documents.push(context);
    expect((await record(extra)).outcome).toBe('accepted_complete');
  });

  it('binds accepted meaning to the exact operations, targets, guards, and expected persisted bytes', async () => {
    const operationChanged = input();
    operationChanged.proposal.operation = 'replace meaning';
    expect((await record(operationChanged)).outcome).toBe('accepted_unverified');

    const guardChanged = input();
    guardChanged.proposal.rows[0].rawGuardDigest = C;
    expect((await record(guardChanged)).outcome).toBe('accepted_unverified');

    const bytesChanged = input();
    bytesChanged.proposal.rows[0].expectedPersistedDigest = C;
    bytesChanged.rowEvidence[0].persistedDigest = C;
    bytesChanged.verifiedAfter[0].contentDigest = C;
    expect((await record(bytesChanged)).outcome).toBe('accepted_unverified');
  });

  it('rejects success receipts without exact evidence references', async () => {
    const noCheckRef = input(); noCheckRef.receipts.codeChecks = { status: 'passed', refs: [] };
    await expect(record(noCheckRef)).rejects.toThrow(/codeChecks success/);
    const noMergeRef = input(); noMergeRef.receipts.merge = { status: 'merged', refs: [] };
    await expect(record(noMergeRef)).rejects.toThrow(/merge success/);
    const noDeployRef = input(); noDeployRef.receipts.deployment = { status: 'deployed', refs: [] };
    await expect(record(noDeployRef)).rejects.toThrow(/deployment success/);
  });

  it.each([
    ['none', 'no_semantic_delta'], ['meaning_preserving_refactor', 'meaning_preserving_refactor'], ['unrelated', 'unrelated_task'],
  ] as const)('creates no transition for %s work', async (semanticDelta, reason) => {
    await expect(prepareMeaningTransition({ semanticDelta })).resolves.toEqual({ status: 'not_created', reason });
  });

  it('detects mutation of proposal, guards, rationale, questions, and retained refs after parsing', async () => {
    const base = await record();
    for (const mutate of [
      (value: typeof base) => { value.proposal.digest = C; },
      (value: typeof base) => { value.proposal.rows[0].rawGuardDigest = C; },
      (value: typeof base) => { value.decision.rationale += ' Changed.'; },
      (value: typeof base) => { value.remainingQuestions.push('Another question.'); },
      (value: typeof base) => { value.proposal.artifact.ref = 'artifacts/other.json'; },
    ]) {
      const changed = structuredClone(await parseMeaningTransition(serializeMeaningTransition(base)));
      mutate(changed);
      expect(await verifyMeaningTransitionDigest(changed)).toBe(false);
    }
  });

  it('rejects caller-forged outcomes and malformed duplicate metadata', async () => {
    const value = await record();
    await expect(parseMeaningTransition(serializeMeaningTransition(value).replace('outcome: "accepted_complete"', 'outcome: "rejected"'))).rejects.toThrow(/derived/);
    await expect(parseMeaningTransition(serializeMeaningTransition(value).replace('---\n', '---\nevent_id: "95f4ba81-41f7-483b-a617-2a4be815be32"\n'))).rejects.toThrow(/Duplicate/);
  });

  it('preserves multiline questions, rejects invalid work kinds, and verifies digest on the default parse path', async () => {
    const value = await record({ remainingQuestions: ['First line.\nSecond line.'] });
    expect((await parseMeaningTransition(serializeMeaningTransition(value))).remainingQuestions).toEqual(['First line.\nSecond line.']);
    await expect(prepareMeaningTransition({ semanticDelta: 'typo' as never })).rejects.toThrow(/semanticDelta/);
    await expect(parseMeaningTransition(serializeMeaningTransition(value).replace(`record_digest: "${value.recordDigest}"`, `record_digest: "${C}"`))).rejects.toThrow(/digest/);
  });
});
