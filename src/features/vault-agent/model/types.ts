/**
 * The vault agent's data shapes — the contract shared by the screen, the runner,
 * and the disk.
 *
 * One contract matters most: `ProposedFileChange.before/after` is **the shared
 * source of truth for the diff card and the applier**. The string the card drew
 * and the string written to disk must be the same for "what you saw is what gets
 * written" to be true.
 */

/**
 * What this answer rests on. The screen's copy and controls branch on it. The
 * verdict is made by `citation.ts`, and the meaning of each variant is in that
 * file's header comment.
 */
export type AnswerGrounding =
  /** At least one `[[slug]]` citation — the sentence points at its own evidence. */
  | 'grounded'
  /** Something was read this turn but no citation was written. The screen compensates with the read list. */
  | 'uncited'
  /** Nothing was read this turn. The answer was given with no evidence. */
  | 'unread';

  /** The measured record of one tool call carried in this round trip. */
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
  /** A one-line plain-language summary for the screen's row. */
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
  /** On apply, this exact string is written. */
  after: string;
}

export type ProposalToolName =
  | 'add_concept'
  | 'add_concepts'
  | 'add_relation'
  | 'add_relations'
  | 'patch_concept';

export interface ProposalChange {
  id: string;
  tool: ProposalToolName;
  /** One line such as "edit capabilities/payment.md — add refund to its dependencies". */
  summary: string;
  files: ProposedFileChange[];
  selected: boolean;
  /** Required for the patch family — the mtime at proposal time. If it differs on apply, nothing is written. */
  expectedMtime?: number;
}

type ProposalStatus =
  | 'pending'
  /**
   * The write is **in flight**. The draft had no such value, so the state stayed
   * `pending` during the `await` and pressing [apply] twice sent **two concurrent
   * vault writes**. Cancel could be pressed in between too. And the screen drew
   * zero distinction for "applying" (the interaction seat's rejection reason,
   * 2026-07-29).
   *
   * With this value, the reentrancy guard and the button lock look at **the same
   * fact** — the same grammar as the finish dialog's `busy`.
   */
  | 'applying'
  | 'applied'
  /**
   * The write itself failed (an I/O error, or a same-file selection that cannot
   * be honored). Distinct from 'pending' on purpose: mapping a failure back to
   * 'pending' made a failed write indistinguishable from "not yet applied"
   * while files may already have changed (bug sweep 2026-09-01).
   */
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
  /** Why the apply failed — shown on the card while status is 'failed'. */
  applyErrorMessage?: string;
  /**
   * The node slugs actually read this turn. A proposal editing a file that is not
   * here gets a warning row on the card — narrowing the path by which an injection
   * launders consent.
   */
  readNodesThisTurn: string[];
}

  /** The context the screen handed the agent. Echoed verbatim into the user bubble. */
export interface ScreenContextSnapshot {
  /** The node being viewed (only when there is one). */
  focusedSlug: string | null;
  focusedTitle: string | null;
  focusedKind: string | null;
  /** The names of the active lenses (plain language). */
  lenses: string[];
  /** The project scope's title. */
  projectTitle: string | null;
  /** How many concepts are drawn on the map right now. */
  visibleNodeCount: number;
  /**
   * This folder's **recently applied changes** (commit subjects from git history,
   * newest first).
   *
   * This is what lets work continue without storing the conversation — the
   * previous session's writes stayed in frontmatter and in git, and a new
   * conversation reads them to construct "we got this far last time, so next…"
   * for itself. That is why no second source of truth outside the vault (a
   * conversation store) is needed. Empty when this is not a git repository or has
   * no history, and then the block is not sent at all.
   */
  recentChanges?: readonly string[];
}

type NoticeCode =
  | 'network-failed'
  | 'timed-out'
  | 'rate-limited'
  | 'rejected'
  | 'round-cap'
  /**
   * **A turn that stopped without calling a single tool** (2026-08-02).
   *
   * The round-cap branch raises `round-cap` explicitly, but the early-exit branch
   * was accepted as `status: 'done'` with no notice at all — the screen returned
   * the input box exactly as it does on a normal completion, and the user could
   * not distinguish an answer that never looked at the vault from one that read
   * it. This code exists so the two branches are symmetric.
   */
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
      /**
       * What this answer rests on — `citation.ts`'s two-way verdict. The old
       * `demoted: boolean` counted only citation **markers**, so a turn that read
       * the vault and answered from it still showed "answered with no evidence read".
       */
      grounding: AnswerGrounding;
      /**
       * The nodes actually read this turn. The material with which the screen
       * **mechanically compensates** in the `uncited` case, showing them as
       * "sources consulted" chips — it does not rely on the model honouring the
       * citation notation.
       */
      sources?: string[];
      /**
       * The **next single step**, taken from the last line of the same response.
       * It was not obtained by an extra call; this turn already said it. It becomes
       * one chip, and a chip is a prefill — not a send, and not a pending card.
       */
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
  /** ≤ ROUND_CAP */
  roundsUsed: number;
  /** The footer running total — measured character counts only. */
  sentChars: number;
  /** Audit lines written = successful round trips. */
  auditCount: number;
  status: AgentTurnStatus;
}

  /** The tool round-trip cap. The structural ceiling on autonomous runaway. */
export const AGENT_ROUND_CAP = 6;

/**
 * The character cap on tool results carried in one round trip. Beyond it the
 * result is truncated and the model is told to "narrow it and ask again" —
 * blocking the path by which the user's cost (BYOK billing) grows quietly.
 */
export const AGENT_TOOL_RESULT_CHAR_CAP = 6_000;

/** The cap on total vault excerpt volume carried in one turn. */
export const AGENT_TURN_VAULT_CHAR_CAP = 40_000;
