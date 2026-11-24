import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { useCodeReaderRoom } from "../inspector/use-code-reader-room";
import { type ConversationDoors, useConversationStow } from "./use-conversation-stow";

function useDockWithReader(initial: ConversationDoors) {
  const room = useCodeReaderRoom();
  const [doors, setDoors] = useState(initial);
  const [mounted, setChatMounted] = useState(false);
  const door = (name: keyof ConversationDoors) => (open: boolean) => setDoors((current) => ({ ...current, [name]: open }));
  const agentDockOpen = doors.acpDockFrameOpen || doors.meaningWorkbenchOpen || doors.vaultAgentOpen || doors.acpChatOpen;
  const { returnedOnItsOwn } = useConversationStow({
    room,
    agentDockOpen,
    doors,
    setAcpDockFrameOpen: door("acpDockFrameOpen"),
    setMeaningWorkbenchOpen: door("meaningWorkbenchOpen"),
    setVaultAgentOpen: door("vaultAgentOpen"),
    setAcpChatOpen: door("acpChatOpen"),
    setChatMounted,
  });
  return { room, doors, openConversation: () => setDoors((current) => ({ ...current, acpDockFrameOpen: true, acpChatOpen: true })), mounted, returnedOnItsOwn };
}

const conversationOpen: ConversationDoors = { acpDockFrameOpen: true, meaningWorkbenchOpen: false, vaultAgentOpen: false, acpChatOpen: true };
const allClosed: ConversationDoors = { acpDockFrameOpen: false, meaningWorkbenchOpen: false, vaultAgentOpen: false, acpChatOpen: false };

describe("useConversationStow", () => {
  it("puts the conversation away while the reader holds the room and brings it back as it was, without taking focus", () => {
    const { result } = renderHook(() => useDockWithReader(conversationOpen));
    act(() => result.current.room.hold());
    expect(result.current.doors).toEqual(allClosed);
    act(() => result.current.room.release());
    expect(result.current.doors).toEqual(conversationOpen);
    expect(result.current.mounted).toBe(true);
    expect(result.current.returnedOnItsOwn).toBe(true);
  });

  it("gives the room back when the person opens the conversation meanwhile, and restores nothing after", () => {
    const { result } = renderHook(() => useDockWithReader(conversationOpen));
    act(() => result.current.room.hold());
    act(() => result.current.openConversation());
    expect(result.current.room.state).toBe("withdrawn");
    act(() => result.current.room.release());
    expect(result.current.doors).toEqual({ ...allClosed, acpDockFrameOpen: true, acpChatOpen: true });
    expect(result.current.returnedOnItsOwn).toBe(false);
  });
});
