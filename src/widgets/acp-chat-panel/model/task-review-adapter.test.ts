import { describe, expect, it, vi } from 'vitest';
import type { AcpTurnStart, PendingPermission } from '@/features/acp-session';
import { adaptTaskReviewHost, type TaskReviewHostInput } from './task-review-adapter';

const digest = (letter: string) => `sha256:${letter.repeat(64)}`;
const turn: AcpTurnStart = {
  runtimeId: 'codex-acp', sessionId: 'session:1', vaultRoot: '/vault',
  userEventId: 'event:1', text: 'Change refund eligibility.', startedAt: '2026-09-14T00:00:00Z',
};
const pending: PendingPermission = {
  request: {
    requestId: 0, sessionId: 'session:1',
    title: 'patch_concept', toolCallId: 'tool:1', toolName: 'mcp__atlas__patch_concept',
    toolKind: 'other', filePath: null, reviewKind: 'ontology-write',
    rawInput: { slug: 'capabilities/refund', expected_mtime: 100, frontmatter: { title: 'Refund policy' }, body: '## Includes\n\n- Refund after capture.\n' },
    options: [{ optionId: 'reject', kind: 'reject_once', name: 'Reject' }, { optionId: 'allow', kind: 'allow_once', name: 'Allow' }],
  },
  origin: {
    sessionGeneration: 4,
    turn: { sessionId: turn.sessionId, vaultRoot: turn.vaultRoot, userEventId: turn.userEventId, text: turn.text },
    task: { outcome: turn.text, nonGoals: null, structure: 'unstructured' },
    taskBaseline: null,
  },
  resolve: vi.fn(),
};
const complete: TaskReviewHostInput = {
  pending, vaultId: '/vault',
  request: { outcome: turn.text, nonGoals: ['Do not change capture.'] },
  expectedBefore: { mtime: 100, contentDigest: digest('a'), sourceRevision: 'source:before', meaningRevision: 'meaning:before' },
  trustedBefore: {
    trust: 'vault_read', vaultId: '/vault', target: 'capabilities/refund', mtime: 100,
    contentDigest: digest('a'), sourceRevision: 'source:before', meaningRevision: 'meaning:before',
    completeRead: true, fields: { condition: { present: true, value: 'Refund after settlement.' } },
  },
  currentBasis: { contentDigest: digest('b'), sourceRevision: 'source:after-task', meaningRevision: 'meaning:before' },
};

describe('task review host adapter', () => {
  it('reports the exact facts the current host cannot supply instead of fabricating a baseline', async () => {
    const result = await adaptTaskReviewHost({
      ...complete,
      request: null,
      expectedBefore: null,
      trustedBefore: null,
      currentBasis: null,
    });
    expect(result).toEqual({ status: 'unavailable', gaps: [
      'historical_basis_unavailable',
      'trusted_before_unavailable',
      'current_basis_unavailable',
    ], observedTask: { outcome: turn.text, nonGoals: null } });
  });

  it('keeps unstructured non-goals unknown while allowing exact proposal inspection', async () => {
    const result = await adaptTaskReviewHost({ ...complete, request: null });
    expect(result).toMatchObject({
      status: 'prepared_unverified', request: { outcome: turn.text, nonGoals: null },
      identity: { requestId: 0 },
    });
  });

  it('captures display metadata and trusted inputs before proposal hashing awaits', async () => {
    const mutable = {
      ...complete,
      request: { outcome: 'Original outcome', nonGoals: ['Original non-goal'] },
      expectedBefore: { ...complete.expectedBefore! },
      trustedBefore: { ...complete.trustedBefore!, fields: structuredClone(complete.trustedBefore!.fields) },
      currentBasis: { ...complete.currentBasis! },
      pending: {
        ...pending,
        request: { ...pending.request, rawInput: structuredClone(pending.request.rawInput), options: structuredClone(pending.request.options) },
        origin: structuredClone(pending.origin),
      },
    } satisfies TaskReviewHostInput;
    const pendingResult = adaptTaskReviewHost(mutable);
    mutable.request.outcome = 'Mutated outcome';
    mutable.expectedBefore.contentDigest = digest('c');
    mutable.trustedBefore.fields.condition.value = 'Mutated before';
    mutable.currentBasis.sourceRevision = 'source:mutated';
    mutable.pending.request.rawInput.expected_mtime = 999;
    const result = await pendingResult;
    if (result.status !== 'prepared_unverified') throw new Error('expected prepared adapter result');
    expect(result.request).toEqual({ outcome: 'Original outcome', nonGoals: ['Original non-goal'] });
    expect(result.expectedBefore.contentDigest).toBe(digest('a'));
    expect(result.trustedBefore.fields.condition.value).toBe('Refund after settlement.');
    expect(result.proposal.sourceRevision).toBe('source:after-task');
    expect(result.proposal.rawInput.expected_mtime).toBe(100);
    expect(Object.isFrozen(result.expectedBefore)).toBe(true);
    expect(Object.isFrozen(result.trustedBefore.fields)).toBe(true);
  });

  it('derives identity from the originating turn and exact permission request when every basis exists', async () => {
    const result = await adaptTaskReviewHost(complete);
    expect(result).toMatchObject({
      status: 'prepared_unverified',
      identity: { vaultId: '/vault', sessionGeneration: 4, userEventId: 'event:1', requestId: 0, toolCallId: 'tool:1' },
      request: complete.request,
      target: 'capabilities/refund',
    });
    if (result.status !== 'prepared_unverified') throw new Error('expected prepared adapter result');
    expect(result.proposal.rawInput).toEqual(pending.request.rawInput);
    expect(result.proposal.rawInput).not.toBe(pending.request.rawInput);
    expect(result.trustedBefore.fields.condition.value).toBe('Refund after settlement.');
  });

  it('refuses vault, expected-mtime, batch-target, and missing-tool identity mismatches', async () => {
    expect(await adaptTaskReviewHost({ ...complete, vaultId: '/other' })).toMatchObject({ status: 'unavailable', gaps: ['vault_mismatch'] });
    expect(await adaptTaskReviewHost({ ...complete, expectedBefore: { ...complete.expectedBefore!, mtime: 99 } })).toMatchObject({ status: 'unavailable', gaps: ['guard_mismatch'] });
    expect(await adaptTaskReviewHost({ ...complete, pending: { ...pending, request: { ...pending.request, rawInput: { concepts: [] } } } })).toMatchObject({ status: 'unavailable', gaps: ['target_unavailable'] });
    expect(await adaptTaskReviewHost({ ...complete, pending: { ...pending, request: { ...pending.request, toolCallId: null } } })).toMatchObject({ status: 'unavailable', gaps: ['tool_call_id_unavailable'] });
  });
});
