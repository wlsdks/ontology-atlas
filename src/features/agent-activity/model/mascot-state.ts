import type { AgentWorkProjection } from './agent-work-projection';

export type AgentMascotState = 'hidden' | 'walk' | 'read' | 'success';

/**
 * A pose may claim READ only when a verified current projection names a read-like
 * Atlas operation. Planning alone is not evidence that anything was read.
 */
const READ_TOOL =
  /(?:connection_info|list_|get_|find_|query_|validate|workspace_brief|agent_brief|health|overview|components|growth_plan)/i;

export function isVerifiedMascotRead(work: AgentWorkProjection): boolean {
  return work.mode === 'live' && work.lastTool !== null && READ_TOOL.test(work.lastTool);
}

export function isVerifiedMascotCompletion(work: AgentWorkProjection): boolean {
  return work.mode === 'completed' && work.updatedAt !== null;
}
