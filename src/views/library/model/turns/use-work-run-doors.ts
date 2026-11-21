import { useEffect, useRef } from "react";

import { workRuns, type useActiveTurn } from "@/features/work-run";

import type { LibrarySelection } from "../library-selection";

/**
 * The doors the app session's work cards open into this folder's Library. Opening the Library reads
 * every finished turn of this folder and brings a turn still running back on screen; a card's door
 * opens once this folder's Library is showing: a turn's conversation (the asking agent chosen again)
 * or the page it wrote, or the check results, or the conversation.
 */
export function useWorkRunDoors({ hasFolder, workVaultScope, writingTurn, choose, setAgentOpen, setAgentRuntime }: {
  hasFolder: boolean;
  workVaultScope: string;
  /** This folder's running turn when the Library opened. */
  writingTurn: ReturnType<typeof useActiveTurn>;
  choose: (next: LibrarySelection) => void;
  setAgentOpen: (open: boolean) => void;
  setAgentRuntime: (runtimeId: string) => void;
}) {
  const returningTurn = useRef(writingTurn);
  useEffect(() => {
    if (!hasFolder) return;
    workRuns.seeTurns(workVaultScope);
    const turn = returningTurn.current;
    if (!turn || turn.folder !== workVaultScope) return;
    setAgentRuntime(turn.runtimeId);
    setAgentOpen(true);
  }, [hasFolder, setAgentOpen, setAgentRuntime, workVaultScope]);
  useEffect(() => {
    if (!hasFolder) return;
    const takeTurnDoor = () => {
      const { turnDoor, runs } = workRuns.read();
      const entry = turnDoor ? runs.get(`turn:${turnDoor.turnId}`) : null;
      if (!turnDoor || entry?.kind !== "turn" || entry.run.folder !== workVaultScope) return;
      workRuns.takeTurnDoor(turnDoor.turnId);
      if (turnDoor.kind === "page") {
        choose({ kind: "wiki", slug: turnDoor.page });
        return;
      }
      setAgentRuntime(entry.run.runtimeId);
      setAgentOpen(true);
    };
    queueMicrotask(takeTurnDoor);
    return workRuns.subscribe(takeTurnDoor);
  }, [choose, hasFolder, setAgentOpen, setAgentRuntime, workVaultScope]);
  useEffect(() => {
    if (!hasFolder) return;
    const takeDoor = () => {
      const { door, run } = workRuns.read();
      if (!door || !run || run.folder !== workVaultScope || door.runId !== run.id) return;
      workRuns.takeDoor(door.runId);
      if (door.kind === "results") choose({ kind: "report" });
      else setAgentOpen(true);
    };
    queueMicrotask(takeDoor);
    return workRuns.subscribe(takeDoor);
  }, [choose, hasFolder, setAgentOpen, workVaultScope]);
}
