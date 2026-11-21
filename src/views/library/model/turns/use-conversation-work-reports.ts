import { useCallback } from "react";

import { completedAcpReadEvent } from "@/features/library";
import type { AcpEvent } from "@/features/acp-session";
import { workRuns, type TurnWorkReport, type WorkRunActivity } from "@/features/work-run";

import { checkOwner, folderRelativeFile, folderRelativePage } from "./wiki-check-outcome";

/**
 * What the docked conversation reports to the app session's runs. Each conversation reports only to
 * the run it owns, so a newly seated agent cannot touch another agent's check.
 */
export function useConversationWorkReports({ nativeVaultRootPath, runtimeId, onTerminalToolObservation }: {
  nativeVaultRootPath: string | null;
  runtimeId: string;
  onTerminalToolObservation: (event: Extract<AcpEvent, { kind: "tool" }>) => void;
}) {
  const conversationOwner = checkOwner(nativeVaultRootPath, runtimeId);
  const observeCheckWork = useCallback((work: (WorkRunActivity & TurnWorkReport) | null) => {
    const turnId = workRuns.turnOwnedBy(conversationOwner);
    if (turnId !== null) {
      const target = work?.target && nativeVaultRootPath ? folderRelativeFile(work.target, nativeVaultRootPath) : work?.target ?? null;
      workRuns.observeTurnWork(turnId, work && { ...work, target }, Date.now());
    }
    const runId = workRuns.runOwnedBy(conversationOwner);
    if (!work || runId === null) return;
    const page = work.target ? folderRelativePage(work.target, nativeVaultRootPath) : null;
    workRuns.observeActivity(runId, { ...work, target: page });
  }, [conversationOwner, nativeVaultRootPath]);
  const observeTerminalTool = useCallback((event: Extract<AcpEvent, { kind: "tool" }>) => {
    onTerminalToolObservation(event);
    const turnId = workRuns.turnOwnedBy(conversationOwner);
    if (turnId !== null && nativeVaultRootPath) workRuns.observeTurnTool(turnId, event, nativeVaultRootPath);
    const runId = workRuns.runOwnedBy(conversationOwner);
    const read = runId === null ? null : completedAcpReadEvent(event, nativeVaultRootPath, Date.now());
    if (runId !== null && read?.target) workRuns.observeRead(runId, read.target.ref);
  }, [conversationOwner, nativeVaultRootPath, onTerminalToolObservation]);
  const reportCheckStop = useCallback((stop: (() => void) | null) => {
    const turnId = workRuns.turnOwnedBy(conversationOwner);
    if (turnId !== null) workRuns.setTurnStop(turnId, stop);
    const runId = workRuns.runOwnedBy(conversationOwner);
    if (runId !== null) workRuns.setStop(runId, stop);
  }, [conversationOwner]);
  return { conversationOwner, observeCheckWork, observeTerminalTool, reportCheckStop };
}
