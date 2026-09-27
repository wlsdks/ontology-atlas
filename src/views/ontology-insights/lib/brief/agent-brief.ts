import { isAfter, type BriefCore, type BriefLine } from './brief-model';

/** The slice of `AgentActivityEntry` the brief reads. */
interface AgentBriefEntry {
  at: string;
  tool: string;
  agent: string | null;
}

/** The slice of `AcpWorkReceipt` the brief reads: what a person decided about one agent write. */
interface AgentBriefReceipt {
  at: string;
  decision: 'allowed' | 'rejected';
  result: 'pending' | 'completed' | 'failed' | 'cancelled' | 'not-run';
}

export interface AgentBriefInput {
  entries: readonly AgentBriefEntry[];
  /** Write receipts, so the card says what a person decided, not only what ran. */
  receipts?: readonly AgentBriefReceipt[];
  /** Whether a tool writes to the vault, from the app's tool policy, never a second list. */
  isWriteTool: (tool: string) => boolean;
  anchorMs: number;
}

/**
 * What agents did since the anchor: calls, writes and distinct agents. An activity log has no truth to be stale
 * about, so its columns are reads, writes and agents.
 */
export function buildAgentBrief(input: AgentBriefInput): BriefCore {
  const since = input.entries.filter((entry) => isAfter(entry.at, input.anchorMs));
  const writes = since.filter((entry) => input.isWriteTool(entry.tool)).length;
  const agents = new Set(since.map((entry) => entry.agent ?? 'unknown')).size;
  // What happened to the agent's proposals, not their volume: allowed and unfinished, failed, refused. These lines
  // ignore the anchor, since a write waiting for the person keeps waiting after they look; only the activity lines
  // below count "since".
  const receipts = input.receipts ?? [];
  const waiting = receipts.filter((receipt) => receipt.decision === 'allowed' && receipt.result === 'pending').length;
  const refused = receipts.filter((receipt) => receipt.decision === 'rejected').length;
  const failed = receipts.filter((receipt) => receipt.result === 'failed').length;
  const lines: BriefLine[] = [
    { id: 'agent-writes-waiting', count: waiting, state: 'unknown' },
    { id: 'agent-writes-failed', count: failed, state: 'stale' },
    { id: 'agent-calls-since', count: since.length, state: 'current' },
    { id: 'agent-writes-since', count: writes, state: 'current' },
    { id: 'agent-writes-refused', count: refused, state: 'current' },
    { id: 'agent-distinct-since', count: agents, state: 'current' },
  ];
  return {
    core: 'agent',
    // Both halves are unfiltered: "never recorded agent work" is a fact about the folder, not the window.
    availability: input.entries.length === 0 && receipts.length === 0 ? 'no-data' : 'measured',
    headline: since.length,
    current: since.length - writes,
    stale: writes,
    unknown: agents,
    lines,
  };
}
