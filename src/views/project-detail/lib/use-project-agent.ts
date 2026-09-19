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

const subscribeDesktopRuntime = () => () => undefined;
const readServerDesktopRuntime = () => false;

export type ProjectAgentRoute = "checking" | "agent" | "unavailable";

export interface ProjectAgentRuntime {
  id: string;
  label: string;
}

export interface ProjectAgentOpeningRequest {
  kind: "brief";
  text: string;
  nonce: number;
}

/** Only verified, ready runtimes with an app-owned permission boundary may open chat. */
export function selectProjectAgentRuntimes(
  runtimes: readonly AcpRuntimeStatus[] | null | undefined,
): ProjectAgentRuntime[] {
  return (runtimes ?? [])
    .filter(
      (runtime) =>
        runtime.state === "ready" && runtime.verified && isGuardedRuntime(runtime.id, runtime.isolated),
    )
    .map(({ id, label }) => ({ id, label }));
}

export function resolveProjectAgentRoute({
  bridgeAvailable,
  runtimeCheckComplete,
  serverCheckComplete,
  runtime,
  vaultRoot,
  serverReady,
}: {
  bridgeAvailable: boolean;
  runtimeCheckComplete: boolean;
  serverCheckComplete: boolean;
  runtime: ProjectAgentRuntime | null;
  vaultRoot: string | null;
  serverReady: boolean;
}): ProjectAgentRoute {
  if (!bridgeAvailable) return "unavailable";
  if (!runtimeCheckComplete || !serverCheckComplete) return "checking";
  if (runtime && vaultRoot && serverReady) return "agent";
  return "unavailable";
}

/**
 * The agent a project page can hand its overview to: the same guarded ACP runtime, vault MCP
 * server and connector set the Library and Analysis docks use, read the same way (bridge
 * presence, a fast runtime probe then a login probe, the vault's own registration honoured).
 *
 * This is the third copy of that wiring (`views/library/lib/use-library-agent.ts`,
 * `views/ontology-insights/ui/OntologyInsightsPage.tsx`). It lives in a view because the
 * connector store is a feature and a feature-level hook could not import it without a new
 * same-layer edge; lifting the three into one hook is the cleanup this copy makes visible.
 *
 * `route` says what the ask button can promise: `agent` opens the dock and seats the request;
 * anything else leaves the copy-to-clipboard path, which works in the browser too.
 */
export function useProjectAgent(vaultRoot: string | null) {
  const localVault = useLocalVault();
  const agentServer = useAgentServer();
  const bridgeAvailable = useSyncExternalStore(
    subscribeDesktopRuntime,
    isAcpBridgeAvailable,
    readServerDesktopRuntime,
  );
  const [runtimes, setRuntimes] = useState<ProjectAgentRuntime[]>([]);
  const [runtimeId, setRuntimeId] = useState<string | null>(null);
  const [runtimeCheckComplete, setRuntimeCheckComplete] = useState(false);
  const [open, setOpen] = useState(false);
  const [openingRequest, setOpeningRequest] = useState<ProjectAgentOpeningRequest | null>(null);

  useEffect(() => {
    if (!bridgeAvailable) return;
    let cancelled = false;
    const apply = (list: Awaited<ReturnType<typeof detectAcpRuntimes>>) => {
      if (cancelled) return;
      const usable = selectProjectAgentRuntimes(list);
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

  const route = resolveProjectAgentRoute({
    bridgeAvailable,
    runtimeCheckComplete,
    serverCheckComplete: agentServer.launch !== null || agentServer.reason !== null,
    runtime,
    vaultRoot,
    serverReady: agentServer.launch !== null,
  });

  const start = useCallback((text: string) => {
    setOpeningRequest((current) => ({ kind: "brief", text, nonce: (current?.nonce ?? 0) + 1 }));
    setOpen(true);
  }, []);

  return { route, runtime, runtimes, runtimeId, setRuntimeId, mcpServers, open, setOpen, openingRequest, start };
}
