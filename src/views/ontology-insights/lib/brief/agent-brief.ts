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
  /** Write receipts, so the card can say what a person decided rather than only what ran. */
  receipts?: readonly AgentBriefReceipt[];
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
  /*
   * What happened to what the agent proposed, not how much it produced. A count of writes
   * rewards volume; a count of what a person allowed, refused, or has not answered yet is the
   * one a person can act on — the pending row is work waiting for them (reference survey,
   * 2026-09-19: CodeRabbit measures the proposal funnel rather than lines generated).
   */
  const receipts = (input.receipts ?? []).filter((receipt) => isAfter(receipt.at, input.anchorMs));
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
    availability: input.entries.length === 0 && receipts.length === 0 ? 'no-data' : 'measured',
    headline: since.length,
    current: since.length - writes,
    stale: writes,
    unknown: agents,
    lines,
  };
}
