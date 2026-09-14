import { describe, expect, it } from 'vitest';
import { assertMeaningTransitionV2Link, meaningTransitionV2DecisionArtifact, meaningTransitionV2TextDigest, parseMeaningTransitionV2, prepareMeaningTransitionV2, serializeMeaningTransitionV2, verifyMeaningTransitionV2, type MeaningTransitionV2Input } from './meaning-transition-v2';

const A = `sha256:${'a'.repeat(64)}` as const;
const B = `sha256:${'b'.repeat(64)}` as const;
const C = `sha256:${'c'.repeat(64)}` as const;
const SOURCE_BASIS = `source:sha256:${'d'.repeat(64)}` as const;
const MEANING_BASIS = `meaning:sha256:${'e'.repeat(64)}`;
const artifact = (contentDigest: `sha256:${string}`) => ({ ref: `.ontology-atlas/meaning-transitions/artifacts/${contentDigest.slice(7)}.artifact`, contentDigest });
const identity = { vaultId: '/vault', sessionGeneration: 2, userEventId: 'event', requestId: 0, toolCallId: 'mcp-call-1' };
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, child]) => [key, stable(child)]));
  return value;
}
async function recordDigest(value: unknown): Promise<`sha256:${string}`> {
  return meaningTransitionV2TextDigest(JSON.stringify(stable(value)));
}

async function observedReviewEvidence(value: MeaningTransitionV2Input['identity'] = identity) {
  const content = {
    identity: value,
    request: { outcome: 'Change refund meaning', nonGoals: ['Keep capture unchanged.'] },
    sourceRevision: SOURCE_BASIS,
    meaningRevision: MEANING_BASIS,
    contentDigest: A,
    rawInput: { slug: 'capabilities/refund', expected_mtime: 100.125, frontmatter: { owner: 'billing' } },
  };
  return {
    status: 'observed' as const,
    proposalBinding: { ...content, digest: await recordDigest(content) },
    source: { status: 'observed' as const, rootPath: '/repo', sourceId: C, kind: 'git' as const,
      revision: 'abc123', fingerprint: B, dirty: true, sourceBasisId: SOURCE_BASIS },
  };
}

async function input(overrides: Partial<MeaningTransitionV2Input> = {}): Promise<MeaningTransitionV2Input> {
  const selectedIdentity = overrides.identity ?? identity;
  const selectedReview = overrides.reviewEvidence ?? await observedReviewEvidence(selectedIdentity);
  const request = selectedReview.status === 'observed'
    ? selectedReview.proposalBinding.request
    : { outcome: 'Change refund meaning', nonGoals: ['Keep capture unchanged.'] };
  const taskDigest = await meaningTransitionV2TextDigest(JSON.stringify(request));
  const proposalDigest = selectedReview.status === 'observed' ? selectedReview.proposalBinding.digest : B;
  const base: MeaningTransitionV2Input = {
    eventId: '95f4ba81-41f7-483b-a617-2a4be815be32', createdAt: '2026-09-14T08:00:01.000Z', decisionId: '819f2753-2f91-4e2a-8638-b69051965d3b', phase: 'decision', previous: null,
    identity: selectedIdentity, task: { label: request.outcome, digest: taskDigest },
    proposal: { digest: proposalDigest as `sha256:${string}`, operation: 'patch_concept', rows: [{ rowId: 'row', operation: 'patch', target: 'capabilities/refund', rawGuardDigest: A, expectedPersistedDigest: B }], artifacts: { retainedBefore: artifact(A), preview: artifact(B), decision: artifact(A) } },
    meaningDecision: { decisionId: '819f2753-2f91-4e2a-8638-b69051965d3b', action: 'accept_meaning', actionAt: '2026-09-14T08:00:00.000Z', actor: 'user_action', authentication: 'unverified', rationale: null, acceptedGaps: ['Source task ownership unavailable.'] },
    reviewEvidence: selectedReview,
    acpCorrelation: { status: 'observed', sessionId: 'session', requestId: 0, toolCallId: 'mcp-call-1', evidence: 'structured_mcp_approval', executionPermission: 'pending' },
    git: { source: { status: 'unavailable', reason: 'Task-owned source diff unavailable.' }, vault: { status: 'unavailable', reason: 'Vault Git observation unavailable.' } },
    rowEvidence: [{ rowId: 'row', execution: 'not_run', readback: 'unknown', persistedDigest: null, error: null }],
    receipts: { codeChecks: 'unknown', merge: 'unknown', deployment: 'unknown' }, remainingQuestions: ['Did the writer persist the preview bytes?'],
  };
  const result = { ...base, ...overrides };
  result.proposal.artifacts.decision = artifact(await meaningTransitionV2TextDigest(meaningTransitionV2DecisionArtifact(result)));
  return result;
}

async function resealDecision(value: MeaningTransitionV2Input): Promise<MeaningTransitionV2Input> {
  value.proposal.artifacts.decision = artifact(await meaningTransitionV2TextDigest(meaningTransitionV2DecisionArtifact(value)));
  return value;
}

describe('meaning transition v2 snapshots', () => {
  it('creates nothing when no explicit meaning action exists', async () => {
    await expect(prepareMeaningTransitionV2({ meaningDecision: null })).resolves.toEqual({ status: 'not_created', reason: 'meaning_decision_unavailable' });
  });
  it('roundtrips an immediate immutable accepted-unverified decision with explicit unavailable Git facts', async () => {
    const prepared = await prepareMeaningTransitionV2(await input());
    expect(prepared.record).toMatchObject({ phase: 'decision', outcome: 'accepted_unverified', git: { source: { status: 'unavailable' }, vault: { status: 'unavailable' } } });
    expect(prepared.record.createdAt).not.toBe(prepared.record.meaningDecision.actionAt);
    const markdown = serializeMeaningTransitionV2(prepared.record);
    await expect(parseMeaningTransitionV2(markdown)).resolves.toEqual(prepared.record);
    expect(Object.isFrozen(prepared.record.meaningDecision)).toBe(true);
  });

  it('links a later terminal snapshot without changing sealed decision or proposal basis', async () => {
    const decision = (await prepareMeaningTransitionV2(await input())).record;
    const terminal = (await prepareMeaningTransitionV2(await input({
      eventId: '05c117c2-17bb-475f-9990-758cf541aa84', createdAt: '2026-09-14T08:01:00.000Z', phase: 'terminal',
      previous: { eventId: decision.eventId, createdAt: decision.createdAt, recordDigest: decision.recordDigest },
      acpCorrelation: { ...decision.acpCorrelation, executionPermission: 'allowed' } as MeaningTransitionV2Input['acpCorrelation'],
      rowEvidence: [{ rowId: 'row', execution: 'completed', readback: 'matched', persistedDigest: B, error: null }],
    }))).record;
    expect(() => assertMeaningTransitionV2Link(decision, terminal)).not.toThrow();
    expect(terminal.outcome).toBe('accepted_complete');
  });

  it('keeps meaning accepted when execution permission is rejected and no writer runs', async () => {
    const decision = (await prepareMeaningTransitionV2(await input())).record;
    const terminal = (await prepareMeaningTransitionV2(await input({
      eventId: '05c117c2-17bb-475f-9990-758cf541aa84', createdAt: '2026-09-14T08:01:00.000Z', phase: 'terminal',
      previous: { eventId: decision.eventId, createdAt: decision.createdAt, recordDigest: decision.recordDigest },
      acpCorrelation: { ...decision.acpCorrelation, executionPermission: 'rejected' } as MeaningTransitionV2Input['acpCorrelation'],
    }))).record;
    expect(terminal.meaningDecision.action).toBe('accept_meaning');
    expect(terminal.rowEvidence[0]).toMatchObject({ execution: 'not_run', readback: 'unknown' });
    expect(() => assertMeaningTransitionV2Link(decision, terminal)).not.toThrow();
  });

  it('rejects changed/lost chain basis, mismatched correlation, and invented writer execution', async () => {
    const decision = (await prepareMeaningTransitionV2(await input())).record;
    await expect(prepareMeaningTransitionV2(await input({ identity: { ...identity, requestId: '0' } }))).rejects.toThrow(/correlation/);
    await expect(prepareMeaningTransitionV2(await input({
      phase: 'terminal', eventId: '05c117c2-17bb-475f-9990-758cf541aa84', createdAt: '2026-09-14T08:01:00.000Z',
      previous: { eventId: decision.eventId, createdAt: decision.createdAt, recordDigest: decision.recordDigest },
      acpCorrelation: { ...decision.acpCorrelation, executionPermission: 'rejected' } as MeaningTransitionV2Input['acpCorrelation'],
      rowEvidence: [{ rowId: 'row', execution: 'completed', readback: 'matched', persistedDigest: B, error: null }],
    }))).rejects.toThrow(/Rejected execution/);
    const changed = structuredClone(decision); changed.task.label = 'Changed';
    expect(await verifyMeaningTransitionV2(changed)).toBe(false);
  });

  it('keeps numeric zero, string zero, and empty string request IDs distinct', async () => {
    const records = await Promise.all([0, '0', ''].map(async (requestId) => (await prepareMeaningTransitionV2(await input({
      identity: { ...identity, requestId },
      acpCorrelation: { status: 'observed', sessionId: 'session', requestId, toolCallId: identity.toolCallId, evidence: 'structured_mcp_approval', executionPermission: 'pending' },
    }))).record));
    expect(new Set(records.map((record) => record.recordDigest)).size).toBe(3);
  });

  it('uses exact snapshot identity for idempotent retry and chain links rather than wall-clock inference', async () => {
    const source = await input();
    const first = (await prepareMeaningTransitionV2(source)).record;
    const retry = (await prepareMeaningTransitionV2(source)).record;
    expect(retry).toEqual(first);
    const terminal = (await prepareMeaningTransitionV2(await input({
      eventId: '05c117c2-17bb-475f-9990-758cf541aa84', createdAt: '2026-09-14T07:59:59.000Z', phase: 'terminal',
      previous: { eventId: first.eventId, createdAt: first.createdAt, recordDigest: first.recordDigest },
      acpCorrelation: { ...first.acpCorrelation, executionPermission: 'allowed' } as MeaningTransitionV2Input['acpCorrelation'],
    }))).record;
    expect(() => assertMeaningTransitionV2Link(first, terminal)).not.toThrow();
  });

  it('rejects swapped artifact roles and a decision artifact not bound to the explicit action', async () => {
    const swapped = await input();
    swapped.proposal.artifacts.preview = swapped.proposal.artifacts.retainedBefore;
    await expect(prepareMeaningTransitionV2(swapped)).rejects.toThrow(/artifact roles/);
    const changed = await input();
    changed.meaningDecision.actionAt = '2026-09-14T07:59:58.000Z';
    await expect(prepareMeaningTransitionV2(changed)).rejects.toThrow(/artifact roles/);
  });

  it('allows action and snapshot to share the same observed millisecond', async () => {
    const value = await input({ createdAt: '2026-09-14T08:00:00.000Z' });
    await expect(prepareMeaningTransitionV2(value)).resolves.toMatchObject({ status: 'snapshot', record: { createdAt: value.meaningDecision.actionAt } });
  });

  it('allows each linked snapshot to retain its honest changed Git observation', async () => {
    const decision = (await prepareMeaningTransitionV2(await input())).record;
    const terminal = (await prepareMeaningTransitionV2(await input({
      eventId: '05c117c2-17bb-475f-9990-758cf541aa84', phase: 'terminal', previous: { eventId: decision.eventId, createdAt: decision.createdAt, recordDigest: decision.recordDigest },
      acpCorrelation: { ...decision.acpCorrelation, executionPermission: 'allowed' } as MeaningTransitionV2Input['acpCorrelation'],
      git: { source: { status: 'observed', repositoryId: 'source', revision: 'after', dirty: true }, vault: { status: 'observed', repositoryId: 'vault', revision: 'after', dirty: true } },
    }))).record;
    expect(() => assertMeaningTransitionV2Link(decision, terminal)).not.toThrow();
  });

  it('withholds accepted_complete without exact observed and allowed writer correlation', async () => {
    const decision = (await prepareMeaningTransitionV2(await input({ acpCorrelation: { status: 'unavailable', reason: 'synthetic elicitation', executionPermission: 'unknown' } }))).record;
    const terminal = (await prepareMeaningTransitionV2(await input({
      eventId: '05c117c2-17bb-475f-9990-758cf541aa84', phase: 'terminal', previous: { eventId: decision.eventId, createdAt: decision.createdAt, recordDigest: decision.recordDigest },
      acpCorrelation: decision.acpCorrelation,
      rowEvidence: [{ rowId: 'row', execution: 'completed', readback: 'matched', persistedDigest: B, error: null }],
    }))).record;
    expect(terminal.outcome).toBe('accepted_partial');
    expect(() => assertMeaningTransitionV2Link(decision, terminal)).not.toThrow();
  });

  it('withholds accepted_complete when the exact review basis is unavailable', async () => {
    const reviewEvidence = { status: 'unavailable' as const, reason: 'Exact proposal binding was not retained.' };
    const decision = (await prepareMeaningTransitionV2(await input({ reviewEvidence }))).record;
    const terminal = (await prepareMeaningTransitionV2(await input({
      reviewEvidence,
      eventId: '05c117c2-17bb-475f-9990-758cf541aa84', phase: 'terminal',
      previous: { eventId: decision.eventId, createdAt: decision.createdAt, recordDigest: decision.recordDigest },
      acpCorrelation: { ...decision.acpCorrelation, executionPermission: 'allowed' } as MeaningTransitionV2Input['acpCorrelation'],
      rowEvidence: [{ rowId: 'row', execution: 'completed', readback: 'matched', persistedDigest: B, error: null }],
    }))).record;
    expect(terminal.outcome).toBe('accepted_partial');
    expect(() => assertMeaningTransitionV2Link(decision, terminal)).not.toThrow();
  });

  it('retains exact review input and rejects a changed or unverifiable review basis', async () => {
    const prepared = (await prepareMeaningTransitionV2(await input())).record;
    expect(prepared.reviewEvidence).toMatchObject({
      status: 'observed',
      proposalBinding: { rawInput: { expected_mtime: 100.125 }, sourceRevision: SOURCE_BASIS, meaningRevision: MEANING_BASIS },
      source: { sourceId: C, fingerprint: B, sourceBasisId: SOURCE_BASIS },
    });
    const changed = await input();
    if (changed.reviewEvidence.status !== 'observed') throw new Error('observed fixture expected');
    changed.reviewEvidence.proposalBinding.rawInput.expected_mtime = 101.5;
    await expect(prepareMeaningTransitionV2(changed)).rejects.toThrow(/binding digest/);
    await expect(prepareMeaningTransitionV2(await input({ reviewEvidence: { status: 'future' } as never }))).rejects.toThrow(/review evidence/);
  });

  it('cross-binds the observed review evidence to the task, proposal, guard, and target', async () => {
    const changedProposal = await input(); changedProposal.proposal.digest = C;
    await expect(prepareMeaningTransitionV2(await resealDecision(changedProposal))).rejects.toThrow(/review evidence/);
    const changedGuard = await input(); changedGuard.proposal.rows[0].rawGuardDigest = C;
    changedGuard.proposal.artifacts.retainedBefore = artifact(C);
    await expect(prepareMeaningTransitionV2(await resealDecision(changedGuard))).rejects.toThrow(/review evidence/);
    const changedTarget = await input(); changedTarget.proposal.rows[0].target = 'capabilities/other';
    await expect(prepareMeaningTransitionV2(await resealDecision(changedTarget))).rejects.toThrow(/review evidence/);
    const changedTask = await input(); changedTask.task.label = 'Different task';
    await expect(prepareMeaningTransitionV2(await resealDecision(changedTask))).rejects.toThrow(/review evidence/);
    const changedTaskDigest = await input(); changedTaskDigest.task.digest = C;
    await expect(prepareMeaningTransitionV2(await resealDecision(changedTaskDigest))).rejects.toThrow(/review evidence/);
  });

  it('binds the exact row manifest into the explicit decision artifact', async () => {
    const original = await input();
    const originalDecisionBytes = meaningTransitionV2DecisionArtifact(original);
    const forged = await input({ proposal: {
      ...original.proposal,
      rows: [{ ...original.proposal.rows[0], target: 'capabilities/other.md' }],
    } });
    forged.proposal.artifacts.decision.contentDigest = await meaningTransitionV2TextDigest(originalDecisionBytes);
    await expect(prepareMeaningTransitionV2(forged)).rejects.toThrow(/artifact roles/);
  });

  it('rejects invalid enums and detects a forged row manifest even with a recomputed record digest', async () => {
    await expect(prepareMeaningTransitionV2(await input({ phase: 'later' as never }))).rejects.toThrow(/phase/);
    await expect(prepareMeaningTransitionV2(await input({ acpCorrelation: { status: 'observed', sessionId: 'session', requestId: 0, toolCallId: 'mcp-call-1', evidence: 'structured_mcp_approval', executionPermission: 'maybe' as never } }))).rejects.toThrow(/correlation/);
    await expect(prepareMeaningTransitionV2(await input({ git: { source: { status: 'guessed' as never, reason: 'x' }, vault: { status: 'unavailable', reason: 'x' } } }))).rejects.toThrow(/Git/);
    const record = structuredClone((await prepareMeaningTransitionV2(await input())).record);
    record.proposal.rowManifestDigest = A;
    const { recordDigest: _, ...content } = record;
    record.recordDigest = await recordDigest(content);
    expect(await verifyMeaningTransitionV2(record)).toBe(false);
  });
});
