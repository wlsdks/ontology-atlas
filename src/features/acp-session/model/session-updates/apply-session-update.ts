import type { Dispatch, RefObject, SetStateAction } from 'react';

import type { UsageReport } from '@/entities/agent-usage';
import type { AcpWorkReceipt, AcpWorkResult } from '@/shared/lib/meaning-transition/acp-work-receipt';

import type { AcpPermissionRequest } from '../permissions/permission-request';
import { applyCurrentMode, type AcpSessionChoices } from '../session-choices/acp-session-choices';
import { nextEventId, type AcpEvent } from '../conversation/acp-events';
import { readReportedPlan, type ReportedPlan } from '../investigation/reported-plan';
import { modeKeepsGate } from '../session-choices/mode-safety';
import { readSlashCommands, type AcpSlashCommand } from '../session-choices/slash-commands';
import { keepToolOutput } from '../tool-calls/tool-output';
import type { ActiveTurn } from '../turns/acp-turn';
import { terminalMatchesWriter } from '../work-receipts/work-receipt';
import { readUsageUpdate } from './usage-update';

const TERMINAL_TOOL_STATES = new Set(['completed', 'failed', 'cancelled']);

export interface SessionUpdateTargets {
  sessionIdRef: RefObject<string | null>;
  activeTurnRef: RefObject<ActiveTurn | null>;
  onToolSettledRef: RefObject<((toolCallId: string, status: string) => void) | undefined>;
  approvedOntologyWriteRef: RefObject<AcpPermissionRequest | null>;
  approvedReceiptsRef: RefObject<Map<string, { toolCallId: string | null; receipt: AcpWorkReceipt }>>;
  setLastTurnUpdateAt: Dispatch<SetStateAction<number | null>>;
  setReportedPlan: Dispatch<SetStateAction<ReportedPlan | null>>;
  setSlashCommands: Dispatch<SetStateAction<AcpSlashCommand[]>>;
  setChoices: (value: AcpSessionChoices | ((current: AcpSessionChoices) => AcpSessionChoices)) => void;
  noteModeMoved: (modeId: string, reason: string) => void;
  push: (event: AcpEvent) => void;
  updateEvents: (update: (previous: AcpEvent[]) => AcpEvent[]) => void;
  emitWorkReceipt: (receipt: AcpWorkReceipt) => void;
  setApprovedOntologyWriteTracked: (request: AcpPermissionRequest | null) => void;
  reportUsage: (report: UsageReport) => void;
}

/** Changes only what the update reports; a tool row appears only after the agent really called that tool, and an allowed ontology write's receipt closes on its terminal update. */
export function applySessionUpdate(
  update: Record<string, unknown>,
  updateContext: { sessionId: string | null },
  targets: SessionUpdateTargets,
): void {
  const {
    sessionIdRef,
    activeTurnRef,
    onToolSettledRef,
    approvedOntologyWriteRef,
    approvedReceiptsRef,
    setLastTurnUpdateAt,
    setReportedPlan,
    setSlashCommands,
    setChoices,
    noteModeMoved,
    push,
    updateEvents,
    emitWorkReceipt,
    setApprovedOntologyWriteTracked,
    reportUsage,
  } = targets;
  if (!updateContext.sessionId || updateContext.sessionId !== sessionIdRef.current) return;
  setLastTurnUpdateAt(Date.now());
  const kind = typeof update.sessionUpdate === 'string' ? update.sessionUpdate : '';
  const content = update.content as { text?: unknown } | undefined;
  const text = typeof content?.text === 'string' ? content.text : '';
  if(kind==='plan') {
    if(activeTurnRef.current)setReportedPlan(previous=>readReportedPlan(previous,update.entries));
    return;
  }

  if (kind === 'usage_update') {
    const usage = readUsageUpdate(update, updateContext.sessionId);
    if (usage) reportUsage(usage);
    return;
  }
  if (kind === 'available_commands_update') {
    setSlashCommands(readSlashCommands(update));
    return;
  }
  if (kind === 'current_mode_update') {
    // The adapter moves the session on its own and announces it only here; a gate-removing mode raises the `gate-off` notice.
    const modeId = typeof update.currentModeId === 'string' ? update.currentModeId.trim() : '';
    if (!modeId) return;
    setChoices((previous) => applyCurrentMode(previous, modeId));
    if (!modeKeepsGate(modeId)) noteModeMoved(modeId, `mode-clamped:${modeId}`);
    return;
  }
  if (kind === 'agent_message_chunk' && text) {
    push({ kind: 'agent', id: nextEventId(), text });
    return;
  }
  if (kind === 'agent_thought_chunk' && text) {
    push({ kind: 'thought', id: nextEventId(), text });
    return;
  }
  const keptOutput = (rawOutput: unknown) =>
    keepToolOutput(rawOutput, { evidence: Boolean(activeTurnRef.current?.observer) });
  if (kind === 'tool_call') {
    // A call that arrives finished carries its answer here, not in a later update.
    const kept = keptOutput(update.rawOutput);
    push({
      kind: 'tool',
      id: typeof update.toolCallId === 'string' ? update.toolCallId : nextEventId(),
      title: typeof update.title === 'string' ? update.title : '',
      toolKind: typeof update.kind === 'string' ? update.kind : 'other',
      status: typeof update.status === 'string' ? update.status : 'pending',
      rawInput: update.rawInput,
      rawOutput: kept.rawOutput,
      ...(kept.evidence ? { outputEvidence: kept.evidence } : {}),
    });
    if (typeof update.toolCallId === 'string' && typeof update.status === 'string' && TERMINAL_TOOL_STATES.has(update.status)) {
      onToolSettledRef.current?.(update.toolCallId, update.status);
    }
    return;
  }
  if (kind === 'tool_call_update') {
    const id = typeof update.toolCallId === 'string' ? update.toolCallId : null;
    const nextStatus = typeof update.status === 'string' ? update.status : null;
    if (!id) return;
    const nextTitle = typeof update.title === 'string' ? update.title : null;
    const nextToolKind = typeof update.kind === 'string' ? update.kind : null;
    const hasRawInput = update.rawInput !== undefined;
    const hasRawOutput = update.rawOutput !== undefined;
    const kept = hasRawOutput ? keptOutput(update.rawOutput) : null;
    // The adapter sends a pending row, then its input in a status-less update: merge every
    // field an update carries, not only its status.
    updateEvents((previous) =>
      previous.map((event) => {
        if (event.kind !== 'tool' || event.id !== id) return event;
        return {
          ...event,
          ...(nextStatus ? { status: nextStatus } : {}),
          ...(nextTitle ? { title: nextTitle } : {}),
          ...(nextToolKind ? { toolKind: nextToolKind } : {}),
          ...(hasRawInput ? { rawInput: update.rawInput } : {}),
          ...(kept ? { rawOutput: kept.rawOutput, outputEvidence: kept.evidence ?? undefined } : {}),
        };
      }),
    );
    if (!nextStatus || !TERMINAL_TOOL_STATES.has(nextStatus)) return;
    onToolSettledRef.current?.(id, nextStatus);
    const approvedReceipt = [...approvedReceiptsRef.current.values()]
      .find((entry) => entry.toolCallId === id) ?? null;
    const trackedWrite = approvedOntologyWriteRef.current?.toolCallId === id;
    if (approvedReceipt || trackedWrite) {
      const receiptMatches = approvedReceipt?.toolCallId === id;
      const originMatches = !approvedReceipt?.receipt.origin
        || approvedReceipt.receipt.origin.sessionId === updateContext.sessionId;
      const writerMatches = !approvedReceipt?.receipt.writerCorrelation
        || terminalMatchesWriter(update, approvedReceipt.receipt);
      if (approvedReceipt && receiptMatches && originMatches && writerMatches) {
        const result: AcpWorkResult =
          nextStatus === 'completed'
            ? 'completed'
            : nextStatus === 'failed'
              ? 'failed'
              : 'cancelled';
        emitWorkReceipt({
          ...approvedReceipt.receipt,
          updatedAt: new Date().toISOString(),
          result,
          ...(approvedReceipt.receipt.writerCorrelation ? {
            writerCorrelation: { ...approvedReceipt.receipt.writerCorrelation, terminal: result as 'completed' | 'failed' | 'cancelled' },
          } : {}),
        });
        approvedReceiptsRef.current.delete(approvedReceipt.receipt.id);
      }
      // Legacy receipts have no explicit origin or correlation; the same live session and tool id still
      // close the UI state, but stay unverified.
      if (trackedWrite && (!approvedReceipt || (receiptMatches && originMatches && writerMatches))) {
        setApprovedOntologyWriteTracked(null);
      }
    }
  }
}
