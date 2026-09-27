"use client";

import { useMemo } from "react";

/**
 * Whether an agent is attached right now, read from one heartbeat line.
 * Registration setup lives in the destination's `VaultAgentSetupPanel`.
 */

interface AgentHeartbeatStatus {
  valid?: boolean;
  stale?: boolean;
  heartbeat?: {
    updatedAt: string;
    agent?: string | null;
    focus: { ontologySlug: string | null };
  } | null;
}

/** Read by the rail tile and the "Updated with AI" branch. */
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
