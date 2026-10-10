import { useCallback, useEffect, useState } from "react";
import { useVaultSessionIdentityScope } from "@/entities/vault-session";
import {
  type LibraryWorkActivity,
  type LibraryWorkEvent,
  EMPTY_LIBRARY_WORK_ACTIVITY,
  beginLibraryWork,
  appendLibraryWorkReceipt,
  clearLibraryWork,
  completeLibraryWork,
  completedAcpReadEvent,
  libraryWorkErrorEvent,
  libraryWorkEventFromAcpSnapshot,
  libraryWorkEventFromLocalSnapshot,
  localCompileWaitingEvent,
  successfulLocalWriteEvents,
} from "@/features/library";
import type { AcpEvent, AcpTurnActivity, AcpTurnToolActivity } from "@/features/acp-session";
import { useObservedWikiWork } from "../../lib/use-observed-wiki-work";
import { useLibraryAgent } from "../../lib/use-library-agent";

export function useLibraryWorkActivity({
  workVaultScope, nativeVaultRootPath, wikiRevisionStamp, agent,
}: {
  workVaultScope: ReturnType<typeof useVaultSessionIdentityScope>;
  nativeVaultRootPath: string | null;
  wikiRevisionStamp: Map<string, number>;
  agent: ReturnType<typeof useLibraryAgent>;
}) {
  const [agentActivity, setAgentActivity] = useState<AcpTurnActivity | null>(null);
  const [libraryWorkActivity, setLibraryWorkActivity] = useState<LibraryWorkActivity>(
    EMPTY_LIBRARY_WORK_ACTIVITY,
  );
  const scheduleLibraryWork = useCallback(
    (update: (current: LibraryWorkActivity) => LibraryWorkActivity) => {
      queueMicrotask(() => setLibraryWorkActivity(update));
    },
    [],
  );
  const handleAcpToolActivityChange = useCallback(
    (snapshot: AcpTurnToolActivity | null) => {
      const event = snapshot
        ? libraryWorkEventFromAcpSnapshot(snapshot, nativeVaultRootPath, Date.now())
        : null;
      setLibraryWorkActivity((current) =>
        event ? beginLibraryWork(current, event) : clearLibraryWork(current),
      );
    },
    [nativeVaultRootPath],
  );
  const localToolActivity = agent.localCompile.toolActivity;
  const localWorkInScope = agent.localCompile.originVaultScope === workVaultScope;
  const localReviewVisible = agent.route === "local" && localWorkInScope && agent.localCompile.status !== "idle";
  const localReviewBusy = agent.localCompile.status === "running" || agent.localCompile.status === "applying";
  const handleTerminalToolObservation = useCallback((event: Extract<AcpEvent, { kind: "tool" }>) => {
    const receipt = completedAcpReadEvent(event, nativeVaultRootPath, Date.now());
    if (receipt) setLibraryWorkActivity((current) => completeLibraryWork(current, receipt));
  }, [nativeVaultRootPath]);
  const resetObservedWork = useCallback(() => {
    scheduleLibraryWork(() => EMPTY_LIBRARY_WORK_ACTIVITY);
  }, [scheduleLibraryWork]);
  const receiveObservedWork = useCallback((receipts: readonly LibraryWorkEvent[]) => {
    scheduleLibraryWork((current) => receipts.reduce(appendLibraryWorkReceipt, current));
  }, [scheduleLibraryWork]);
  useObservedWikiWork(workVaultScope, wikiRevisionStamp, resetObservedWork, receiveObservedWork);
  useEffect(() => {
    if (agent.route !== "local" || !localWorkInScope || !localToolActivity) return;
    const event = libraryWorkEventFromLocalSnapshot(
      localToolActivity,
      nativeVaultRootPath,
      Date.now(),
    );
    if (!event) return;
    scheduleLibraryWork((current) =>
      event.phase === "active"
        ? beginLibraryWork(current, event)
        : completeLibraryWork(current, event),
    );
  }, [agent.route, localWorkInScope, localToolActivity, nativeVaultRootPath, scheduleLibraryWork]);
  useEffect(() => {
    if (agent.route !== "local" || !localWorkInScope || agent.localCompile.status !== "waiting") return;
    const turnId = agent.localCompile.turn?.id;
    if (!turnId) return;
    const proposal = agent.localCompile.card?.proposal;
    const event = localCompileWaitingEvent(turnId, Date.now(), Boolean(proposal),
      proposal?.changes.flatMap((change) => change.files.map((file) => file.path)));
    scheduleLibraryWork((current) =>
      event ? beginLibraryWork(current, event) : clearLibraryWork(current),
    );
  }, [agent.localCompile.status, agent.localCompile.card?.proposal, agent.localCompile.turn?.id, agent.route, localWorkInScope, scheduleLibraryWork]);
  useEffect(() => {
    if (agent.route !== "local" || !localWorkInScope) return;
    const turnId = agent.localCompile.turn?.id;
    if (agent.localCompile.status === "written" && turnId) {
      scheduleLibraryWork((current) =>
        successfulLocalWriteEvents(agent.localCompile.writtenPaths, turnId, Date.now()).reduce(
          completeLibraryWork,
          clearLibraryWork(current),
        ),
      );
      return;
    }
    if (agent.localCompile.status === "failed" && turnId) {
      scheduleLibraryWork((current) =>
        completeLibraryWork(
          clearLibraryWork(current),
          libraryWorkErrorEvent(`local:${turnId}:failure`, Date.now()),
        ),
      );
      return;
    }
    if (agent.localCompile.status === "idle") {
      scheduleLibraryWork(clearLibraryWork);
      return;
    }
    if (agent.localCompile.status === "running" || agent.localCompile.status === "applying") {
      scheduleLibraryWork(clearLibraryWork);
    }
  }, [
    agent.localCompile.status,
    agent.localCompile.turn?.id,
    agent.localCompile.writtenPaths,
    localWorkInScope,
    agent.route,
    scheduleLibraryWork,
  ]);

  return {
    agentActivity, setAgentActivity, libraryWorkActivity, setLibraryWorkActivity,
    scheduleLibraryWork, handleAcpToolActivityChange, localToolActivity, localWorkInScope,
    localReviewVisible, localReviewBusy, handleTerminalToolObservation, resetObservedWork,
    receiveObservedWork,
  };
}
