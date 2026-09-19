"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

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

export interface VaultAgentRuntime {
  id: string;
  label: string;
}

/**
 * What the ask can promise: `agent` may open a dock; `checking` is the moment before both the
 * runtime probe and the bundled-server read have answered; `unavailable` is the browser, an
 * app without a guarded runtime, a folder without a native path, or a server that cannot launch.
 */
export type VaultAgentRoute = "checking" | "agent" | "unavailable";

/** Only verified, ready runtimes with an app-owned permission boundary may open chat. */
export function selectVaultAgentRuntimes(
  runtimes: readonly AcpRuntimeStatus[] | null | undefined,
): VaultAgentRuntime[] {
  return (runtimes ?? [])
    .filter(
      (runtime) =>
        runtime.state === "ready" && runtime.verified && isGuardedRuntime(runtime.id, runtime.isolated),
    )
    .map(({ id, label }) => ({ id, label }));
}

export function resolveVaultAgentRoute({
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
  runtime: VaultAgentRuntime | null;
  vaultRoot: string | null;
  serverReady: boolean;
}): VaultAgentRoute {
  if (!bridgeAvailable) return "unavailable";
  if (!runtimeCheckComplete || !serverCheckComplete) return "checking";
  if (runtime && vaultRoot && serverReady) return "agent";
  return "unavailable";
}

/**
 * The guarded ACP runtime a screen can dock a conversation to, read one way for every screen.
 *
 * Until 2026-09-19 the Library (`views/library/lib/use-library-agent.ts`), Analysis
 * (`OntologyInsightsPage.tsx`) and the project page (`views/project-detail/lib/use-project-agent.ts`)
 * each carried this wiring: bridge presence through `useSyncExternalStore`, a fast runtime probe
 * then a login probe (the screen paints first and corrects later, owner 2026-08-16), the guarded
 * subset, the vault's own MCP registration honoured, connectors gated per runtime. Three copies
 * drift; this widget model is the one place, and a view keeps only what is its own (the Library's
 * local-model brain, Analysis's capture context).
 *
 * It lives in the chat panel widget rather than a feature because the connector store is a
 * feature too, and a feature-level hook would need a new same-layer edge in
 * `same-layer-cross-import-ratchet`; widgets may read every feature.
 */
export function useVaultAgentRuntime(
  vaultRoot: string | null,
  options: {
    /**
     * Hand the session the folder's registered connectors as well (`features/mcp-connectors`).
     * The Library and the project page do; Analysis never has, and a refactor is not the place
     * to change what a screen hands its agent.
     */
    connectors?: boolean;
  } = {},
): {
  bridgeAvailable: boolean;
  runtimes: VaultAgentRuntime[];
  runtime: VaultAgentRuntime | null;
  runtimeId: string | null;
  setRuntimeId: (runtimeId: string | null) => void;
  runtimeCheckComplete: boolean;
  serverCheckComplete: boolean;
  serverReady: boolean;
  mcpServers: unknown[];
  route: VaultAgentRoute;
} {
  const localVault = useLocalVault();
  const agentServer = useAgentServer();
  const bridgeAvailable = useSyncExternalStore(
    subscribeDesktopRuntime,
    isAcpBridgeAvailable,
    readServerDesktopRuntime,
  );
  const [runtimes, setRuntimes] = useState<VaultAgentRuntime[]>([]);
  const [runtimeId, setRuntimeId] = useState<string | null>(null);
  const [runtimeCheckComplete, setRuntimeCheckComplete] = useState(false);

  useEffect(() => {
    if (!bridgeAvailable) return;
    let cancelled = false;
    const apply = (list: Awaited<ReturnType<typeof detectAcpRuntimes>>) => {
      if (cancelled) return;
      const usable = selectVaultAgentRuntimes(list);
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
  const withConnectors = options.connectors !== false;
  const vaultConnectors = useVaultConnectors(withConnectors ? localVault.handle : null);
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
      ...(withConnectors ? connectorAcpServers(vaultConnectors.connectors, runtimeId) : []),
    ];
  }, [
    agentServer.launch,
    localVault.agentConfigStatus?.codexConfigValid,
    localVault.agentConfigStatus?.codexRegisteredCommand,
    runtimeId,
    vaultConnectors.connectors,
    vaultRoot,
    withConnectors,
  ]);

  const serverCheckComplete = agentServer.launch !== null || agentServer.reason !== null;
  const serverReady = agentServer.launch !== null;
  const route = resolveVaultAgentRoute({
    bridgeAvailable,
    runtimeCheckComplete,
    serverCheckComplete,
    runtime,
    vaultRoot,
    serverReady,
  });

  return {
    bridgeAvailable,
    runtimes,
    runtime,
    runtimeId,
    setRuntimeId,
    runtimeCheckComplete,
    serverCheckComplete,
    serverReady,
    mcpServers,
    route,
  };
}
