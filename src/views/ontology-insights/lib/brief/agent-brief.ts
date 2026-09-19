import { isAfter, type BriefCore, type BriefLine } from './brief-model';

/** The slice of `AgentActivityEntry` the brief reads. */
export interface AgentBriefEntry {
  at: string;
  tool: string;
  agent: string | null;
}

export interface AgentBriefInput {
  entries: readonly AgentBriefEntry[];
  /** Tool names that write to the vault, from the MCP registry's write list. */
  writeTools: ReadonlySet<string>;
  anchorMs: number;
}

/**
 * What agents did since the anchor: calls, of which writes, by how many distinct agents.
 * The three columns are reads / writes / agents rather than current/stale/unknown — an
 * activity log has no truth to be stale about, only a count of what happened.
 */
export function buildAgentBrief(input: AgentBriefInput): BriefCore {
  const since = input.entries.filter((entry) => isAfter(entry.at, input.anchorMs));
  const writes = since.filter((entry) => input.writeTools.has(entry.tool)).length;
  const agents = new Set(since.map((entry) => entry.agent ?? 'unknown')).size;
  const lines: BriefLine[] = [
    { id: 'agent-calls-since', count: since.length, state: 'current' },
    { id: 'agent-writes-since', count: writes, state: 'current' },
    { id: 'agent-distinct-since', count: agents, state: 'current' },
  ];
  return {
    core: 'agent',
    availability: input.entries.length === 0 ? 'no-data' : 'measured',
    current: since.length - writes,
    stale: writes,
    unknown: agents,
    lines,
  };
}
