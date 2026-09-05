"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  connectorAcpServers,
  isGuardedRuntime,
  runtimeOwnsWriteGate,
  vaultMcpServers,
  vaultSelfReadSlot,
} from "@/features/acp-session";
import { useVaultConnectors } from "@/features/mcp-connectors";
import { useAgentServer, useLocalVault } from "@/entities/vault-session";
import { detectAcpRuntimes, isAcpBridgeAvailable, type AcpRuntimeStatus } from "@/shared/lib/tauri-acp";

import type { DocsAgentOpeningRequest, DocsAgentRuntime } from "../ui/parts/DocsAgentDock";

/**
 * Whether Docs can start an in-app agent turn, and everything needed to start one.
 *
 * The same wiring Analysis and Architecture already carry, and deliberately not a fourth
 * spelling of it: which runtimes are usable, which MCP servers the session gets, and
 * whether the folder's own server is up. Compile calls `start`; everything else here is
 * the honest answer to "can it".
 *
 * `route` is `agent` only when a verified runtime with an app-owned permission boundary
 * is ready **and** the folder has an absolute path **and** its MCP server can launch. Any
 * other combination returns `unavailable`, and the Compile button is simply not drawn —
 * a button that cannot act is worse than an absent one, because a person spends a click
 * finding that out.
 */

const subscribeDesktopRuntime = () => () => undefined;
const readServerDesktopRuntime = () => false;

type DocsAgentRoute = "checking" | "agent" | "unavailable";

function selectDocsAgentRuntimes(
  runtimes: readonly AcpRuntimeStatus[] | null | undefined,
): DocsAgentRuntime[] {
  return (runtimes ?? [])
    .filter(
      (runtime) =>
        runtime.state === "ready" && runtime.verified && isGuardedRuntime(runtime.id, runtime.isolated),
    )
    .map(({ id, label }) => ({ id, label }));
}

export function useDocsAgent(vaultRoot: string | null) {
  const localVault = useLocalVault();
  const agentServer = useAgentServer();
  const bridgeAvailable = useSyncExternalStore(
    subscribeDesktopRuntime,
    isAcpBridgeAvailable,
    readServerDesktopRuntime,
  );
  const [runtimes, setRuntimes] = useState<DocsAgentRuntime[]>([]);
  const [runtimeId, setRuntimeId] = useState<string | null>(null);
  const [runtimeCheckComplete, setRuntimeCheckComplete] = useState(false);
  const [open, setOpen] = useState(false);
  const [openingRequest, setOpeningRequest] = useState<DocsAgentOpeningRequest | null>(null);

  useEffect(() => {
    // With no bridge there is nothing to detect, and `runtimesChecked` below reads that
    // as complete without a state write — a setState here would be a cascading render
    // saying only what `bridgeAvailable` already says.
    if (!bridgeAvailable) return;
    let cancelled = false;
    const apply = (list: Awaited<ReturnType<typeof detectAcpRuntimes>>) => {
      if (cancelled) return;
      const usable = selectDocsAgentRuntimes(list);
      setRuntimes(usable);
      setRuntimeId((current) =>
        current && usable.some((runtime) => runtime.id === current) ? current : (usable[0]?.id ?? null),
      );
    };
    void detectAcpRuntimes()
      .then((fast) => {
        apply(fast);
        return detectAcpRuntimes({ probeLogin: true });
      })
      .then(apply)
      .catch(() => apply(null))
      .finally(() => {
        if (!cancelled) setRuntimeCheckComplete(true);
      });
    return () => {
      cancelled = true;
    };
  }, [bridgeAvailable]);

  const runtime = runtimes.find((candidate) => candidate.id === runtimeId) ?? null;
  /* The same list the map reads, from the same file — one folder, one set of attached tools. */
  const vaultConnectors = useVaultConnectors(localVault.handle);
  const mcpServers = useMemo(() => {
    const registration =
      vaultSelfReadSlot(runtimeId) === "codex-config"
        ? {
            command: localVault.agentConfigStatus?.codexRegisteredCommand ?? null,
            validForCurrentVault: localVault.agentConfigStatus?.codexConfigValid === true,
          }
        : null;
    return [
      ...vaultMcpServers(agentServer.launch, vaultRoot, registration, {
        ownsWriteGate: runtimeOwnsWriteGate(runtimeId),
      }),
      ...connectorAcpServers(vaultConnectors.connectors, runtimeId),
    ];
  }, [
    agentServer.launch,
    localVault.agentConfigStatus?.codexConfigValid,
    localVault.agentConfigStatus?.codexRegisteredCommand,
    runtimeId,
    vaultConnectors.connectors,
    vaultRoot,
  ]);

  const runtimesChecked = !bridgeAvailable || runtimeCheckComplete;
  const serverCheckComplete = agentServer.launch !== null || agentServer.reason !== null;
  const route: DocsAgentRoute = !bridgeAvailable
    ? "unavailable"
    : !runtimesChecked || !serverCheckComplete
      ? "checking"
      : runtime && vaultRoot && agentServer.launch !== null
        ? "agent"
        : "unavailable";

  const start = useCallback((text: string) => {
    setOpeningRequest((current) => ({
      kind: "compile",
      text,
      nonce: (current?.nonce ?? 0) + 1,
    }));
    setOpen(true);
  }, []);

  return {
    route,
    runtime,
    runtimes,
    runtimeId,
    setRuntimeId,
    mcpServers,
    open,
    setOpen,
    openingRequest,
    start,
  };
}
