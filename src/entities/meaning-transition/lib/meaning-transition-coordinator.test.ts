import { describe, expect, it, vi } from 'vitest';

import type { AcpWorkReceipt } from '@/shared/lib/acp-work-receipt';
import { meaningTransitionV2TextDigest } from '@/shared/lib/meaning-transition-v2';
import { buildProposalBinding } from '@/entities/knowledge-graph';

import {
  createMeaningTransitionCoordinator,
  type MeaningTransitionDecisionInput,
  type MeaningTransitionReadback,
} from './meaning-transition-coordinator';

const ids = [
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000006',
];

const rawBefore = `---
uid: 20000000-0000-4000-8000-000000000001
kind: capability
title: Refund
description: Old rule
---

Refund body
`;

async function fixture(action: MeaningTransitionDecisionInput['action'] = 'accept_meaning'): Promise<MeaningTransitionDecisionInput> {
  const identity = { vaultId: '/vault', sessionGeneration: 3, userEventId: 'user-1', requestId: 7, toolCallId: 'tool-1' };
  const sourceRevision = `source:sha256:${'e'.repeat(64)}`;
  const beforeDigest = await meaningTransitionV2TextDigest(rawBefore);
  const binding = await buildProposalBinding({ identity, request: { outcome: 'Change refund policy', nonGoals: null },
    sourceRevision, meaningRevision: 'meaning:before', contentDigest: beforeDigest,
    rawInput: { slug: 'capabilities/refund', expected_mtime: 10, frontmatter: { description: 'New rule' } } });
  const digest = await meaningTransitionV2TextDigest(JSON.stringify(binding.request));
  return {
    identity,
    sessionId: 'session-1',
    task: { label: 'Change refund policy', digest },
    proposal: { digest: binding.digest as `sha256:${string}`, operation: 'patch_concept' as const, rowId: 'refund', target: 'capabilities/refund' },
    rawBefore,
    patch: { frontmatter: { description: 'New rule' } },
    action,
    reviewEvidence: { status: 'observed', proposalBinding: binding, source: { status: 'observed', rootPath: '/source',
      sourceId: `sha256:${'d'.repeat(64)}`, kind: 'git', revision: 'abc', fingerprint: `sha256:${'c'.repeat(64)}`,
      dirty: false, sourceBasisId: sourceRevision } },
    acpCorrelation: { status: 'observed' as const, server: 'ontology-atlas', tool: 'patch_concept' as const },
    rationale: null,
    acceptedGaps: [],
    isCurrent: () => true,
  } satisfies MeaningTransitionDecisionInput;
}

function receipt(overrides: Partial<AcpWorkReceipt> = {}): AcpWorkReceipt {
  return {
    v: 1, id: 'receipt-1', at: '2026-09-14T08:00:00.000Z', updatedAt: '2026-09-14T08:01:00.000Z',
    agent: 'Codex', request: 'Change refund policy', tool: 'patch_concept', decision: 'allowed', result: 'completed',
    items: [{ target: 'capabilities/refund', operation: 'patch', relation: null, fields: ['description'] }],
    origin: { vaultId: '/vault', sessionGeneration: 3, sessionId: 'session-1', userEventId: 'user-1', requestId: 7, toolCallId: 'tool-1' },
    writerCorrelation: { status: 'verified', server: 'ontology-atlas', tool: 'patch_concept', toolCall: 'structured-mcp', approval: 'structured-mcp', terminal: 'completed' },
    ...overrides,
  };
}

function harness(readback?: MeaningTransitionReadback) {
  let index = 0;
  const archive = vi.fn().mockResolvedValue(undefined);
  const read = vi.fn().mockResolvedValue(readback ?? { status: 'missing' });
  const coordinator = createMeaningTransitionCoordinator({
    archive,
    readback: read,
    now: () => `2026-09-14T08:0${index}:00.000Z`,
    newId: () => ids[index++]!,
  });
  return { coordinator, archive, read };
}

describe('meaning transition decision coordinator', () => {
  it('archives the action immediately and completes only from an exact allowed writer receipt and two matching readbacks', async () => {
    const input = await fixture();
    const expected = (await import('@/shared/lib/document-patch.mjs')).previewDocumentPatch({ rawBefore, frontmatterPatch: input.patch.frontmatter });
    if (expected.status !== 'available') throw new Error('preview expected');
    const { coordinator, archive, read } = harness({ status: 'available', content: expected.markdown, mtime: 10, contextId: 'vault-3' });
    const decision = await coordinator.recordDecision(input);
    expect(decision.status).toBe('archived');
    if (decision.status !== 'archived') return;
    expect(decision.record).toMatchObject({ phase: 'decision', outcome: 'accepted_unverified', meaningDecision: { action: 'accept_meaning' } });
    expect(archive).toHaveBeenCalledTimes(1);

    const terminal = await coordinator.recordTerminal({ decisionId: decision.record.decisionId, receipt: receipt(), isCurrent: () => true });
    expect(terminal.status).toBe('archived');
    if (terminal.status !== 'archived') return;
    expect(terminal.record).toMatchObject({ phase: 'terminal', outcome: 'accepted_complete',
      previous: { recordDigest: decision.record.recordDigest }, rowEvidence: [{ execution: 'completed', readback: 'matched' }] });
    expect(read).toHaveBeenCalledTimes(2);
    expect(terminal.record.git.source).toMatchObject({ status: 'unavailable' });
    expect(terminal.record.receipts).toEqual({ codeChecks: 'unknown', merge: 'unknown', deployment: 'unknown' });
  });

  it('rejects wrong identity and receipts synthesized without explicit origin or writer correlation', async () => {
    const { coordinator } = harness();
    const decision = await coordinator.recordDecision(await fixture());
    if (decision.status !== 'archived') throw new Error('decision expected');
    await expect(coordinator.recordTerminal({ decisionId: decision.record.decisionId,
      receipt: receipt({ origin: { ...receipt().origin!, toolCallId: 'wrong' } }), isCurrent: () => true })).rejects.toThrow(/origin/);
    await expect(coordinator.recordTerminal({ decisionId: decision.record.decisionId,
      receipt: receipt({ id: 'receipt-2', updatedAt: '2026-09-14T08:02:00.000Z', origin: undefined }), isCurrent: () => true })).rejects.toThrow(/origin/);
    await expect(coordinator.recordTerminal({ decisionId: decision.record.decisionId,
      receipt: receipt({ id: 'receipt-3', updatedAt: '2026-09-14T08:03:00.000Z', writerCorrelation: undefined }), isCurrent: () => true })).rejects.toThrow(/correlated allowed writer/);
    const unavailable = await fixture();
    unavailable.acpCorrelation = { status: 'unavailable', reason: 'Structured request provenance was not captured.' };
    const other = harness().coordinator;
    const unverified = await other.recordDecision(unavailable);
    if (unverified.status !== 'archived') throw new Error('decision expected');
    expect(unverified.record.acpCorrelation.status).toBe('unavailable');
    await expect(other.recordTerminal({ decisionId: unverified.record.decisionId, receipt: receipt(), isCurrent: () => true })).rejects.toThrow(/correlated allowed writer/);
  });

  it('does not create a transition for a semantic no-op and requires a real action', async () => {
    const input = await fixture();
    input.patch = { frontmatter: { description: 'Old rule' } };
    const { coordinator, archive } = harness();
    await expect(coordinator.recordDecision(input)).resolves.toEqual({ status: 'not_created', reason: 'no_semantic_delta' });
    expect(archive).not.toHaveBeenCalled();
    await expect(coordinator.recordDecision({ ...await fixture(), action: undefined as never })).rejects.toThrow(/explicit meaning action/);
  });

  it.each(['reject_meaning', 'defer_meaning'] as const)('records the supplied %s action without inventing acceptance', async (action) => {
    const { coordinator } = harness();
    const result = await coordinator.recordDecision(await fixture(action));
    expect(result.status).toBe('archived');
    if (result.status === 'archived') expect(result.record).toMatchObject({ meaningDecision: { action }, outcome: action === 'reject_meaning' ? 'rejected' : 'deferred' });
  });

  it('keeps completed writes partial when exact readback mismatches or is missing', async () => {
    for (const observation of [{ status: 'available', content: 'different', mtime: 10, contextId: 'vault-3' }, { status: 'missing' }] satisfies MeaningTransitionReadback[]) {
      const { coordinator } = harness(observation);
      const decision = await coordinator.recordDecision(await fixture());
      if (decision.status !== 'archived') throw new Error('decision expected');
      const terminal = await coordinator.recordTerminal({ decisionId: decision.record.decisionId, receipt: receipt(), isCurrent: () => true });
      if (terminal.status !== 'archived') throw new Error('terminal expected');
      expect(terminal.record.outcome).toBe('accepted_partial');
      expect(terminal.record.rowEvidence[0]?.readback).toBe(observation.status === 'missing' ? 'missing' : 'mismatched');
    }
    const failing = harness();
    failing.read.mockRejectedValue(new Error('native read failed'));
    const decision = await failing.coordinator.recordDecision(await fixture());
    if (decision.status !== 'archived') throw new Error('decision expected');
    const terminal = await failing.coordinator.recordTerminal({ decisionId: decision.record.decisionId, receipt: receipt(), isCurrent: () => true });
    if (terminal.status !== 'archived') throw new Error('terminal expected');
    expect(terminal.record.rowEvidence[0]).toMatchObject({ execution: 'completed', readback: 'missing', error: 'Fresh writer readback failed.' });
  });

  it('captures mutable inputs before awaiting, cancels stale context, and preserves retry identity', async () => {
    const input = await fixture();
    const { coordinator, archive } = harness();
    archive.mockRejectedValueOnce(new Error('archive unavailable')).mockResolvedValue(undefined);
    const pending = coordinator.recordDecision(input);
    input.patch.frontmatter!.description = 'mutated after action';
    await expect(pending).rejects.toThrow(/archive unavailable/);
    const retried = await coordinator.recordDecision(await fixture());
    if (retried.status !== 'archived') throw new Error('retry expected');
    const firstRecord = archive.mock.calls[0]![0].record;
    expect(retried.record.eventId).toBe(firstRecord.eventId);
    expect(retried.record.decisionId).toBe(firstRecord.decisionId);
    expect(retried.artifacts.find((artifact) => artifact.digest === retried.record.proposal.artifacts.preview.contentDigest)?.content).not.toContain('mutated after action');

    await expect(coordinator.recordTerminal({ decisionId: retried.record.decisionId, receipt: receipt(), isCurrent: () => false })).rejects.toThrow(/context changed/);
  });

  it('records rejected execution as not-run while retaining the separate meaning action', async () => {
    const { coordinator, read } = harness();
    const decision = await coordinator.recordDecision(await fixture('defer_meaning'));
    if (decision.status !== 'archived') throw new Error('decision expected');
    const terminal = await coordinator.recordTerminal({ decisionId: decision.record.decisionId,
      receipt: receipt({ decision: 'rejected', result: 'not-run', writerCorrelation: {
        status: 'verified', server: 'ontology-atlas', tool: 'patch_concept', toolCall: 'structured-mcp', approval: 'structured-mcp', terminal: 'not-observed',
      } }), isCurrent: () => true });
    if (terminal.status !== 'archived') throw new Error('terminal expected');
    expect(terminal.record).toMatchObject({ meaningDecision: { action: 'defer_meaning' }, acpCorrelation: { executionPermission: 'rejected' }, rowEvidence: [{ execution: 'not_run' }] });
    expect(read).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent decisions and retries terminal publication with identical sealed bytes', async () => {
    const input = await fixture();
    const expected = (await import('@/shared/lib/document-patch.mjs')).previewDocumentPatch({ rawBefore, frontmatterPatch: input.patch.frontmatter });
    if (expected.status !== 'available') throw new Error('preview expected');
    const { coordinator, archive, read } = harness({ status: 'available', content: expected.markdown, mtime: 10, contextId: 'vault-3' });
    const [left, right] = await Promise.all([coordinator.recordDecision(input), coordinator.recordDecision(input)]);
    expect(left).toBe(right);
    expect(archive).toHaveBeenCalledTimes(1);
    if (left.status !== 'archived') throw new Error('decision expected');
    archive.mockRejectedValueOnce(new Error('archive interrupted')).mockResolvedValue(undefined);
    await expect(coordinator.recordTerminal({ decisionId: left.record.decisionId, receipt: receipt(), isCurrent: () => true })).rejects.toThrow(/archive interrupted/);
    const attempted = archive.mock.calls[1]![0].record;
    const retried = await coordinator.recordTerminal({ decisionId: left.record.decisionId, receipt: receipt(), isCurrent: () => true });
    if (retried.status !== 'archived') throw new Error('terminal expected');
    expect(retried.record).toEqual(attempted);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('takes a fresh Git observation for the terminal snapshot', async () => {
    const input = await fixture();
    const expected = (await import('@/shared/lib/document-patch.mjs')).previewDocumentPatch({ rawBefore, frontmatterPatch: input.patch.frontmatter });
    if (expected.status !== 'available') throw new Error('preview expected');
    let index = 0;
    const archive = vi.fn().mockResolvedValue(undefined);
    const observeGit = vi.fn()
      .mockResolvedValueOnce({ source: { status: 'observed', repositoryId: 'source', revision: 'a', dirty: false }, vault: { status: 'unavailable', reason: 'vault unknown' } })
      .mockResolvedValueOnce({ source: { status: 'observed', repositoryId: 'source', revision: 'b', dirty: true }, vault: { status: 'unavailable', reason: 'vault unknown' } });
    const coordinator = createMeaningTransitionCoordinator({ archive, observeGit,
      readback: async () => ({ status: 'available', content: expected.markdown, mtime: 10, contextId: 'vault-3' }),
      now: () => `2026-09-14T08:0${index}:00.000Z`, newId: () => ids[index++]! });
    const decisionResult = await coordinator.recordDecision(input);
    if (decisionResult.status !== 'archived') throw new Error('decision expected');
    expect(decisionResult.record.git.source).toMatchObject({ revision: 'a', dirty: false });
    const terminal = await coordinator.recordTerminal({ decisionId: decisionResult.record.decisionId, receipt: receipt(), isCurrent: () => true });
    if (terminal.status !== 'archived') throw new Error('terminal expected');
    expect(terminal.record.git.source).toMatchObject({ revision: 'b', dirty: true });
    expect(observeGit).toHaveBeenCalledTimes(2);
  });

  it('rejects changed decision or receipt bytes presented as the same retry identity', async () => {
    const { coordinator } = harness();
    const input = await fixture();
    const decisionResult = await coordinator.recordDecision(input);
    if (decisionResult.status !== 'archived') throw new Error('decision expected');
    await expect(coordinator.recordDecision({ ...input, rationale: 'changed retry rationale' })).rejects.toThrow(/sealed input/);
    const terminalReceipt = receipt({ result: 'failed', writerCorrelation: { ...receipt().writerCorrelation!, terminal: 'failed' } });
    await coordinator.recordTerminal({ decisionId: decisionResult.record.decisionId, receipt: terminalReceipt, isCurrent: () => true });
    await expect(coordinator.recordTerminal({ decisionId: decisionResult.record.decisionId,
      receipt: { ...terminalReceipt, items: [{ ...terminalReceipt.items[0]!, fields: ['title'] }] }, isCurrent: () => true })).rejects.toThrow(/immutable receipt/);
  });

  it('does not rewind the latest chain head when an older terminal snapshot is retried', async () => {
    const { coordinator } = harness();
    const decisionResult = await coordinator.recordDecision(await fixture());
    if (decisionResult.status !== 'archived') throw new Error('decision expected');
    const firstReceipt = receipt({ result: 'failed', updatedAt: '2026-09-14T08:01:00.000Z',
      writerCorrelation: { ...receipt().writerCorrelation!, terminal: 'failed' } });
    const first = await coordinator.recordTerminal({ decisionId: decisionResult.record.decisionId, receipt: firstReceipt, isCurrent: () => true });
    if (first.status !== 'archived') throw new Error('terminal expected');
    const secondReceipt = { ...firstReceipt, updatedAt: '2026-09-14T08:02:00.000Z', result: 'cancelled' as const,
      writerCorrelation: { ...firstReceipt.writerCorrelation!, terminal: 'cancelled' as const } };
    const second = await coordinator.recordTerminal({ decisionId: decisionResult.record.decisionId, receipt: secondReceipt, isCurrent: () => true });
    if (second.status !== 'archived') throw new Error('terminal expected');
    await coordinator.recordTerminal({ decisionId: decisionResult.record.decisionId, receipt: firstReceipt, isCurrent: () => true });
    const thirdReceipt = { ...firstReceipt, updatedAt: '2026-09-14T08:03:00.000Z' };
    const third = await coordinator.recordTerminal({ decisionId: decisionResult.record.decisionId, receipt: thirdReceipt, isCurrent: () => true });
    if (third.status !== 'archived') throw new Error('terminal expected');
    expect(third.record.previous?.recordDigest).toBe(second.record.recordDigest);
  });
});
