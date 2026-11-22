import { buildOntologyChangeSet } from '@/entities/knowledge-graph';
import {
  ACP_STANDING_APPROVER,
  type AcpWorkDecision,
  type AcpWorkReceipt,
  type AcpWorkResult,
} from '@/shared/lib/meaning-transition/acp-work-receipt';

import type { AcpPermissionRequest } from '../permissions/permission-request';
import type { PendingPermission } from '../permissions/ask-permission';

const RECEIPT_REQUEST_LIMIT = 160;

function receiptRequestSummary(value: string | null): string {
  const oneLine = (value ?? '').replace(/\s+/g, ' ').trim();
  return oneLine ? oneLine.slice(0, RECEIPT_REQUEST_LIMIT) : 'Ontology write request';
}

export function workReceipt({
  request,
  sessionId,
  runtimeId,
  userRequest,
  origin,
  decision,
  result,
  at,
  approvedByStandingChoice,
}: {
  request: AcpPermissionRequest;
  sessionId: string | null;
  runtimeId: string;
  userRequest: string | null;
  origin: PendingPermission['origin'];
  decision: AcpWorkDecision;
  result: AcpWorkResult;
  at: string;
  approvedByStandingChoice: boolean;
}): AcpWorkReceipt {
  const changeSet = buildOntologyChangeSet(request.toolName ?? 'ontology-write', request.rawInput);
  const toolCallId = request.toolCallId ?? `${changeSet.toolName}:${at}`;
  const explicitOrigin = origin?.turn
    && origin.turn.vaultRoot
    && request.sessionId === origin.turn.sessionId
    && request.requestId !== undefined && request.requestId !== null
    && request.toolCallId
      ? {
          vaultId: origin.turn.vaultRoot,
          sessionGeneration: origin.sessionGeneration,
          sessionId: origin.turn.sessionId,
          userEventId: origin.turn.userEventId,
          requestId: request.requestId,
          toolCallId: request.toolCallId,
        }
      : null;
  return {
    v: 1,
    id: `${sessionId ?? 'session'}:${toolCallId}`,
    at,
    updatedAt: at,
    agent: runtimeId,
    request: receiptRequestSummary(userRequest),
    tool: changeSet.toolName,
    decision,
    result,
    items: changeSet.items.map((item) => ({
      target: item.target,
      operation: changeSet.operation,
      relation: item.relation
        ? { from: item.relation.from, type: item.relation.type, to: item.relation.to }
        : null,
      fields: item.fields.map((field) => field.key),
    })),
    ...(explicitOrigin ? { origin: explicitOrigin } : {}),
    ...(explicitOrigin && request.writerCorrelation ? {
      writerCorrelation: { ...request.writerCorrelation, terminal: decision === 'allowed' ? 'pending' as const : 'not-observed' as const },
    } : {}),
    ...(approvedByStandingChoice ? { approvedBy: ACP_STANDING_APPROVER } : {}),
  };
}

export function terminalMatchesWriter(update: Record<string, unknown>, receipt: AcpWorkReceipt): boolean {
  const meta = update._meta && typeof update._meta === 'object' && !Array.isArray(update._meta)
    ? update._meta as Record<string, unknown> : null;
  if (meta?.is_mcp_tool_call !== true) return true;
  const raw = update.rawInput && typeof update.rawInput === 'object' && !Array.isArray(update.rawInput)
    ? update.rawInput as Record<string, unknown> : null;
  const correlation = receipt.writerCorrelation;
  return Boolean(correlation && raw?.server === correlation.server && raw.tool === correlation.tool);
}
