import { useMemo } from "react";

interface AgentHeartbeatStatus {
  valid?: boolean;
  stale?: boolean;
  heartbeat?: {
    updatedAt: string;
    agent?: string | null;
    focus: { ontologySlug: string | null };
  } | null;
}

type AgentConnectState =
  | { kind: "connected" }
  | { kind: "stale" }
  | { kind: "none" };

export interface UseAgentConnectModelArgs {
  agentActivityStatus: AgentHeartbeatStatus | null;
}

export interface AgentConnectModel {
  status: AgentConnectState;
}

export function useAgentConnectModel({
  agentActivityStatus,
}: UseAgentConnectModelArgs): AgentConnectModel {

  const status = useMemo<AgentConnectState>(() => {
    const hb = agentActivityStatus?.heartbeat ?? null;
    if (!hb || !agentActivityStatus?.valid) return { kind: "none" };
    if (agentActivityStatus.stale) return { kind: "stale" };
    return { kind: "connected" };
  }, [agentActivityStatus]);

  return { status };
}
