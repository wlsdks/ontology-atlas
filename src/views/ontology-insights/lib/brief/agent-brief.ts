import { isAfter, type BriefCore, type BriefLine } from './brief-model';

/** The slice of `AgentActivityEntry` the brief reads. */
interface AgentBriefEntry {
  at: string;
  tool: string;
  agent: string | null;
}

export interface AgentBriefInput {
  entries: readonly AgentBriefEntry[];
  /** Whether a tool name writes to the vault — the app's own tool policy, never a second list. */
  isWriteTool: (tool: string) => boolean;
  anchorMs: number;
}

/**
 * What agents did since the anchor: calls, of which writes, by how many distinct agents.
 * The three columns are reads / writes / agents rather than current/stale/unknown — an
 * activity log has no truth to be stale about, only a count of what happened.
 */
export function buildAgentBrief(input: AgentBriefInput): BriefCore {
  const since = input.entries.filter((entry) => isAfter(entry.at, input.anchorMs));
  const writes = since.filter((entry) => input.isWriteTool(entry.tool)).length;
  const agents = new Set(since.map((entry) => entry.agent ?? 'unknown')).size;
  const lines: BriefLine[] = [
    { id: 'agent-calls-since', count: since.length, state: 'current' },
    { id: 'agent-writes-since', count: writes, state: 'current' },
    { id: 'agent-distinct-since', count: agents, state: 'current' },
  ];
  return {
    core: 'agent',
    availability: input.entries.length === 0 ? 'no-data' : 'measured',
    headline: since.length,
    current: since.length - writes,
    stale: writes,
    unknown: agents,
    lines,
  };
}
