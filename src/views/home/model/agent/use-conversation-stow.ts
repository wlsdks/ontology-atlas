import { useEffect, useRef, useState } from "react";

import { useLatestRef } from "@/shared/lib/use-latest-ref";

import type { CodeReaderRoom } from "../inspector/use-code-reader-room";

/** Which of the dock's doors were open when the conversation was put away. */
export interface ConversationDoors {
  acpDockFrameOpen: boolean;
  meaningWorkbenchOpen: boolean;
  vaultAgentOpen: boolean;
  acpChatOpen: boolean;
}

interface Options {
  room: Pick<CodeReaderRoom, "state" | "withdraw">;
  agentDockOpen: boolean;
  doors: ConversationDoors;
  setAcpDockFrameOpen: (open: boolean) => void;
  setMeaningWorkbenchOpen: (open: boolean) => void;
  setVaultAgentOpen: (open: boolean) => void;
  setAcpChatOpen: (open: boolean) => void;
  setChatMounted: (mounted: boolean) => void;
}

/**
 * Puts the conversation away while the code reader holds its room and brings it back as it was
 * when the reader closes. Only the doors close: the request, draft and an answer still being
 * written stay. Opening the conversation meanwhile takes the room back, and nothing is restored.
 * Returns whether it is put away, so a closed door does not stop its answer, and whether it came
 * back on its own, so it leaves focus where the person is.
 */
export function useConversationStow({
  room,
  agentDockOpen,
  doors,
  setAcpDockFrameOpen,
  setMeaningWorkbenchOpen,
  setVaultAgentOpen,
  setAcpChatOpen,
  setChatMounted,
}: Options): { putAway: boolean; returnedOnItsOwn: boolean } {
  const stowedRef = useRef<ConversationDoors | null>(null);
  const doorsRef = useLatestRef(doors);
  const dockWasOpenRef = useRef(agentDockOpen);
  const [returnedOnItsOwn, setReturnedOnItsOwn] = useState(false);
  const { state, withdraw } = room;

  useEffect(() => {
    if (state === "held") {
      if (stowedRef.current !== null) return;
      stowedRef.current = { ...doorsRef.current };
      setAcpDockFrameOpen(false);
      setMeaningWorkbenchOpen(false);
      setVaultAgentOpen(false);
      setAcpChatOpen(false);
      return;
    }
    const stowed = stowedRef.current;
    stowedRef.current = null;
    if (state !== "none" || stowed === null) return;
    if (!stowed.acpDockFrameOpen && !stowed.meaningWorkbenchOpen && !stowed.vaultAgentOpen && !stowed.acpChatOpen) return;
    setReturnedOnItsOwn(true);
    setChatMounted(true);
    setAcpDockFrameOpen(stowed.acpDockFrameOpen);
    setMeaningWorkbenchOpen(stowed.meaningWorkbenchOpen);
    setVaultAgentOpen(stowed.vaultAgentOpen);
    setAcpChatOpen(stowed.acpChatOpen);
  }, [state, doorsRef, setAcpDockFrameOpen, setMeaningWorkbenchOpen, setVaultAgentOpen, setAcpChatOpen, setChatMounted]);

  useEffect(() => {
    const dockWasOpen = dockWasOpenRef.current;
    dockWasOpenRef.current = agentDockOpen;
    if (dockWasOpen && !agentDockOpen) setReturnedOnItsOwn(false);
    if (!dockWasOpen && agentDockOpen && state === "held" && stowedRef.current !== null) {
      stowedRef.current = null;
      withdraw();
    }
  }, [state, agentDockOpen, withdraw]);

  // While the reader holds the room the doors are closed only to make it; the room is withdrawn
  // the moment the person opens the conversation, so a close then is theirs.
  return { putAway: state === "held", returnedOnItsOwn };
}
