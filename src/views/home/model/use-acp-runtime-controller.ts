import { isGuardedRuntime } from "@/features/acp-session";
import { detectAcpRuntimes, isAcpBridgeAvailable } from "@/shared/lib/tauri-acp";
import { useChatWidth } from "@/widgets/acp-chat-panel";
import { useCallback, useEffect, useRef, useState } from "react";

const ACP_SESSION_START_AFTER_REFLOW_MS = 240;

export function useAcpRuntimeController(setAcpChatOpen: (open: boolean) => void) {
  const [acpRuntimes, setAcpRuntimes] = useState<
    Array<{ id: string; label: string; icon: string | null; brandInk: string | null }>
  >([]);
  const [acpRuntimeId, setAcpRuntimeId] = useState<string | null>(null);
  const [acpPresentationVisible, setAcpPresentationVisible] = useState(false);
  const [pendingAgentChatRuntimeId, setPendingAgentChatRuntimeId] = useState<
    string | null | undefined
  >(undefined);
  const requestedAcpRuntimeRef = useRef<string | null>(null);
  const [agentOpeningRequest, setAgentOpeningRequest] = useState<{
    text: string;
    nonce: number;
    scopeKey?: string;
  } | null>(null);
  const pendingAgentChatPromptRef = useRef<string | null>(null);
  const [chatMounted, setChatMounted] = useState(false);
  const acpSessionStartTimerRef = useRef<number | null>(null);
  const cancelAcpSessionStart = useCallback(() => {
    if (acpSessionStartTimerRef.current === null) return;
    window.clearTimeout(acpSessionStartTimerRef.current);
    acpSessionStartTimerRef.current = null;
  }, []);
  const scheduleAcpSessionStart = useCallback(() => {
    cancelAcpSessionStart();
    // Let the dock-width reflow and camera spring land before ACP process boot
    // competes for WebKit's main thread; otherwise the map stalls mid-move.
    acpSessionStartTimerRef.current = window.setTimeout(() => {
      acpSessionStartTimerRef.current = null;
      setAcpChatOpen(true);
    }, ACP_SESSION_START_AFTER_REFLOW_MS);
  }, [cancelAcpSessionStart, setAcpChatOpen]);
  useEffect(() => cancelAcpSessionStart, [cancelAcpSessionStart]);
  const chatWidth = useChatWidth();

  useEffect(() => {
    if (!isAcpBridgeAvailable()) return;
    let cancelled = false;
    const apply = (list: Awaited<ReturnType<typeof detectAcpRuntimes>>) => {
      if (cancelled) return;
      const usable = (list ?? [])
        .filter((runtime) =>
          runtime.state === "ready" &&
          runtime.verified &&
          isGuardedRuntime(runtime.id, runtime.isolated)
        )
        .map((runtime) => ({
          id: runtime.id,
          label: runtime.label,
          icon: runtime.icon,
          brandInk: runtime.brandInk,
        }));
      setAcpRuntimes(usable);
      setAcpRuntimeId((current) => {
        const preferred = requestedAcpRuntimeRef.current ?? current;
        return preferred && usable.some((runtime) => runtime.id === preferred)
          ? preferred
          : (usable[0]?.id ?? null);
      });
    };
    void detectAcpRuntimes().then((fast) => {
      apply(fast);
      void detectAcpRuntimes({ probeLogin: true }).then(apply);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const acpRuntime = acpRuntimes.find((runtime) => runtime.id === acpRuntimeId) ?? null;

  return {
    acpRuntimes,
    acpRuntimeId,
    setAcpRuntimeId,
    acpPresentationVisible,
    setAcpPresentationVisible,
    pendingAgentChatRuntimeId,
    setPendingAgentChatRuntimeId,
    requestedAcpRuntimeRef,
    agentOpeningRequest,
    setAgentOpeningRequest,
    pendingAgentChatPromptRef,
    chatMounted,
    setChatMounted,
    cancelAcpSessionStart,
    scheduleAcpSessionStart,
    chatWidth,
    acpRuntime,
  };
}
