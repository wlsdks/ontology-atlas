import type { useAcpRuntimeController } from "./use-acp-runtime-controller";
import type { useTopologyAuthoring } from "./use-topology-authoring";
import type { useTopologyVaultReadModel } from "./use-topology-vault-read-model";

import type { AcpTurnActivity } from "@/features/acp-session";
import { connectorAcpServers, runtimeOwnsWriteGate, vaultMcpServers, vaultSelfReadSlot } from "@/features/acp-session";
import { type AgentLiveWorkInput } from "@/features/agent-activity";
import { useVaultConnectors } from "@/features/mcp-connectors";
import { createVaultAcpWorkReceiptStore, type AcpWorkReceipt, type AcpWorkReceiptStore } from "@/shared/lib/acp-work-receipt";
import { useCallback, useMemo, useRef } from "react";
import { acpHeartbeatAgentName, buildAcpTurnHeartbeat, createVaultAcpHeartbeatStore, type AcpHeartbeatStore } from "../lib/acp-agent-heartbeat";

interface Options {
  topologyAuthoring: Pick<ReturnType<typeof useTopologyAuthoring>, "agentServer" | "acpTurnActivityFrame" | "setAcpTurnActivityFrame">;
  acpRuntimeController: Pick<ReturnType<typeof useAcpRuntimeController>, "acpRuntimeId">;
  topologyVaultReadModel: Pick<ReturnType<typeof useTopologyVaultReadModel>, "vault" | "gitVaultPath">;
}
export function useTopologyAgentActivity({ topologyVaultReadModel, acpRuntimeController, topologyAuthoring }: Options) {
  const { vault, gitVaultPath } = topologyVaultReadModel;
  const { acpRuntimeId } = acpRuntimeController;
  const { agentServer, acpTurnActivityFrame, setAcpTurnActivityFrame } = topologyAuthoring;

  /*
   * Memoised: a fresh array every render changes the identity of the consuming hook's
   * `start`, and the effect watching it re-runs forever. The session hook holds the
   * lock (`startingRef`), but **not spinning in the first place is this call's job**.
   *
   * If the runtime already reads the same server from the vault **by itself**, it is
   * not injected again here — measured 2026-08-17, `mcp.ontology-atlas.*` and
   * `mcp.atlas-vault.*` produced identical results from two processes. The decision
   * and its evidence are in `vault-mcp-server.ts`.
   */
  /*
   * The external MCP servers this person attached to this vault. Read from the folder rather
   * than from browser storage, so the answer travels with the vault and both surfaces see the
   * same list (`.ontology-atlas/connectors.json`).
   */
  const vaultConnectors = useVaultConnectors(vault.handle);
  const acpMcpServers = useMemo(() => {
    const registration =
      vaultSelfReadSlot(acpRuntimeId) === 'codex-config'
        ? {
          command: vault.agentConfigStatus?.codexRegisteredCommand ?? null,
          validForCurrentVault: vault.agentConfigStatus?.codexConfigValid === true,
        }
        : null;
    // Claude's isolated config already asks before every tool call, so a second
    // server-side gate would double-prompt. Everything else gets the server gate.
    return [
      ...vaultMcpServers(agentServer.launch, gitVaultPath, registration, {
        ownsWriteGate: runtimeOwnsWriteGate(acpRuntimeId),
      }),
      /*
       * **The vault first, then whatever the person attached.** Atlas runs none of these — the
       * descriptor goes into the handshake and the agent spawns it (`connector-servers.ts`).
       * Order matters twice: claude-agent-acp lets a later same-named entry override an earlier
       * one, and the session's instructions name the vault server, so it must be the one that
       * survives.
       */
      ...connectorAcpServers(vaultConnectors.connectors, acpRuntimeId),
    ];
  }, [
    agentServer.launch,
    gitVaultPath,
    acpRuntimeId,
    vault.agentConfigStatus?.codexConfigValid,
    vault.agentConfigStatus?.codexRegisteredCommand,
    vaultConnectors.connectors,
  ]);

  /*
   * The in-app agent **registers its own name in the vault** (owner instruction,
   * 2026-08-17). Before this, every node it created carried
   * `created_by: agent:unknown` — the server knew the name, but that field only accepts
   * a name a human deliberately registered, and there was nowhere to register one. The
   * human choosing which tool to talk to *is* that intent, and the app knows it. The
   * decision and its evidence are in `lib/acp-agent-heartbeat.ts`.
   */
  const acpHeartbeatStore = useMemo<AcpHeartbeatStore | null>(
    () =>
      vault.status === "loaded" && vault.handle
        ? createVaultAcpHeartbeatStore(vault.handle)
        : null,
    [vault.status, vault.handle],
  );
  const acpWorkReceiptStore = useMemo<AcpWorkReceiptStore | null>(
    () =>
      vault.status === "loaded" && vault.handle
        ? createVaultAcpWorkReceiptStore(vault.handle)
        : null,
    [vault.status, vault.handle],
  );
  const refreshVault = vault.refresh;
  const handleAcpWorkReceipt = useCallback((receipt: AcpWorkReceipt) => {
    if (!acpWorkReceiptStore) return;
    void acpWorkReceiptStore
      .append(receipt)
      .then(() => refreshVault())
      .catch(() => { });
  }, [acpWorkReceiptStore, refreshVault]);
  /*
   * When the running turn began. Kept in a ref beside the frame: the frame changes with
   * every tool call, the start does not, and the dock's close handler reads it without
   * re-rendering. Null between turns.
   */
  const acpTurnStartedAtRef = useRef<number | null>(null);
  const acpLiveWork = useMemo<AgentLiveWorkInput | null>(() => {
    const frame = acpTurnActivityFrame;
    if (!frame) return null;
    return {
      rawAgentName: acpHeartbeatAgentName(acpRuntimeId),
      phase: frame.activity.state,
      summary: frame.activity.summary,
      targetSlug: frame.activity.ontologySlug,
      lastTool: frame.activity.toolName,
      updatedAt: frame.at,
      startedAt: frame.startedAt,
    };
  }, [acpRuntimeId, acpTurnActivityFrame]);
  const handleAcpTurnActivityChange = useCallback(
    (activity: AcpTurnActivity | null) => {
      if (activity) acpTurnStartedAtRef.current ??= Date.now();
      else acpTurnStartedAtRef.current = null;
      // The screen already has this event. React memory updates first; the sidecar
      // follows, for external consumers and for continuity across a restart.
      setAcpTurnActivityFrame((previous) => activity ? { activity, at: Date.now(), startedAt: previous?.startedAt ?? Date.now() } : null);
      const store = acpHeartbeatStore;
      if (!store) return;
      const agent = acpHeartbeatAgentName(acpRuntimeId);
      // With no name, register nothing — unknown is better left as unknown.
      if (!activity || !agent) {
        void store.clear().catch(() => { });
        return;
      }
      void store.write(buildAcpTurnHeartbeat({ agent, at: new Date(), activity })).catch(() => { });
    },
    [acpHeartbeatStore, acpRuntimeId, setAcpTurnActivityFrame],
  );
  return { acpLiveWork, acpTurnStartedAtRef, acpMcpServers, handleAcpTurnActivityChange, handleAcpWorkReceipt };
}
