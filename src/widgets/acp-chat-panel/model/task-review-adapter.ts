import type { PendingPermission } from '@/features/acp-session';
import {
  buildProposalBinding,
  type ComparisonBasis,
  type TaskReviewIdentity,
  type TaskReviewRequest,
  type TrustedBeforeSnapshot,
} from '@/entities/knowledge-graph';

export type TaskReviewHostGap =
  | 'turn_unavailable'
  | 'ontology_request_unavailable'
  | 'vault_identity_unavailable'
  | 'session_generation_unavailable'
  | 'permission_request_id_unavailable'
  | 'tool_call_id_unavailable'
  | 'target_unavailable'
  | 'historical_basis_unavailable'
  | 'trusted_before_unavailable'
  | 'current_basis_unavailable'
  | 'vault_mismatch'
  | 'guard_mismatch';

export interface TaskReviewHostInput {
  pending: PendingPermission | null;
  vaultId: string | null;
  request: TaskReviewRequest | null;
  expectedBefore: ComparisonBasis | null;
  trustedBefore: TrustedBeforeSnapshot | null;
  currentBasis: Pick<ComparisonBasis, 'contentDigest' | 'sourceRevision' | 'meaningRevision'> | null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function targetOf(rawInput: Record<string, unknown>): string | null {
  if (Array.isArray(rawInput.concepts) || Array.isArray(rawInput.relations)) return null;
  return text(rawInput.slug) ?? text(rawInput.from) ?? text(rawInput.projectSlug);
}

function immutableClone<Value>(value: Value): Value {
  const cloned = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (!item || typeof item !== 'object') return;
    for (const child of Object.values(item as Record<string, unknown>)) freeze(child);
    Object.freeze(item);
  };
  freeze(cloned);
  return cloned;
}

export async function adaptTaskReviewHost(input: TaskReviewHostInput): Promise<
  | { status: 'unavailable'; gaps: TaskReviewHostGap[]; observedTask: { outcome: string; nonGoals: null } | null }
  | {
      status: 'prepared_unverified';
      identity: TaskReviewIdentity;
      request: TaskReviewRequest;
      target: string;
      expectedBefore: ComparisonBasis;
      trustedBefore: TrustedBeforeSnapshot;
      proposal: Awaited<ReturnType<typeof buildProposalBinding>>;
    }
> {
  const pendingRequest = input.pending ? immutableClone(input.pending.request) : null;
  const origin = input.pending?.origin ? immutableClone(input.pending.origin) : null;
  const vaultId = input.vaultId;
  const explicitRequest = input.request ? immutableClone(input.request) : null;
  const expectedBefore = input.expectedBefore ? immutableClone(input.expectedBefore) : null;
  const trustedBefore = input.trustedBefore ? immutableClone(input.trustedBefore) : null;
  const currentBasis = input.currentBasis ? immutableClone(input.currentBasis) : null;
  const gaps: TaskReviewHostGap[] = [];
  const turn = origin?.turn ?? null;
  if (!turn) gaps.push('turn_unavailable');
  if (!pendingRequest || pendingRequest.reviewKind !== 'ontology-write') gaps.push('ontology_request_unavailable');
  if (!vaultId) gaps.push('vault_identity_unavailable');
  if (!Number.isInteger(origin?.sessionGeneration) || (origin?.sessionGeneration ?? -1) < 0) gaps.push('session_generation_unavailable');
  const permissionRequestId = pendingRequest?.requestId;
  if (permissionRequestId == null) gaps.push('permission_request_id_unavailable');
  const toolCallId = pendingRequest?.toolCallId ?? null;
  if (!toolCallId) gaps.push('tool_call_id_unavailable');
  const target = pendingRequest ? targetOf(pendingRequest.rawInput) : null;
  if (!target) gaps.push('target_unavailable');
  if (!expectedBefore) gaps.push('historical_basis_unavailable');
  if (!trustedBefore) gaps.push('trusted_before_unavailable');
  if (!currentBasis) gaps.push('current_basis_unavailable');
  if (turn && vaultId && (turn.vaultRoot !== vaultId || pendingRequest?.sessionId !== turn.sessionId)) gaps.push('vault_mismatch');
  const guard = pendingRequest?.rawInput.expected_mtime;
  if (expectedBefore && guard !== undefined && guard !== expectedBefore.mtime) gaps.push('guard_mismatch');
  const observedTask = origin?.task ? immutableClone({ outcome: origin.task.outcome, nonGoals: origin.task.nonGoals }) : null;
  const taskRequest = explicitRequest ?? observedTask;
  if (!taskRequest && !gaps.includes('turn_unavailable')) gaps.push('turn_unavailable');
  if (gaps.length > 0) return { status: 'unavailable', gaps, observedTask };

  const identity: TaskReviewIdentity = {
    vaultId: vaultId!,
    sessionGeneration: origin!.sessionGeneration,
    userEventId: turn!.userEventId,
    requestId: permissionRequestId!,
    toolCallId: toolCallId!,
  };
  const proposal = await buildProposalBinding({
    identity,
    request: taskRequest!,
    sourceRevision: currentBasis!.sourceRevision,
    meaningRevision: currentBasis!.meaningRevision,
    contentDigest: currentBasis!.contentDigest,
    rawInput: pendingRequest!.rawInput,
  });
  return {
    status: 'prepared_unverified', identity: proposal.identity, request: proposal.request, target: target!,
    expectedBefore: expectedBefore!, trustedBefore: trustedBefore!, proposal,
  };
}
