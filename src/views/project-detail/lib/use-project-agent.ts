"use client";

import { useCallback, useState } from "react";

import { useVaultAgentRuntime, type VaultAgentRuntime } from "@/widgets/acp-chat-panel";

export type ProjectAgentRuntime = VaultAgentRuntime;

export interface ProjectAgentOpeningRequest {
  kind: "brief";
  text: string;
  nonce: number;
}

/**
 * The dock's open state and the brief request sent as the first turn once the session is ready;
 * runtime wiring is the shared `useVaultAgentRuntime`. Any `route` but `agent` falls back to copying.
 */
export function useProjectAgent(vaultRoot: string | null) {
  const { route, runtime, runtimes, runtimeId, setRuntimeId, mcpServers } = useVaultAgentRuntime(vaultRoot);
  const [open, setOpen] = useState(false);
  const [openingRequest, setOpeningRequest] = useState<ProjectAgentOpeningRequest | null>(null);

  const start = useCallback((text: string) => {
    setOpeningRequest((current) => ({ kind: "brief", text, nonce: (current?.nonce ?? 0) + 1 }));
    setOpen(true);
  }, []);

  return { route, runtime, runtimes, runtimeId, setRuntimeId, mcpServers, open, setOpen, openingRequest, start };
}
