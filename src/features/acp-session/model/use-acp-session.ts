'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';

import {
  acpPermissionVerdict,
  isAcpBridgeAvailable,
  listenToAcpSession,
  sendAcpLine,
  startAcpSession,
  stopAcpSession,
} from '@/shared/lib/tauri-acp';

import { GATED_SESSION_MODE } from './runtime-gate';
import { modeKeepsGate } from './mode-safety';
import { isDiagnosticStderr } from './acp-trouble';
import { readSlashCommands, type AcpSlashCommand } from './slash-commands';
import { hasVaultMcpServer, VAULT_MCP_SERVER_NAME, vaultWriteConsentOn } from './vault-mcp-server';
import { latestSession, orderSessionsByRecency } from './session-recency';
import {
  applyCurrentMode,
  createAcpClient,
  type AcpClient,
  type AcpPermissionRequest,
  type AcpSessionChoices,
  type AcpSessionSummary,
  type AcpTransport,
} from './acp-client';
import { buildOntologyChangeSet } from '@/entities/knowledge-graph';
import type {
  AcpWorkDecision,
  AcpWorkReceipt,
  AcpWorkResult,
} from '@/shared/lib/acp-work-receipt';
import { unavailableTaskBaseline, type TaskBaselineCaptureResult } from './task-baseline';

/**
 * The lifetime of one ACP session — start it, talk to it, ask for permission, end it.
 *
 * **The screen shows only what has actually happened.** No progress bar is invented. A tool row
 * appears only after the agent really called that tool, and status changes only as the agent
 * reports them. This is the discipline the repository already settled in its existing chat —
 * see `src/features/vault-agent/model/agent-loop.ts`: marking something "read" before it is sent
 * makes the screen state something that has not happened yet.
 *
 * **Permission waits until the screen answers.** A request outside the vault raises a card and
 * defers the response until the user chooses; meanwhile the agent is stopped — that is what the
 * permission gate means. If the screen closes or the session ends, it **answers with a rejection**:
 * counting an unasked question as allowed is the same as having no gate.
 */

export type AcpEvent =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'agent'; id: string; text: string }
  | { kind: 'thought'; id: string; text: string }
  | {
      kind: 'tool';
      id: string;
      title: string;
      toolKind: string;
      status: string;
      /**
       * The raw arguments the tool received. **Which node was touched exists only here**
       * (`tool-targets.ts`). It used to be discarded, so a tool row could say "read a concept"
       * without being able to say which one.
       */
      rawInput?: unknown;
      /**
       * What the tool answered. **How much came back exists only here**
       * (`tool-outcome.ts`): a line that cannot say the search found nothing leaves a
       * confident wrong answer with no visible contradiction.
       */
      rawOutput?: unknown;
    }
  | {
      kind: 'notice';
      id: string;
      text: string;
      /** What `auto-allowed` allowed: the vault-relative path the screen judged. */
      detail?: string;
      /**
       * The mode the adapter moved this session into, verbatim as the adapter names it. Present
       * only on `mode-moved`. Not translated: it is the id the tool itself shows, and inventing a
       * friendly name for a mode this app refuses to offer would name something nobody can pick.
       */
      mode?: string;
      /** Whether the server-side Atlas write checkpoint is actually on for this session. */
      serverGate?: boolean;
    };

export type AcpSessionStatus =
  | 'idle'
  | 'starting'
  | 'ready'
  | 'thinking'
  | 'error'
  | 'exited';

export interface PendingPermission {
  request: AcpPermissionRequest;
  origin?: {
    sessionGeneration: number;
    turn: Pick<AcpTurnStart, 'sessionId' | 'vaultRoot' | 'userEventId' | 'text'> | null;
    task: { outcome: string; nonGoals: null; structure: 'unstructured' } | null;
    taskBaseline: TaskBaselineCaptureResult | null;
  };
  /** Passes the user's choice back to the agent. `null` is a rejection. */
  resolve: (optionId: string | null) => void;
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Capture a queued permission before another request can delay its presentation. */
export function snapshotPermissionRequest(request: AcpPermissionRequest): AcpPermissionRequest {
  return deepFreeze(structuredClone(request));
}

export interface UseAcpSessionOptions {
  runtimeId: string;
  /** The agent's working folder, and the basis for deciding inside vs. outside. */
  vaultRoot: string | null;
  /** MCP servers wired into the session automatically, so the user never edits a config file. */
  mcpServers?: unknown[];
  /** Time to let the confirm motion finish before proceeding with the tool. 0 under reduced motion. */
  approvalSettleMs?: number;
  /** Human ontology-write decisions, emitted as bounded local receipt snapshots. */
  onWorkReceipt?: (receipt: AcpWorkReceipt) => void;
  /** Captures the initiating context and returns that turn's archival observer. */
  onTurnStarted?: (turn: AcpTurnStart) => ((turn: AcpTurnCompletion) => void | Promise<void>) | null;
  /** Captures bounded local evidence after the turn exists but before any prompt reaches the actor. */
  captureTaskBaseline?: (turn: AcpTurnStart) => Promise<TaskBaselineCaptureResult>;
  /**
   * Lets the screen answer a permission request itself. Return a short note (what was
   * allowed, for the transcript) to allow the request at once without a card; return null
   * to ask the person as before. The Library uses it for a wiki page that fits the
   * contract (owner direction 2026-09-07: agents act, people can step in — not every write
   * waits). An ontology write never comes here: the caller's judge does not know nodes.
   *
   * Return `{ reject: reason }` to refuse without a card. An unattended Library round runs
   * with nobody at the screen (decision 2026-09-17), so for it "ask" is not an answer: what
   * its standing scope does not allow is refused, and the transcript names the refusal so
   * the ledger can.
   */
  autoDecide?: (request: AcpPermissionRequest) => string | { reject: string } | null;
  /**
   * A paragraph the consumer appends after the vault handoff, for the rules that hold only on
   * its own screen. The Library adds how an answer must cite so it can be filed as a page
   * (2026-09-19): a free question typed into its composer went out with no citation rule, the
   * agent answered in prose, and "Save answer" refused the answer as `no-cited-fact`.
   */
  systemPromptAppendix?: string | null;
  /**
   * Whether opening this panel **continues where the folder left off** instead of starting a
   * blank conversation.
   *
   * Owner, installed app, 2026-09-08: *"every time I press X and go back into the agent it is a
   * new conversation — I cannot pick the one I was having and carry on. The previous, latest
   * conversation should always open."* The pieces were already here (`session/list`,
   * `session/load`, the history door); nothing consulted them until a person pressed the history
   * button, and the history button only exists once a session has already opened — so the first
   * screen a returning person saw was always empty.
   *
   * With this on, the first `start()` of this panel asks the adapter for this folder's
   * conversations and resumes the newest one. Failure is not fatal in either direction: an
   * adapter with no `session/list`, a folder with no past conversation, or a `session/load` that
   * refuses all fall through to a new conversation, which is what happened before this option
   * existed. Nothing leaves the machine — the list is the adapter's own, for this folder only
   * (`keepSessionsInFolder`).
   *
   * A person who presses **New conversation** has answered the question themselves, so this stops
   * applying for the rest of that panel's life.
   */
  resumeLatest?: boolean;
}

export interface AcpTurnStart {
  runtimeId: string;
  sessionId: string;
  vaultRoot: string | null;
  userEventId: string;
  text: string;
  startedAt: string;
}

export interface AcpTurnCompletion extends AcpTurnStart {
  endedAt: string;
  outcome: 'completed' | 'cancelled' | 'failed';
  stopReason: string | null;
  events: readonly AcpEvent[];
}

const RECEIPT_REQUEST_LIMIT = 160;

function receiptRequestSummary(value: string | null): string {
  const oneLine = (value ?? '').replace(/\s+/g, ' ').trim();
  return oneLine ? oneLine.slice(0, RECEIPT_REQUEST_LIMIT) : 'Ontology write request';
}

function workReceipt({
  request,
  sessionId,
  runtimeId,
  userRequest,
  origin,
  decision,
  result,
  at,
}: {
  request: AcpPermissionRequest;
  sessionId: string | null;
  runtimeId: string;
  userRequest: string | null;
  origin: PendingPermission['origin'];
  decision: AcpWorkDecision;
  result: AcpWorkResult;
  at: string;
}): AcpWorkReceipt {
  const changeSet = buildOntologyChangeSet(request.toolName ?? 'ontology-write', request.rawInput);
  const toolCallId = request.toolCallId ?? `${changeSet.toolName}:${at}`;
  const explicitOrigin = origin?.turn
    && origin.turn.vaultRoot
    && request.sessionId === origin.turn.sessionId
    && request.requestId !== undefined && request.requestId !== null
    && request.toolCallId
      ? {
          vaultId: origin.turn.vaultRoot,
          sessionGeneration: origin.sessionGeneration,
          sessionId: origin.turn.sessionId,
          userEventId: origin.turn.userEventId,
          requestId: request.requestId,
          toolCallId: request.toolCallId,
        }
      : null;
  return {
    v: 1,
    id: `${sessionId ?? 'session'}:${toolCallId}`,
    at,
    updatedAt: at,
    agent: runtimeId,
    request: receiptRequestSummary(userRequest),
    tool: changeSet.toolName,
    decision,
    result,
    items: changeSet.items.map((item) => ({
      target: item.target,
      operation: changeSet.operation,
      relation: item.relation
        ? { from: item.relation.from, type: item.relation.type, to: item.relation.to }
        : null,
      fields: item.fields.map((field) => field.key),
    })),
    ...(explicitOrigin ? { origin: explicitOrigin } : {}),
    ...(explicitOrigin && request.writerCorrelation ? {
      writerCorrelation: { ...request.writerCorrelation, terminal: decision === 'allowed' ? 'pending' as const : 'not-observed' as const },
    } : {}),
  };
}

function terminalMatchesWriter(update: Record<string, unknown>, receipt: AcpWorkReceipt): boolean {
  const meta = update._meta && typeof update._meta === 'object' && !Array.isArray(update._meta)
    ? update._meta as Record<string, unknown> : null;
  if (meta?.is_mcp_tool_call !== true) return true;
  const raw = update.rawInput && typeof update.rawInput === 'object' && !Array.isArray(update.rawInput)
    ? update.rawInput as Record<string, unknown> : null;
  const correlation = receipt.writerCorrelation;
  return Boolean(correlation && raw?.server === correlation.server && raw.tool === correlation.tool);
}

/**
 * A paragraph **appended to** the session's start instructions.
 *
 * Why it is needed: the vault has a slot for the reason behind a relation (`why`) and `depends_on`
 * requires it, yet measured 2026-08-16, all 15 activity-log lines in a live vault had an empty
 * `why`.
 *
 * Moving the conversation into the app does not fill it — the same measurement showed that too
 * (in-app chat can already write `why`, and only 6.5% of the vault had it). **What fills it is the
 * instruction, not the slot.**
 *
 * It is appended rather than replacing the default instructions: those instructions are what make
 * that tool itself, and we have no grounds to rewrite them.
 */
/**
 * Where the answer-language rule is spliced in.
 *
 * ⚠️ **"the language the person wrote in" has a hole, and a button falls straight through it.**
 * That was the whole rule until 2026-09-09. It works for anything typed into the composer and
 * fails for everything started by pressing something: the architecture workbench's source check,
 * the insights tab's "analyse with AI", the map's meaning review. Those send a prompt this app
 * wrote, in English, and the person wrote nothing at all — so the most recent language in the
 * conversation is English and the agent answers in English.
 *
 * Measured on the installed app at /ko/architecture: pressing the source-check button returned
 * a full report opening "92 unmapped edges. The brief reports the count but not their identity"
 * to a Korean interface, on a Korean vault, with every visible label in Korean.
 *
 * So the interface language is stated outright, and what the person types still overrides it —
 * someone writing English into a Korean build is asking for English.
 */
const ANSWER_LANGUAGE_SLOT = '__ANSWER_LANGUAGE__';

/** The language name in English, so the instruction reads to the model as an instruction. */
function languageName(locale: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) ?? locale;
  } catch {
    return locale;
  }
}

function answerLanguageSentence(locale: string): string {
  const name = languageName(locale);
  return `Answer in ${name} — that is the language this person's interface is set to, and it is the language of the folder they are looking at. If they write to you in another language, follow theirs instead. This matters most when the request arrived from a button rather than something they typed: there is no message of theirs to take the language from, and the instruction you are reading is itself in English.`;
}

const VAULT_HANDOFF_BASE = [
  'You are working inside an Ontology Atlas vault opened in the Atlas app.',
  /*
   * **State the order.** Left unsaid, the agent invents its own, and that order is usually
   * "create first, explain later" — which is what the measurement showed.
   */
  'Work in this order: (1) orient with `connection_info` and `list_kinds`, and on a large vault do not dump every node; (2) before creating anything, look for what is already there with `query_ontology` `similar_nodes` or `find_evidence`, and if something close exists, say what you found and ask whether to extend it before making a second node for the same idea; (3) write only after the shape is settled, preferring `patch_concept` on an existing node over a new one.',
  'When the person asks you to find or show one concept, resolve its exact slug and call `get_concept`. When they ask how two concepts connect, resolve both exact slugs and call `find_path`, even if you can answer from context. Atlas uses those exact read calls to move and highlight the map; never guess a slug.',
  'Whenever you add or change a relation, put the reason in the `why` field, in the person\'s own words — what they asked for, not what the tool did. Write "고객이 결제를 되돌릴 수 있어야 한다고 해서", not "added depends_on edge".',
  /*
   * **Ask when unsure.** This one line changed the most in the measurement — without it the agent
   * created a node the user may not have wanted and then asked afterwards, "shall I merge these if
   * they are the same?". A node is more expensive to remove than to create.
   */
  'If you are unsure whether two things are the same concept, that is a question for the person, not a judgement call for you. Ask first: an extra node is harder to remove than to add.',
  ANSWER_LANGUAGE_SLOT,
  /*
   * ⚠️ **Say what happened, do not paste what came back** (owner's screen, 2026-08-24: *"there are
   * times it shows the user `{}` JSON like this — that should not happen, right? an explanation is
   * what is needed, not the shape"*).
   *
   * A tool result is a machine answer. Pasted into the conversation it hands the person the exact
   * material this product exists to translate — Atlas's whole promise is that meaning is judged in
   * plain files and plain sentences. The person opening this panel is often not the one who knows
   * what `{"ok":true,"changed":true}` means, and quoting it makes them feel the tool is talking
   * past them.
   *
   * The raw value is not forbidden — it is demoted. Say the outcome first, in their language, and
   * keep the payload for when they ask for it.
   */
  'Report results as sentences, not as payloads. Say what changed in this folder and what it means for the person; do not paste raw tool output, JSON, or field names into your answer unless they explicitly ask to see it. If a tool fails, say what did not happen and what they can do, not the error object.',
  /*
   * Plain language is a product promise, not a style note: the map, the vault and this panel all
   * exist so that someone who does not know the vocabulary can still judge the meaning.
   */
  'Prefer ordinary words over jargon. When a term from this product is unavoidable (concept, capability, element, relation), say it once in plain words the first time you use it in a conversation.',
  'Keep your work inside this folder. If something genuinely needs a path outside it, say so before trying.',
];
/**
 * ⚠️ **Only claim it is wired when it is** (caught in review, 2026-08-16).
 *
 * This sentence used to be attached unconditionally. But an empty server list really does happen
 * (no binary in the bundle, or not ready yet) — and then a session with no tools at all is given an
 * instruction **insisting it is already connected**. The agent hunts for tools that do not exist,
 * produces strange answers, and the user has no way to know why.
 */
const VAULT_MCP_SENTENCE =
  'The `atlas-vault` MCP server is already connected to this exact folder. Use it for everything about this graph. Do not shell out, list directories, or open the markdown files yourself to find your way around — the tools already answer those questions, and reading the files by hand is how stale and duplicated nodes get made. When you report counts, keep their units explicit and treat `query_ontology` health `relationCensus` as the authority: MCP `graph.edges` and `internalEdges` count compiled frontmatter relation declarations, so parent and child declarations can describe the same containment twice; the map\'s canonical relation census counts deduplicated normalized typed edges across the loaded ontology, not the current view filter. The MCP process does not know that app-side numeric census. Neither number is wrong, and never present them as the same census.';

/**
 * Construction is a different path from ordinary one-node editing. This is a routing
 * instruction, not a qualification result, and it never grants write authority — every write it
 * leads to still stops at the permission card.
 *
 * ⚠️ **It used to route every build into the bulk qualification lifecycle, which cannot finish
 * here.** Reproduced on the app's own first-run path (the 「build a first ontology」 door, this
 * handoff, the atlas-vault MCP) against an unfamiliar repository: turn 1 surveyed for 41 s and
 * wrote nothing; after the person said "go ahead and build all of it", turn 2 spent 146 s and
 * $3.23 authoring a full `analyze_repo_structure` proposal, got `canWrite:false` because an app
 * session has no independent evaluator, and stopped with the vault still empty — the small-batch
 * path was mentioned only afterwards, so a third "go" was needed before any node existed.
 *
 * So the sentence now describes one path that completes in this session, and names the bulk
 * route once as the thing a terminal run with a separate evaluator lane can take.
 */
const VAULT_CONSTRUCTION_SENTENCE =
  'When the person asks you to build or rebuild an ontology from this repository: verify `connection_info` and read the construction card in its `guide`; survey with `analyze_repo_structure` (no proposal) and `index_project`, plus `infer_imports` where structure does not say what depends on what; propose in plain sentences — each candidate one definition sentence, what it includes and excludes, and the file proving it — preferring few well-evidenced concepts to many thin ones; then wait for the person. Once they agree, write in reviewed batches of at most 12: `add_concepts`, bodies carrying the definition and Includes/Excludes, `path:` naming a file; `add_relations`, each with a `why`; then `validate_vault`, `connect_project_source`, and `finalize_project_meaning`. Answer every warning by the repair it names, or say why not. This session does not have an independent evaluator, and the bulk `analyze_repo_structure` writePlan route needs one, so do not author a qualification proposal or wait for `canWrite` here; it stays open to a terminal run with one. Do not fabricate an evaluator.';

function vaultHandoffPrompt(hasVaultMcp: boolean, locale: string): string {
  const rules = hasVaultMcp
    ? [VAULT_HANDOFF_BASE[0], VAULT_MCP_SENTENCE, VAULT_CONSTRUCTION_SENTENCE, ...VAULT_HANDOFF_BASE.slice(1)]
    : VAULT_HANDOFF_BASE;
  return rules.map((rule) => (rule === ANSWER_LANGUAGE_SLOT ? answerLanguageSentence(locale) : rule)).join(' ');
}

/** The consumer's own paragraph after the handoff, or the handoff alone when it has none. */
function withAppendix(handoff: string, appendix: string | null): string {
  const extra = appendix?.trim();
  return extra ? `${handoff} ${extra}` : handoff;
}

/** The value before anything is known. "None" and "not offered" share one screen. */
const EMPTY_CHOICES: AcpSessionChoices = {
  models: [],
  currentModelId: null,
  modes: [],
  currentModeId: null,
  unverifiedModeIds: [],
  droppedModeCount: 0,
};

let eventSeq = 0;
const nextEventId = () => `acp-evt-${(eventSeq += 1)}`;

/**
 * Cap on collected stderr lines. The adapter emits install progress too, so keeping all of it
 * becomes noise again — the first few lines state the cause.
 */
const STDERR_KEEP_LIMIT = 8;
const TERMINAL_TOOL_STATES = new Set(['completed', 'failed', 'cancelled']);

export function useAcpSession({
  runtimeId,
  vaultRoot,
  mcpServers,
  approvalSettleMs = 0,
  onWorkReceipt,
  onTurnStarted,
  captureTaskBaseline,
  autoDecide,
  systemPromptAppendix = null,
  resumeLatest = false,
}: UseAcpSessionOptions) {
  /*
   * The interface language, handed to the agent so a button-started turn has one to answer in.
   * See {@link ANSWER_LANGUAGE_SLOT}.
   */
  const locale = useLocale();
  const currentTurnScopeRef = useRef({ runtimeId, vaultRoot });
  useLayoutEffect(() => {
    currentTurnScopeRef.current = { runtimeId, vaultRoot };
  }, [runtimeId, vaultRoot]);
  const [status, setStatus] = useState<AcpSessionStatus>('idle');
  /*
   * ⚠️ When the open turn last spoke, so the screen can tell "still working" from "stopped
   * answering". `prompt` is deliberately given no timeout, so a turn that ends without a result
   * would otherwise hold the composer shut forever with nothing on screen saying why
   * (`turn-liveness.ts`, measured in the installed rc.11 build).
   */
  const [lastTurnUpdateAt, setLastTurnUpdateAt] = useState<number | null>(null);
  /*
   * Status is held in a ref as well: the moment the adapter dies (`onExit`) is outside render, so a
   * closure sees a stale value. What is needed there is the status **at that moment** — was a turn
   * in progress (died mid-answer) or had it simply finished?
   */
  const statusRef = useRef<AcpSessionStatus>('idle');
  /**
   * First-download indicator — `null` means nothing is downloading.
   *
   * Why (owner's real machine, 2026-08-19): the adapter's first run has npx fetch tens of MB while
   * the screen showed only a "starting" chip. The user thought it had hung, quit the app — and that
   * interruption left a half-built npx cache that made it never start again (self-healing lives on
   * the Rust side, `acp.rs`). So this indicator is not decoration; it removes that accident's trigger.
   *
   * `mb` is the measured size the cache directory has grown to (`npx-download-progress:<mb>` on
   * `acp://notice`). The total size is unknown, so a percentage is **not invented** — it states only
   * what has been received. While only the first notice has arrived, `mb` is `null`.
   */
  const [download, setDownload] = useState<{ mb: number | null } | null>(null);
  const setStatusTracked = useCallback((next: AcpSessionStatus) => {
    statusRef.current = next;
    setStatus(next);
    // The download indicator lives only in "starting" — ready or dead, it is over.
    if (next !== 'starting') setDownload(null);
  }, []);
  const [events, setEvents] = useState<AcpEvent[]>([]);
  const eventsRef = useRef<AcpEvent[]>([]);
  const updateEvents = useCallback((update: (previous: AcpEvent[]) => AcpEvent[]) => {
    const next = update(eventsRef.current);
    eventsRef.current = next;
    setEvents(next);
  }, []);
  const activeTurnRef = useRef<{
    start: AcpTurnStart;
    observer: ((turn: AcpTurnCompletion) => void | Promise<void>) | null;
    cancelRequested: boolean;
    taskBaseline: TaskBaselineCaptureResult | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Commands the agent found in this folder — putting skills in the vault makes them appear here. */
  const [slashCommands, setSlashCommands] = useState<AcpSlashCommand[]>([]);
  /**
   * Clues the adapter left, surfaced **only when something goes wrong**. Shown routinely it is not
   * a diagnosis but an English warning eating the screen (measured).
   */
  const [diagnostics, setDiagnostics] = useState<readonly string[]>([]);
  /**
   * Collects diagnostic lines — **never put into the conversation.**
   *
   * What lived in this slot really appeared on screen like this (review 2026-08-16):
   * `UNPARSABLE:{"JSONRPC":"2.0","ID":7,…` and `SEND-FAILED: …`, in fixed-width caps in the middle
   * of the conversation. Not for a person to read, and nothing to do about it if they did.
   */
  const resetDiagnostics = useCallback(() => {
    stderrRef.current = [];
    setDiagnostics([]);
  }, []);
  const keepDiagnostic = useCallback((line: string) => {
    const text = line.trim();
    if (!text) return;
    const kept = stderrRef.current;
    if (kept.length >= STDERR_KEEP_LIMIT) return;
    kept.push(text);
    setDiagnostics([...kept]);
  }, []);
  const [pending, setPending] = useState<PendingPermission | null>(null);
  /** An ontology write the person allowed, awaiting that ACP tool's completion signal. */
  const [approvedOntologyWrite, setApprovedOntologyWrite] =
    useState<AcpPermissionRequest | null>(null);
  /** Past conversations in this folder. **Only this folder's** (`keepSessionsInFolder`). */
  const [sessions, setSessions] = useState<AcpSessionSummary[]>([]);
  /**
   * What this session can choose from. It differs per adapter — measured: codex offers 33 models,
   * claude offers **none at all** (`session/set_model` returns "no such method"). So the screen does
   * not guess a count and draws **only what arrived**.
   */
  const [choices, setChoices] = useState<AcpSessionChoices>(EMPTY_CHOICES);

  const clientRef = useRef<AcpClient | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  /** The conversation the next `start()` resumes. Used once, then cleared. */
  const resumeIdRef = useRef<string | null>(null);
  /**
   * Has the person asked for a blank conversation? Then `resumeLatest` stops applying.
   *
   * Without this flag the two features cancel each other out: `switchSession(null)` clears
   * `resumeIdRef` to mean "a new one", and a `start()` that then looks up the latest conversation
   * would resume the very conversation the person just left. New conversation has to be able to
   * mean new.
   */
  const freshRequestedRef = useRef(false);
  const resumeLatestRef = useRef(resumeLatest);
  useEffect(() => {
    resumeLatestRef.current = resumeLatest;
  }, [resumeLatest]);
  /** Are we starting right now? `clientRef` is filled only after everything finishes, so it is late. */
  const startingRef = useRef(false);
  /** Collected stderr — surfaced only when something goes wrong. */
  const stderrRef = useRef<string[]>([]);
  /**
   * Generation counter — incremented on every `stop()`.
   *
   * **Closing mid-start** made `stop()` clean up something that did not exist yet and return, after
   * which `start()` ran on and **created the process and client anyway** — the adapter kept running
   * behind a closed screen (a test caught this).
   *
   * So `start()` checks after every await whether its generation is still current, and if not
   * **cleans up what it created itself** and bails.
   */
  const generationRef = useRef(0);
  /*
   * `switchSession` calls both `start` and `stop`, and those two do not take each other as
   * dependencies (a cycle). A ref breaks one step — call the latest without creating the dependency.
   */
  const startRef = useRef<(() => Promise<void>) | null>(null);
  const autoDecideRef = useRef<UseAcpSessionOptions['autoDecide']>(undefined);
  const systemPromptAppendixRef = useRef<string | null>(systemPromptAppendix);
  const stopRef = useRef<(() => Promise<void>) | null>(null);
  const acpSessionRef = useRef<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const disposedRef = useRef(false);
  /** The resolver of a permission request awaiting an answer — closed with a rejection on cleanup. */
  const pendingResolverRef = useRef<((optionId: string | null) => void) | null>(null);
  /**
   * Serializes concurrent permission requests (2026-09-01 review). The adapter can issue two
   * `session/request_permission`s in one turn (parallel tool calls, an elicitation overlapping a
   * built-in-tool permission), and with a single resolver slot the second card overwrote the
   * first: its resolver became unreachable, its JSON-RPC id was never answered, and the agent
   * hung on the unanswered request for the rest of the session. Each ask now waits for the
   * previous card to settle before presenting.
   */
  const askChainRef = useRef<Promise<unknown>>(Promise.resolve());
  /** Timer that hands control back to ACP after the approval confirm motion. Always cancelled when the window closes. */
  const permissionDecisionTimerRef = useRef<number | null>(null);
  /** Held alongside state so the `tool_call_update` callback reads the latest approval target. */
  const approvedOntologyWriteRef = useRef<AcpPermissionRequest | null>(null);
  const approvedReceiptRef = useRef<{
    toolCallId: string | null;
    receipt: AcpWorkReceipt;
  } | null>(null);
  const latestUserRequestRef = useRef<string | null>(null);
  const onWorkReceiptRef = useRef(onWorkReceipt);

  useEffect(() => {
    onWorkReceiptRef.current = onWorkReceipt;
  }, [onWorkReceipt]);

  const emitWorkReceipt = useCallback((receipt: AcpWorkReceipt) => {
    try {
      onWorkReceiptRef.current?.(receipt);
    } catch {
      // A local audit write must never strand the ACP permission response.
    }
  }, []);

  const setApprovedOntologyWriteTracked = useCallback(
    (request: AcpPermissionRequest | null) => {
      approvedOntologyWriteRef.current = request;
      setApprovedOntologyWrite(request);
    },
    [],
  );

  const push = useCallback((event: AcpEvent) => {
    updateEvents((prev) => {
      const last = prev[prev.length - 1];
      // Text fragments are **appended** rather than becoming a new bubble per line — one sentence
      // arrives in several fragments.
      if (last && (event.kind === 'agent' || event.kind === 'thought') && last.kind === event.kind) {
        return [...prev.slice(0, -1), { ...last, text: last.text + event.text }];
      }
      return [...prev, event];
    });
  }, [updateEvents]);

  const finishTurn = useCallback((outcome: AcpTurnCompletion['outcome'], stopReason: string | null) => {
    const active = activeTurnRef.current;
    if (!active) return;
    activeTurnRef.current = null;
    if (!active.observer) return;
    const index = eventsRef.current.findIndex((event) => event.kind === 'user' && event.id === active.start.userEventId);
    const completion: AcpTurnCompletion = {
      ...active.start,
      endedAt: new Date().toISOString(),
      outcome: active.cancelRequested ? 'cancelled' : outcome,
      stopReason,
      events: (index < 0 ? [] : eventsRef.current.slice(index)).map((event) => ({ ...event })),
    };
    // Archival failure must not retry the prompt or turn a successful model
    // response into an ACP transport error. The caller owns save/retry UI.
    try {
      void Promise.resolve(active.observer(completion)).catch((error) => {
        keepDiagnostic(`analysis-archive: ${error instanceof Error ? error.message : String(error)}`);
      });
    } catch (error) {
      keepDiagnostic(`analysis-archive: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [keepDiagnostic]);

  /**
   * **The screen stops claiming a gate it no longer has.**
   *
   * One sentence, two ways to arrive at it: the adapter moved a standing session
   * (`current_mode_update`), or the session opened in such a mode already. Both are the same fact
   * about the same conversation, so both say it the same way; `reason` separates them in the folded
   * diagnostics, where a person looking for the cause will read it.
   *
   * ⚠️ **It is not the `gate-off` sentence** (council, 2026-09-05). That one reads *"Atlas cannot
   * ask you before a file outside this folder is touched. The tool follows the settings you gave it
   * directly"* — and on these two paths **both halves are wrong**. The person gave no such setting;
   * the adapter moved the session on its own. And the mode it moves into accepts edits **inside**
   * the folder, which is the half the outside-the-folder sentence never mentions. `gate-off` keeps
   * its own job: the isolated configuration could not be written.
   *
   * The mode is named verbatim so the sentence points at something the person can find in the tool
   * itself, and the reassurance about the Atlas server checkpoint is attached **only when that
   * checkpoint is actually on** (`vaultWriteConsentOn`) — for a config-isolated runtime it is
   * deliberately switched off, and promising it there would be a sentence the machinery does not
   * keep.
   */
  const noteModeMoved = useCallback(
    (modeId: string, reason: string) => {
      push({
        kind: 'notice',
        id: nextEventId(),
        text: 'mode-moved',
        mode: modeId,
        serverGate: vaultWriteConsentOn(mcpServers),
      });
      keepDiagnostic(`gate-off:${reason}`);
    },
    [keepDiagnostic, mcpServers, push],
  );

  const applyUpdate = useCallback(
    (update: Record<string, unknown>, updateContext: { sessionId: string | null }) => {
      if (!updateContext.sessionId || updateContext.sessionId !== sessionIdRef.current) return;
      // Any update at all counts as the turn speaking; what it says does not matter here.
      setLastTurnUpdateAt(Date.now());
      const kind = typeof update.sessionUpdate === 'string' ? update.sessionUpdate : '';
      const content = update.content as { text?: unknown } | undefined;
      const text = typeof content?.text === 'string' ? content.text : '';

      if (kind === 'available_commands_update') {
        // What `/` can invoke. It holds **only what arrived** — with nothing, typing `/` in the
        // composer does nothing (`slash-commands.ts`).
        setSlashCommands(readSlashCommands(update));
        return;
      }
      if (kind === 'current_mode_update') {
        /*
         * ⚠️ **The adapter moves the session on its own, and this used to be dropped on the floor.**
         *
         * Read from `claude-agent-acp` 0.74.0 `dist/session-mode.js` (2026-09-05):
         * `AUTO_MODE_FALLBACK = "acceptEdits"`. Choosing `auto` on a model without `supportsAutoMode`
         * — or switching to such a model mid-conversation — silently moves the session there and
         * announces it with nothing but this notification. Ignoring it left the dropdown stating a
         * mode the session had already left, on the one value that decides whether a person is asked
         * before something outside the folder is touched.
         *
         * So two things happen, and they are separate. The state follows the session
         * (`applyCurrentMode`), and when the verdict says the new mode removes the gate the screen
         * **says so in the sentence it already has** — the same `gate-off` notice raised when the
         * isolated config could not be written. The detail is kept as a diagnostic beside it.
         */
        const modeId = typeof update.currentModeId === 'string' ? update.currentModeId.trim() : '';
        if (!modeId) return;
        setChoices((prev) => applyCurrentMode(prev, modeId));
        if (!modeKeepsGate(modeId)) noteModeMoved(modeId, `mode-clamped:${modeId}`);
        return;
      }
      if (kind === 'agent_message_chunk' && text) {
        push({ kind: 'agent', id: nextEventId(), text });
        return;
      }
      if (kind === 'agent_thought_chunk' && text) {
        push({ kind: 'thought', id: nextEventId(), text });
        return;
      }
      if (kind === 'tool_call') {
        push({
          kind: 'tool',
          id: typeof update.toolCallId === 'string' ? update.toolCallId : nextEventId(),
          title: typeof update.title === 'string' ? update.title : '',
          toolKind: typeof update.kind === 'string' ? update.kind : 'other',
          status: typeof update.status === 'string' ? update.status : 'pending',
          rawInput: update.rawInput,
          // A call that arrives already finished carries its answer here rather than in a
          // later update, and the row has to be able to say what came back either way.
          rawOutput: update.rawOutput,
        });
        return;
      }
      if (kind === 'tool_call_update') {
        const id = typeof update.toolCallId === 'string' ? update.toolCallId : null;
        const nextStatus = typeof update.status === 'string' ? update.status : null;
        if (!id) return;
        const nextTitle = typeof update.title === 'string' ? update.title : null;
        const nextToolKind = typeof update.kind === 'string' ? update.kind : null;
        const hasRawInput = update.rawInput !== undefined;
        const hasRawOutput = update.rawOutput !== undefined;
        // claude-agent-acp sends streamed tool_use as a pending row first,
        // and when input is complete, sends rawInput via **status-less** tool_call_update.
        // Merging only the status leaves only the tool name on screen, while the exact target and map intent
        // remain permanently empty. Overwrite existing fields with only the fields actually carried by the update.
        updateEvents((prev) =>
          prev.map((event) => {
            if (event.kind !== 'tool' || event.id !== id) return event;
            return {
              ...event,
              ...(nextStatus ? { status: nextStatus } : {}),
              ...(nextTitle ? { title: nextTitle } : {}),
              ...(nextToolKind ? { toolKind: nextToolKind } : {}),
              ...(hasRawInput ? { rawInput: update.rawInput } : {}),
              ...(hasRawOutput ? { rawOutput: update.rawOutput } : {}),
            };
          }),
        );
        if (!nextStatus) return;
        const approvedReceipt = approvedReceiptRef.current;
        if (
          TERMINAL_TOOL_STATES.has(nextStatus) &&
          approvedOntologyWriteRef.current?.toolCallId === id
        ) {
          const receiptMatches = approvedReceipt?.toolCallId === id;
          const originMatches = !approvedReceipt?.receipt.origin
            || approvedReceipt.receipt.origin.sessionId === updateContext.sessionId;
          const writerMatches = !approvedReceipt?.receipt.writerCorrelation
            || terminalMatchesWriter(update, approvedReceipt.receipt);
          if (approvedReceipt && receiptMatches && originMatches && writerMatches) {
            const result: AcpWorkResult =
              nextStatus === 'completed'
                ? 'completed'
                : nextStatus === 'failed'
                  ? 'failed'
                  : 'cancelled';
            emitWorkReceipt({
              ...approvedReceipt.receipt,
              updatedAt: new Date().toISOString(),
              result,
              ...(approvedReceipt.receipt.writerCorrelation ? {
                writerCorrelation: { ...approvedReceipt.receipt.writerCorrelation, terminal: result as 'completed' | 'failed' | 'cancelled' },
              } : {}),
            });
            approvedReceiptRef.current = null;
          }
          // Legacy receipts have no explicit origin/correlation. Their same live session + tool id
          // still closes the old UI state, but remains unverified because no provenance is added.
          if (!approvedReceipt || (receiptMatches && originMatches && writerMatches)) {
            setApprovedOntologyWriteTracked(null);
          }
        }
      }
    },
    [emitWorkReceipt, noteModeMoved, push, setApprovedOntologyWriteTracked, updateEvents],
  );

  /** Creates the promise that waits until the screen answers. Concurrent asks queue up. */
  const askUser = useCallback((request: AcpPermissionRequest) => {
    request = snapshotPermissionRequest(request);
    const generation = generationRef.current;
    const activeStart = activeTurnRef.current?.start ?? null;
    const origin = {
      sessionGeneration: generation,
      turn: activeStart
        ? { sessionId: activeStart.sessionId, vaultRoot: activeStart.vaultRoot, userEventId: activeStart.userEventId, text: activeStart.text }
        : null,
      task: activeStart
        ? { outcome: activeStart.text, nonGoals: null, structure: 'unstructured' as const }
        : null,
      taskBaseline: activeTurnRef.current?.taskBaseline ?? null,
    };
    const present = () => new Promise<string | null>((resolve) => {
      // A question that waited in the queue may outlive its session: answered-by-nobody beats
      // presenting a card for a conversation that is already stopped or dead.
      if (generationRef.current !== generation || statusRef.current === 'exited') {
        resolve(null);
        return;
      }
      if (request.reviewKind === 'ontology-write' && (
        !origin.turn
        || request.requestId == null
        || request.sessionId !== origin.turn.sessionId
        || origin.turn.vaultRoot !== vaultRoot
      )) {
        resolve(null);
        return;
      }
      // The screen may already know the answer: a wiki page that fits its contract lands
      // without a card, and the transcript says so where the card would have stood.
      const decided = request.reviewKind === 'permission' ? (autoDecideRef.current?.(request) ?? null) : null;
      if (decided !== null && typeof decided === 'object') {
        push({ kind: 'notice', id: nextEventId(), text: 'auto-refused', detail: decided.reject });
        resolve(null);
        return;
      }
      const note = decided;
      const allow = note !== null ? request.options.find((option) => option.kind === 'allow_once') : undefined;
      if (note !== null && allow) {
        push({ kind: 'notice', id: nextEventId(), text: 'auto-allowed', detail: note });
        resolve(allow.optionId);
        return;
      }
      pendingResolverRef.current = resolve;
      setPending({
        request,
        origin,
        resolve: (optionId) => {
          const selectedKind = request.options.find((option) => option.optionId === optionId)?.kind;
          const ontologyWrite = request.reviewKind === 'ontology-write' && Boolean(request.toolName);
          if (ontologyWrite) {
            const decision: AcpWorkDecision = selectedKind === 'allow_once' ? 'allowed' : 'rejected';
            const at = new Date().toISOString();
            const receipt = workReceipt({
              request,
              sessionId: sessionIdRef.current,
              runtimeId,
              userRequest: latestUserRequestRef.current,
              origin,
              decision,
              result: decision === 'allowed' ? 'pending' : 'not-run',
              at,
            });
            emitWorkReceipt(receipt);
            approvedReceiptRef.current = decision === 'allowed'
              ? { toolCallId: request.toolCallId, receipt }
              : null;
          }
          const settlesBeforeWrite =
            request.reviewKind === 'ontology-write' &&
            selectedKind === 'allow_once' &&
            approvalSettleMs > 0;
          setApprovedOntologyWriteTracked(
            request.reviewKind === 'ontology-write' && selectedKind === 'allow_once'
              ? request
              : null,
          );
          setPending(null);
          if (settlesBeforeWrite) {
            permissionDecisionTimerRef.current = window.setTimeout(() => {
              permissionDecisionTimerRef.current = null;
              pendingResolverRef.current = null;
              resolve(optionId);
            }, approvalSettleMs);
            return;
          }
          pendingResolverRef.current = null;
          resolve(optionId);
        },
      });
    });
    const result = askChainRef.current.then(present, present);
    // The chain must survive any outcome, or one settled question blocks every later one.
    askChainRef.current = result.catch(() => null);
    return result;
  }, [approvalSettleMs, emitWorkReceipt, push, runtimeId, setApprovedOntologyWriteTracked, vaultRoot]);

  const start = useCallback(async () => {
    if (!isAcpBridgeAvailable() || !vaultRoot) return;
    /*
     * ⚠️ **The lock is taken before the first `await`** (found by measurement, 2026-08-16).
     *
     * The old lock was `clientRef.current` alone, and that value is filled only **after** the
     * process is spawned and the events are attached. A second `start()` in that window passes the
     * lock too, and **two adapters start**.
     *
     * It really happened — two adapters for one conversation:
     * ```
     * 83796  npm exec @agentclientprotocol/claude-agent-acp@0.68.0
     * 83797  npm exec @agentclientprotocol/claude-agent-acp@0.68.0
     * ```
     * `sessionIdRef` then points at the later one while the lines travel over the earlier, so
     * talking to it dies with `Session not found`. And the first process becomes a ghost nobody stops.
     *
     * There is more than one reason it gets called twice — development mode's double invocation, and
     * `mcpServers` being a new array every render, which changes `start`'s identity. So **fixing the
     * caller is not enough**: the lock lives here.
     */
    if (clientRef.current || startingRef.current) return;
    startingRef.current = true;
    const generation = generationRef.current;
    /** Did someone close this after I started? */
    const stale = () => generationRef.current !== generation;
    setStatusTracked('starting');
    setError(null);
    try {
      const acpSessionId = await startAcpSession(runtimeId, vaultRoot);
      if (!acpSessionId) throw new Error('bridge-unavailable');
      // Closed while waiting — **stop what I started.**
      if (stale()) {
        await stopAcpSession(acpSessionId);
        return;
      }
      acpSessionRef.current = acpSessionId;

      let onLine: ((line: string) => void) | null = null;
      const transport: AcpTransport = {
        send: (line) => sendAcpLine(acpSessionId, line),
        subscribe: (cb) => {
          onLine = cb;
          return () => {
            onLine = null;
          };
        },
      };

      // A new session collects diagnostics afresh — clues from the previous session mislead.
      resetDiagnostics();
      unlistenRef.current = await listenToAcpSession(acpSessionId, {
        onMessage: (line) => onLine?.(line),
        // stderr is diagnosis, not conversation. It is not silently discarded, but it does not
        // become a bubble either — the adapter's install log in the conversation is unreadable.
        onNotice: (message) => {
          /*
           * The three first-download notices (sent by Rust `acp_start`):
           * - `npx-first-run-download[…]` — the download has started. Also kept as a diagnostic: if
           *   it dies mid-download, this line is the clue.
           * - `npx-download-progress:<mb>` — measured MB received so far. **Not kept as a
           *   diagnostic** — it arrives every second, and filling the 8-line cap with it pushes the
           *   real clue out.
           * - `npx-download-done` — download finished; from here it is an ordinary "starting".
           */
          if (message.startsWith('npx-download-progress:')) {
            // Builds the indicator here even if the first notice was missed — Rust assumes the first
            // notice can go out before the subscription attaches and uses the progress notice as
            // that safety net. The screen does not draw it outside "starting" (a render condition),
            // so a late notice is harmless.
            const mb = Number(message.slice('npx-download-progress:'.length));
            setDownload({ mb: Number.isFinite(mb) ? mb : null });
            /*
             * ⚠️ **A download in flight is not a hang** (owner's installed app, 2026-08-24).
             *
             * The handshake has a 45s ceiling. The first launch of a tool spends far longer than
             * that inside `npx` — measured 274 MB for `codex-acp` — and nothing answers
             * `initialize` until it lands. So the ceiling expired, the child was killed **mid
             * download**, and the panel said "the tool is not responding". The next try deleted the
             * half-built cache and restarted the same 274 MB, failing at the same second: below
             * roughly 6 MB/s the first conversation could never open at all.
             *
             * This notice is proof the fetch is advancing, so it restarts the deadline. The ceiling
             * keeps its meaning — 45 seconds with **no sign of life** — and a download that truly
             * stalls still times out exactly as before.
             */
            if (!stale() && acpSessionRef.current === acpSessionId) {
              clientRef.current?.extendPendingDeadlines();
            }
            return;
          }
          if (message.startsWith('npx-download-done')) {
            setDownload(null);
            return;
          }
          if (message.startsWith('npx-first-run-download')) {
            setDownload({ mb: null });
            keepDiagnostic(message);
            return;
          }
          /*
           * ⚠️ **A fact about a promise is not a diagnostic** (review 2026-08-16).
           *
           * Most notices are diagnostics and are folded away. Anything starting with `gate-off:` is
           * different — it means this screen's promise that "outside the folder, we ask first" is not
           * being kept in this session. Folding it away leaves the screen making a promise it cannot
           * keep. The detail is still recorded as a diagnostic alongside.
           */
          if (message.startsWith('gate-off')) {
            push({ kind: 'notice', id: nextEventId(), text: 'gate-off' });
          }
          keepDiagnostic(message);
        },
        /*
         * ⚠️ **Collect it, but do not put it on screen** (2026-08-16, fixed twice).
         *
         * At first nobody was listening, so the adapter's last words vanished entirely — which is
         * what made "it never moves past starting" impossible to explain. So it was listened to, and
         * then two paragraphs of English npm warnings sat permanently at the top of the conversation
         * **with nothing wrong at all** (owner's screen):
         *
         *   npm warn Unknown env config "_jsr-registry" …
         *
         * Launching the adapter through `npx` emits that **every time**. A diagnostic is a clue when
         * something breaks, not something to read routinely. Hence two rules: obvious noise is never
         * collected (`isDiagnosticStderr`), and what is collected is shown **only when something goes
         * wrong** (`diagnostics` → "details" in the error block).
         */
        onStderr: (line) => {
          if (!isDiagnosticStderr(line)) return;
          keepDiagnostic(line);
        },
        onExit: () => {
          /*
           * Unsubscribing from events does not stop callbacks already queued from arriving late.
           * After switching sessions, an old callback clearing the current ref would make a new
           * conversation `exited` for no reason. This callback owns only the generation and process
           * it was born with.
           *
           * ⚠️ **Dying mid-answer and finishing are different statements** (2026-08-17).
           *
           * Both used to set status to `exited`, and the screen showed a small chip reading
           * "finished". Dying halfway through an answer looked **identical to a clean exit**, so the
           * user believed that was the whole answer.
           *
           * So when it dies **during a turn**, it says so. That is not a diagnostic but the fact
           * "what you received is all there is", and folding it away leaves the user waiting for an
           * answer that is not coming, or reading a truncated one as complete.
           */
          if (stale() || acpSessionRef.current !== acpSessionId) return;
          if (statusRef.current === 'thinking') {
            push({ kind: 'notice', id: nextEventId(), text: 'died-mid-turn' });
          }
          finishTurn('failed', 'process_exited');
          setStatusTracked('exited');
          // A card awaiting an answer on a finished session is closed with a rejection.
          if (permissionDecisionTimerRef.current !== null) {
            window.clearTimeout(permissionDecisionTimerRef.current);
            permissionDecisionTimerRef.current = null;
          }
          pendingResolverRef.current?.(null);
          pendingResolverRef.current = null;
          setPending(null);
          setApprovedOntologyWriteTracked(null);
          /*
           * ⚠️ **Dispose the client of a finished session** (caught in review, 2026-08-16).
           * It used to set status to `exited` and leave the client in place. Then ① a call awaiting a
           * response never finished, and ② `clientRef` stayed populated so `start()` hit the lock and
           * could never restart. The adapter dying is an irreversible event, so that fact is passed
           * on to whoever is waiting.
           */
          clientRef.current?.dispose();
          clientRef.current = null;
        },
      });

      if (stale()) {
        unlistenRef.current?.();
        unlistenRef.current = null;
        acpSessionRef.current = null;
        await stopAcpSession(acpSessionId);
        return;
      }

      /**
       * Did we really wire the vault server? Both auto-allow and the instructions read this value.
       *
       * ⚠️ **Looked up by name, not by the array being non-empty** (2026-09-05). External
       * connectors now share this array, so a person with one switched on and no bundled MCP
       * binary would have had a non-empty list — and this would have told the agent it had the
       * vault, and auto-allowed the `atlas-vault` name for whatever else answered to it.
       */
      const hasVaultMcp = hasVaultMcpServer(mcpServers);
      const client = createAcpClient(transport, {
        onUpdate: applyUpdate,
        onAutoAllowed: (request) => {
          // Atlas reads are answered directly inside the protocol client, so they never pass
          // through `askUser` and its standing-round receipt. Let the active surface classify the
          // exact request after the same policy check; ordinary chat has no active round and stays
          // silent.
          const note = autoDecideRef.current?.(request);
          if (typeof note === 'string') {
            push({ kind: 'notice', id: nextEventId(), text: 'auto-allowed', detail: note });
          }
        },
        /*
         * Tools from the vault server we wired are allowed on the user's behalf **when there is no
         * path** — without this line the agent **cannot write anything to the map** (measured
         * 2026-08-16).
         *
         * ⚠️ **Pass the name only when it is really wired** (caught in review, 2026-08-16). It used
         * to be passed unconditionally, but an empty server list really happens (the web, no MCP
         * binary in the bundle, not ready yet). Passing the name then lets **someone else's
         * `atlas-vault` server that we did not wire** inherit that auto-allow. The contract already
         * said so: *"not passing it turns that auto-allow off — we do not pretend something exists."*
         */
        vaultMcpServerName: hasVaultMcp ? VAULT_MCP_SERVER_NAME : undefined,
        verdict: (filePath) => acpPermissionVerdict(acpSessionId, filePath),
        askUser,
        onProtocolNotice: (message) => keepDiagnostic(message),
      });
      clientRef.current = client;

      await client.initialize();
      /*
       * **Nobody asked for a particular conversation, so the folder's latest one is the answer.**
       *
       * Read before the session is created rather than after, which is the only order that can
       * change which session is created. The list is also handed to the screen here, so the
       * history door is reachable from the first frame the panel is ready — until 2026-09-08 it
       * appeared only after `session/list` returned *following* a successful start, and a person
       * whose session was still starting had no way to reach an earlier conversation at all.
       *
       * An adapter without `session/list` answers with an empty list (`acp-client.ts` swallows the
       * method error), which lands on `newSession` below exactly as before.
       */
      if (!resumeIdRef.current && resumeLatestRef.current && !freshRequestedRef.current) {
        const known = await client.listSessions(vaultRoot).catch(() => [] as AcpSessionSummary[]);
        if (!stale()) {
          const ordered = orderSessionsByRecency(known);
          if (!disposedRef.current) setSessions(ordered);
          resumeIdRef.current = latestSession(ordered)?.sessionId ?? null;
        }
      }
      /*
       * With a conversation to resume, try that first. On failure it **falls through to a new
       * conversation** — being unable to open a past conversation must not become the reason a
       * conversation cannot be opened at all (that file is not ours and can disappear at any time).
       */
      let session: { sessionId: string; choices: AcpSessionChoices } | null = null;
      if (resumeIdRef.current) {
        try {
          session = await client.loadSession({
            sessionId: resumeIdRef.current,
            cwd: vaultRoot,
            mcpServers,
            // Resuming does not change the rules — same instructions as a new conversation.
            appendSystemPrompt: withAppendix(vaultHandoffPrompt(hasVaultMcp, locale), systemPromptAppendixRef.current),
          });
        } catch {
          keepDiagnostic('resume-failed');
        }
        resumeIdRef.current = null;
      }
      session ??= await client.newSession({
        cwd: vaultRoot,
        mcpServers,
        appendSystemPrompt: withAppendix(vaultHandoffPrompt(hasVaultMcp, locale), systemPromptAppendixRef.current),
      });
      sessionIdRef.current = session.sessionId;

      /*
       * **Raise the permission gate.** codex is not held by config isolation and only by the session
       * mode (measured — `runtime-gate.ts`). It is applied only to runtimes that were measured.
       *
       * On failure the conversation is not opened. Emitting ready with no gate makes the screen's
       * promise that "outside the folder, we ask first" a lie.
       */
      const gatedMode = GATED_SESSION_MODE[runtimeId];
      let choices = session.choices;
      if (gatedMode) {
        if (await client.setMode(session.sessionId, gatedMode)) {
          /*
           * ⚠️ **Reflect it on the screen too.** Missing this left the session at `read-only` while
           * the dropdown read `Agent` (confirmed on the real thing, 2026-08-16) — the screen stating
           * the current state incorrectly, and on the very value that decides whether it asks about
           * things outside the folder, which is the worst place to be wrong.
           *
           * What `session/new` returned is from **before** the mode was applied, so leaving it makes
           * it stale. What we applied is the current value.
           */
          choices = { ...choices, currentModeId: gatedMode };
        } else {
          const failure = `gate-mode-failed:${gatedMode}`;
          keepDiagnostic(failure);
          throw new Error(failure);
        }
      }

      /*
       * ⚠️ **A session can *begin* in a mode the filter hides, and nothing judged that** (evidence
       * review, 2026-09-05). Only `GATED_SESSION_MODE` was consulted here, and it names `codex-acp`
       * alone — so whatever `session/new` or `session/load` reported went into the state unexamined.
       * A resumed conversation reports the mode it was left in, so a claude session could open on
       * `acceptEdits` with no verdict, no notice, and a Select rendering its placeholder because
       * that mode is not on the offered list. The screen fell silent on the one value that decides
       * whether a person is asked.
       *
       * Beginning in a mode and being moved into it are the same fact about the same session, so the
       * verdict and the sentence are the same as the clamp path's. This runs **after** the gate above
       * because what was just applied, not what `session/new` answered, is where the session is.
       */
      const openingMode = choices.currentModeId;
      const openedWithoutGate = openingMode !== null && !modeKeepsGate(openingMode);
      if (openingMode !== null) choices = applyCurrentMode(choices, openingMode);

      if (!disposedRef.current) {
        setChoices(choices);
        if (openedWithoutGate) noteModeMoved(openingMode, `mode-initial:${openingMode}`);
        setStatusTracked('ready');
      }
      // The list is filled after the session stands, so it does not hold up the frame the screen appears in.
      void client
        .listSessions(vaultRoot)
        .then((list) => {
          // Newest first, the same order the resume above chose from — the top row of the
          // history door and the conversation reopening restores must be the same one.
          if (!disposedRef.current) setSessions(orderSessionsByRecency(list));
        })
        .catch(() => {
          /* Being unable to read past conversations is not this conversation's problem. */
        });
    } catch (err) {
      /*
       * **The failure path is generation-guarded like every await on the success path**
       * (2026-09-01 review). A superseded start can reject long after `stop()` ran and the
       * replacement start repopulated these refs — cleaning up "the current session" here then
       * unsubscribes the replacement's listener, disposes its client, stops its process, and
       * paints the healthy conversation with a stale error. A stale failure has nothing left to
       * clean: `stop()` already stopped the process this start() had registered.
       */
      if (!stale()) {
        setError(err instanceof Error ? err.message : String(err));
        setStatusTracked('error');
        /*
         * ⚠️ **If starting failed, stop what was started** (caught in review, 2026-08-16).
         * It used to set status to `error` and stop there, but depending on where it failed the child
         * process is **already up** (a failed event subscription, say). The next `start()` then spawns
         * a new process while the previous becomes a ghost nobody stops until the app quits — the same
         * discipline as "closing mid-start stops itself" was missing on the failure path.
         */
        const orphan = acpSessionRef.current;
        if (orphan) {
          acpSessionRef.current = null;
          unlistenRef.current?.();
          unlistenRef.current = null;
          clientRef.current?.dispose();
          clientRef.current = null;
          await stopAcpSession(orphan).catch(() => {
            /* It may already be dead — do not throw again on the cleanup path. */
          });
        }
      }
    } finally {
      // A stale start's lock was already released by stop() — and possibly re-taken by the
      // replacement start, whose lock this line must not open mid-start.
      if (!stale()) startingRef.current = false;
    }
  }, [
    applyUpdate,
    askUser,
    finishTurn,
    keepDiagnostic,
    // The handoff prompt names the interface language, so a locale switch has to reach a
    // session started after it — not only the next full remount.
    locale,
    mcpServers,
    noteModeMoved,
    push,
    resetDiagnostics,
    runtimeId,
    setApprovedOntologyWriteTracked,
    setStatusTracked,
    vaultRoot,
  ]);

  /**
   * Switches conversation — resuming a past one (`sessionId`) or opening a new one (`null`).
   *
   * It ends the process and starts it again. Swapping only the session inside one process is
   * possible, but then "what is alive right now" is scattered across two places (process and
   * session) — that complexity costs more than the few seconds saved here.
   */
  const switchSession = useCallback(
    async (sessionId: string | null) => {
      await stopRef.current?.();
      updateEvents(() => []);
      latestUserRequestRef.current = null;
      setApprovedOntologyWriteTracked(null);
      setError(null);
      resumeIdRef.current = sessionId;
      // A blank conversation was asked for **by a person**, so the automatic resume above stops
      // answering for this panel. Picking a past conversation is the opposite answer and restores
      // it, because that press said which conversation to be in, not that there should be none.
      freshRequestedRef.current = sessionId === null;
      setChoices(EMPTY_CHOICES);
      await startRef.current?.();
    },
    [setApprovedOntologyWriteTracked, updateEvents],
  );

  /**
   * Applies a choice to the session — **without changing screen state first.** If the adapter
   * refuses (as claude does for models), the screen would be pretending it changed.
   */
  const chooseModel = useCallback(async (modelId: string) => {
    const client = clientRef.current;
    const sessionId = sessionIdRef.current;
    if (!client || !sessionId) return;
    if (await client.setModel(sessionId, modelId)) {
      setChoices((prev) => ({ ...prev, currentModelId: modelId }));
    }
  }, []);

  const chooseMode = useCallback(async (modeId: string) => {
    const client = clientRef.current;
    const sessionId = sessionIdRef.current;
    if (!client || !sessionId) return;
    if (await client.setMode(sessionId, modeId)) {
      setChoices((prev) => ({ ...prev, currentModeId: modeId }));
    }
  }, []);

  const send = useCallback(
    async (text: string) => {
      const client = clientRef.current;
      const sessionId = sessionIdRef.current;
      if (!client || !sessionId || !text.trim() || activeTurnRef.current) return;
      const generation = generationRef.current;
      const userEventId = nextEventId();
      const start: AcpTurnStart = { runtimeId, sessionId, vaultRoot, userEventId, text, startedAt: new Date().toISOString() };
      let observer: ((turn: AcpTurnCompletion) => void | Promise<void>) | null = null;
      try { observer = onTurnStarted?.(start) ?? null; } catch (error) {
        keepDiagnostic(`analysis-capture: ${error instanceof Error ? error.message : String(error)}`);
      }
      activeTurnRef.current = { start, observer, cancelRequested: false, taskBaseline: null };
      latestUserRequestRef.current = text.trim();
      push({ kind: 'user', id: userEventId, text });
      setLastTurnUpdateAt(Date.now());
      setStatusTracked('thinking');
      if (captureTaskBaseline) {
        try {
          const baseline = await captureTaskBaseline(start);
          if (activeTurnRef.current?.start === start) activeTurnRef.current.taskBaseline = baseline;
        } catch (error) {
          keepDiagnostic(`task-baseline: ${error instanceof Error ? error.message : String(error)}`);
          if (activeTurnRef.current?.start === start) {
            activeTurnRef.current.taskBaseline = unavailableTaskBaseline(
              start.startedAt, start.vaultRoot ?? '', [], ['capture_failed'],
            );
          }
        }
      }
      const active = activeTurnRef.current;
      const capturedBaseline = active?.start === start ? active.taskBaseline : null;
      const baselineInvalidated = capturedBaseline?.status === 'unavailable'
        && capturedBaseline.reasons.some((reason) => reason === 'context_changed' || reason === 'membership_changed');
      const currentTurnScope = currentTurnScopeRef.current;
      if (generationRef.current !== generation || disposedRef.current || sessionIdRef.current !== sessionId
        || clientRef.current !== client || active?.start !== start || active.cancelRequested || baselineInvalidated
        || currentTurnScope.runtimeId !== start.runtimeId || currentTurnScope.vaultRoot !== start.vaultRoot) {
        if (active?.start === start) {
          finishTurn('cancelled', baselineInvalidated
            || currentTurnScope.runtimeId !== start.runtimeId || currentTurnScope.vaultRoot !== start.vaultRoot
            ? 'capture_context_changed' : 'capture_cancelled');
          setLastTurnUpdateAt(null);
          setStatusTracked('ready');
        }
        return;
      }
      try {
        const result = await client.prompt(sessionId, [{ type: 'text', text }]);
        if (generationRef.current !== generation) return;
        const outcome = result.stopReason === 'cancelled' ? 'cancelled'
          : result.stopReason && result.stopReason !== 'end_turn' ? 'failed' : 'completed';
        finishTurn(outcome, result.stopReason ?? null);
        if (!disposedRef.current) {
          setApprovedOntologyWriteTracked(null);
          setLastTurnUpdateAt(null);
          setStatusTracked('ready');
        }
      } catch (err) {
        if (generationRef.current !== generation || statusRef.current === 'exited') return;
        finishTurn('failed', null);
        setApprovedOntologyWriteTracked(null);
        setLastTurnUpdateAt(null);
        setError(err instanceof Error ? err.message : String(err));
        setStatusTracked('error');
      }
    },
    [captureTaskBaseline, finishTurn, keepDiagnostic, onTurnStarted, push, runtimeId, setApprovedOntologyWriteTracked, setStatusTracked, vaultRoot],
  );

  const cancel = useCallback(() => {
    if (activeTurnRef.current) activeTurnRef.current.cancelRequested = true;
    const client = clientRef.current;
    const sessionId = sessionIdRef.current;
    if (client && sessionId) void client.cancel(sessionId);
  }, []);

  const stop = useCallback(async () => {
    finishTurn('cancelled', 'session_closed');
    /*
     * **Bump the generation first.** Without this line, closing mid-start makes `stop()` clean up
     * something that does not exist yet and return, after which `start()` creates the process
     * anyway — the adapter keeps running behind a closed screen.
     */
    generationRef.current += 1;

    // Order matters: close the pending permission first, then end the process. Reversed, it tries to
    // send an answer to something already dead.
    if (permissionDecisionTimerRef.current !== null) {
      window.clearTimeout(permissionDecisionTimerRef.current);
      permissionDecisionTimerRef.current = null;
    }
    pendingResolverRef.current?.(null);
    pendingResolverRef.current = null;
    setPending(null);
    const approvedReceipt = approvedReceiptRef.current;
    if (approvedReceipt) {
      emitWorkReceipt({
        ...approvedReceipt.receipt,
        updatedAt: new Date().toISOString(),
        result: 'cancelled',
      });
      approvedReceiptRef.current = null;
    }
    setApprovedOntologyWriteTracked(null);
    // Release the lock even if it was starting — otherwise it can never start again.
    startingRef.current = false;
    clientRef.current?.dispose();
    clientRef.current = null;
    unlistenRef.current?.();
    unlistenRef.current = null;
    const acpSessionId = acpSessionRef.current;
    acpSessionRef.current = null;
    sessionIdRef.current = null;
    if (acpSessionId) await stopAcpSession(acpSessionId);
    setStatusTracked('idle');
  }, [emitWorkReceipt, finishTurn, setApprovedOntologyWriteTracked, setStatusTracked]);

  /*
   * Hold the latest in a ref so `switchSession` can call it without a circular dependency.
   *
   * **Deferred to an effect rather than done during render.** Touching a ref during render makes
   * React warn, and where a render is discarded (concurrency) it really does leave a mismatched
   * value. `switchSession` runs only after the user presses something, so this point is not too late.
   */
  useEffect(() => {
    startRef.current = start;
    autoDecideRef.current = autoDecide;
    systemPromptAppendixRef.current = systemPromptAppendix;
    stopRef.current = stop;
  }, [start, stop, setStatusTracked, autoDecide, systemPromptAppendix]);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      // When the screen goes away the process ends too, or a closed conversation keeps running.
      void stop();
    };
  }, [stop, setStatusTracked]);

  return {
    status,
    lastTurnUpdateAt,
    events,
    error,
    slashCommands,
    diagnostics,
    download,
    pending,
    approvedOntologyWrite,
    sessions,
    choices,
    chooseModel,
    chooseMode,
    start,
    send,
    cancel,
    stop,
    switchSession,
  };
}
