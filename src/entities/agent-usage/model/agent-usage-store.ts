'use client';

import { useSyncExternalStore } from 'react';

import { mergeUsageReport, pressingLimit, type AgentUsage, type LimitInForce, type UsageReport } from './agent-usage';

export interface AgentUsageSnapshot {
  byRuntime: ReadonlyMap<string, AgentUsage>;
  /** The agent that reported last, the one the rail shows. */
  latestRuntimeId: string | null;
}

const EMPTY: AgentUsageSnapshot = { byRuntime: new Map(), latestRuntimeId: null };

let snapshot = EMPTY;
const listeners = new Set<() => void>();

/**
 * Memory only: the figures are the agent's to state, so after a relaunch nothing shows until it
 * reports again. Listeners hear only an update that changed something.
 */
export const agentUsage = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  read: (): AgentUsageSnapshot => snapshot,
  readServer: (): AgentUsageSnapshot => EMPTY,
  record(runtimeId: string, report: UsageReport, readAtMs: number = Date.now()): void {
    const previous = snapshot.byRuntime.get(runtimeId) ?? null;
    const next = mergeUsageReport(previous, runtimeId, report, readAtMs);
    if (!next || next === previous) return;
    const byRuntime = new Map(snapshot.byRuntime);
    byRuntime.set(runtimeId, next);
    snapshot = { byRuntime, latestRuntimeId: runtimeId };
    for (const listener of listeners) listener();
  },
  reset(): void {
    snapshot = EMPTY;
    for (const listener of listeners) listener();
  },
};

function useAgentUsageSnapshot(): AgentUsageSnapshot {
  return useSyncExternalStore(agentUsage.subscribe, agentUsage.read, agentUsage.readServer);
}

/** Changes only when this agent reports, never for another agent's update. */
export function useAgentUsage(runtimeId: string): AgentUsage | null {
  return useSyncExternalStore(
    agentUsage.subscribe,
    () => agentUsage.read().byRuntime.get(runtimeId) ?? null,
    () => null,
  );
}

/** The limit worth naming where this agent's work starts, judged as of its last update. */
export function usePressingLimit(runtimeId: string): LimitInForce | null {
  const usage = useAgentUsage(runtimeId);
  return usage ? pressingLimit(usage, usage.readAtMs) : null;
}

export function useLatestAgentUsage(): AgentUsage | null {
  const { byRuntime, latestRuntimeId } = useAgentUsageSnapshot();
  return latestRuntimeId === null ? null : byRuntime.get(latestRuntimeId) ?? null;
}
