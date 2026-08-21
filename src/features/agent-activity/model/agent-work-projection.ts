import type { AgentActivityState, AgentActivityStatus } from '@/features/docs-vault-local';
import type { AgentWorkSession } from '@/shared/lib/agent-work-session';
import { agentDisplayName } from '@/shared/lib/agent-display-name';

export type AgentWorkMode = 'idle' | 'live' | 'recent-write' | 'completed';

export interface AgentWorkProjection {
  mode: AgentWorkMode;
  agentName: string | null;
  rawAgentName: string | null;
  phase: AgentActivityState | null;
  summary: string | null;
  targetSlug: string | null;
  files: string[];
  nextStep: string | null;
  lastTool: string | null;
  updatedAt: number | null;
}

const IDLE: AgentWorkProjection = {
  mode: 'idle',
  agentName: null,
  rawAgentName: null,
  phase: null,
  summary: null,
  targetSlug: null,
  files: [],
  nextStep: null,
  lastTool: null,
  updatedAt: null,
};

/**
 * Honest precedence: a fresh declared heartbeat may say live; successful write
 * rows without one may only say a write was recent. Silence is never upgraded
 * into a live claim.
 */
export function deriveAgentWorkProjection(
  status: AgentActivityStatus | null | undefined,
  sessions: readonly AgentWorkSession[],
  _nowMs: number,
): AgentWorkProjection {
  const beat = status?.valid && !status.stale ? status.heartbeat : null;
  const last = sessions[sessions.length - 1] ?? null;

  if (beat && beat.state !== 'complete') {
    const updatedAt = Date.parse(beat.updatedAt);
    return {
      mode: 'live',
      agentName: agentDisplayName(beat.agent),
      rawAgentName: beat.agent,
      phase: beat.state,
      summary: beat.focus.summary,
      targetSlug: beat.focus.ontologySlug,
      files: beat.focus.files,
      nextStep: beat.plan[0] ?? null,
      lastTool: beat.evidence.mcp.at(-1) ?? null,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
    };
  }

  if (last) {
    return {
      mode: last.done ? 'completed' : 'recent-write',
      agentName: agentDisplayName(last.agent),
      rawAgentName: last.agent,
      phase: null,
      summary: beat?.focus.summary ?? null,
      targetSlug: beat?.focus.ontologySlug ?? last.lastTarget,
      files: beat?.focus.files ?? [],
      nextStep: null,
      lastTool: last.lastTool,
      updatedAt: last.endAt,
    };
  }

  if (beat) {
    const updatedAt = Date.parse(beat.updatedAt);
    return {
      mode: 'completed',
      agentName: agentDisplayName(beat.agent),
      rawAgentName: beat.agent,
      phase: null,
      summary: beat.focus.summary,
      targetSlug: beat.focus.ontologySlug,
      files: beat.focus.files,
      nextStep: null,
      lastTool: beat.evidence.mcp.at(-1) ?? null,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
    };
  }

  return IDLE;
}
