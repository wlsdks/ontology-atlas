import type { useAcpRuntimeController } from "./use-acp-runtime-controller";
import type { useTopologyAuthoring } from "../authoring/use-topology-authoring";
import type { useTopologyVaultReadModel } from "../use-topology-vault-read-model";

import type { AcpTurnActivity } from "@/features/acp-session";
import { connectorAcpServers, runtimeOwnsWriteGate, vaultMcpServers, vaultSelfReadSlot } from "@/features/acp-session";
import { type AgentLiveWorkInput } from "@/features/agent-activity";
import { useVaultConnectors } from "@/features/mcp-connectors";
import { isMappingActive, mappingAnalysisId, useFolderMappingRun } from "@/features/work-run";
import { createVaultAcpWorkReceiptStore, type AcpWorkReceipt, type AcpWorkReceiptStore } from "@/shared/lib/meaning-transition/acp-work-receipt";
import { useCallback, useMemo, useRef } from "react";
import { acpHeartbeatAgentName, buildAcpTurnHeartbeat, createVaultAcpHeartbeatStore, type AcpHeartbeatStore } from "../../lib/agent/acp-agent-heartbeat";

interface Options {
  topologyAuthoring: Pick<ReturnType<typeof useTopologyAuthoring>, "agentServer" | "acpTurnActivityFrame" | "setAcpTurnActivityFrame">;
  acpRuntimeController: Pick<ReturnType<typeof useAcpRuntimeController>, "acpRuntimeId"|"investigationBasis">;
  topologyVaultReadModel: Pick<ReturnType<typeof useTopologyVaultReadModel>, "vault" | "gitVaultPath">;
}
export function useTopologyAgentActivity({ topologyVaultReadModel, acpRuntimeController, topologyAuthoring }: Options) {
  const { vault, gitVaultPath } = topologyVaultReadModel;
  const { acpRuntimeId,investigationBasis } = acpRuntimeController;
  const sourceRoot=investigationBasis?.vaultPath===gitVaultPath?investigationBasis.sourceRoot:undefined;
  const { agentServer, acpTurnActivityFrame, setAcpTurnActivityFrame } = topologyAuthoring;

  // Read from the vault folder (`.ontology-atlas/connectors.json`) so both surfaces see the same
  // list.
  // Memoised below, or the consuming hook's `start` changes identity and its effect re-runs
  // forever.
  // A server the runtime already reads from the vault is not injected again
  // (`vault-mcp-server.ts`).
  const vaultConnectors = useVaultConnectors(vault.handle);
  // Each request of a press starts its own server; the press's id makes them one analysis.
  const mappingRun = useFolderMappingRun(gitVaultPath ?? "");
  const mapAnalysisId = mappingRun && isMappingActive(mappingRun) ? mappingAnalysisId(mappingRun) : null;
  const acpMcpServers = useMemo(() => {
    const registration =
      vaultSelfReadSlot(acpRuntimeId) === 'codex-config'
        ? {
          command: vault.agentConfigStatus?.codexRegisteredCommand ?? null,
          validForCurrentVault: vault.agentConfigStatus?.codexConfigValid === true,
        }
        : null;
    // Claude's isolated config already asks before every tool call, so a server gate would
    // double-prompt.
    return [
      ...vaultMcpServers(agentServer.launch, gitVaultPath, registration, {
        ownsWriteGate: runtimeOwnsWriteGate(acpRuntimeId),
        sourceRoot,
        mapAnalysisId,
      }),
      // The vault first: claude-agent-acp lets a later same-named entry win, and the instructions
      // name the vault server.
      // Atlas runs none of these; the agent spawns them (`connector-servers.ts`).
      ...connectorAcpServers(vaultConnectors.connectors, acpRuntimeId, vaultConnectors.allowedHere),
    ];
  }, [
    agentServer.launch,
    gitVaultPath,
    acpRuntimeId,
    sourceRoot,
    mapAnalysisId,
    vault.agentConfigStatus?.codexConfigValid,
    vault.agentConfigStatus?.codexRegisteredCommand,
    vaultConnectors.allowedHere,
    vaultConnectors.connectors,
  ]);

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
  // A ref, since the frame changes per tool call and the close handler reads it without re-render.
  // Null between turns.
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
      // React state first; the sidecar follows for external consumers and restarts.
      setAcpTurnActivityFrame((previous) => activity ? { activity, at: Date.now(), startedAt: previous?.startedAt ?? Date.now() } : null);
      const store = acpHeartbeatStore;
      if (!store) return;
      const agent = acpHeartbeatAgentName(acpRuntimeId);
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
