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
 * The agent a project page can hand its overview to. The runtime, vault MCP server and
 * connector wiring is `useVaultAgentRuntime`, read the same way on every screen that docks a
 * conversation; what is this page's own is the dock's open state and the one request it seats:
 * the brief instructions, sent as the first turn once the session is ready.
 *
 * `route` says what the ask button can promise: `agent` opens the dock and seats the request;
 * anything else leaves the copy-to-clipboard path, which works in the browser too.
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
