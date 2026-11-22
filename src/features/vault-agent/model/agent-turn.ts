/**
 * The vault agent's data shapes. `ProposedFileChange.before/after` is shared by the diff card
 * and the applier, or what the person saw is not what gets written.
 */

/** What this answer rests on; `citation.ts` decides it and documents each variant. */
export type AnswerGrounding =
  /** At least one `[[slug]]` citation — the sentence points at its own evidence. */
  | 'grounded'
  /** Something was read this turn but no citation was written. The screen compensates with the read list. */
  | 'uncited'
  /** Nothing was read this turn. The answer was given with no evidence. */
  | 'unread';

export interface ToolCallRecord {
  /** The id the vendor gave. Gemini gives none, so the runner synthesizes one. */
  id: string;
  /** Only names identical to MCP's. A name outside the list executes zero times and returns an error. */
  name: string;
  args: unknown;
  /** The target shown in the screen's row (a node slug and the like). Empty string when absent. */
  target: string;
  /** The measured character count actually sent in this round trip. No estimates. */
  sentChars: number;
  outcome: 'ok' | 'error' | 'blocked-write' | 'unknown-tool' | 'args-invalid';
  summary: string;
}

  /** A paragraph with citations. `citations` keeps only slugs actually read this turn. */
export interface CitedParagraph {
  text: string;
  citations: string[];
}

export interface ProposedFileChange {
  path: string;
  kind: 'create' | 'modify';
  /** modify: the full file at proposal time. Null for create. */
  before: string | null;
  after: string;
}

export type ProposalToolName =
  | 'add_concept'
  | 'add_concepts'
  | 'add_relation'
  | 'add_relations'
  | 'patch_concept'
  /** A Compile turn's wiki page; not in `AGENT_TOOLS` (see `compile-tool-catalog.ts`), but it rides `ProposalChange`. */
  | 'propose_wiki_page';

export interface ProposalChange {
  id: string;
  tool: ProposalToolName;
  summary: string;
  files: ProposedFileChange[];
  selected: boolean;
  /** Required for the patch family — the mtime at proposal time. If it differs on apply, nothing is written. */
  expectedMtime?: number;
}

type ProposalStatus =
  | 'pending'
  /** The write is in flight; the reentrancy guard and the button lock both read it, or a double press writes twice. */
  | 'applying'
  | 'applied'
  /** The write itself failed; distinct from 'pending' because files may already have changed. */
  | 'failed'
  | 'cancelled'
  | 'conflict'
  | 'copy-degraded';

export interface AgentProposal {
  id: string;
  status: ProposalStatus;
  changes: ProposalChange[];
  /** Defaults to true when the vault is a git repository. */
  snapshotRequested: boolean;
  appliedSnapshotSha?: string;
  applyErrorMessage?: string;
  writtenPaths?: string[];
  refreshErrorMessage?: string;
  /** Nodes read this turn; a proposal editing another file gets a warning row, narrowing injection-laundered consent. */
  readNodesThisTurn: string[];
}

export interface ScreenContextSnapshot {
  focusedSlug: string | null;
  focusedTitle: string | null;
  focusedKind: string | null;
  lenses: string[];
  projectTitle: string | null;
  visibleNodeCount: number;
  /**
   * Recently applied changes (git commit subjects, newest first), so work continues without a
   * conversation store. Empty outside git, and then the block is not sent.
   */
  recentChanges?: readonly string[];
}

type NoticeCode =
  | 'network-failed'
  | 'timed-out'
  | 'rate-limited'
  | 'rejected'
  | 'round-cap'
  /** A turn that stopped without calling a tool; symmetric with `round-cap`. */
  | 'no-tool-call'
  | 'aborted'
  | 'audit-blocked'
  | 'provider-refused'
  | 'no-key'
  | 'failed';

export type AgentEvent =
  | { kind: 'user'; text: string; screenContext: ScreenContextSnapshot }
  | { kind: 'toolLine'; call: ToolCallRecord }
  | {
      kind: 'assistant';
      paragraphs: CitedParagraph[];
      grounding: AnswerGrounding;
      sources?: string[];
      /** The next single step from the response's last line; a chip is a prefill, not a send. */
      nextStep?: string | null;
    }
  | { kind: 'proposal'; proposal: AgentProposal }
  | { kind: 'notice'; code: NoticeCode; text: string };

type AgentTurnStatus =
  | 'sending'
  | 'running'
  | 'done'
  | 'aborted'
  | 'failed';

export interface AgentTurn {
  id: string;
  events: AgentEvent[];
  roundsUsed: number;
  sentChars: number;
  auditCount: number;
  status: AgentTurnStatus;
}

  /** The tool round-trip cap. The structural ceiling on autonomous runaway. */
export const AGENT_ROUND_CAP = 6;

/** Result characters per round trip; beyond it the result is truncated so BYOK cost cannot grow quietly. */
export const AGENT_TOOL_RESULT_CHAR_CAP = 6_000;

export const AGENT_TURN_VAULT_CHAR_CAP = 40_000;
