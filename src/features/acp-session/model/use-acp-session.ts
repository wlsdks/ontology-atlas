'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';

import { answerLanguageSentence } from '@/i18n/answer-language';

import {
  acpPermissionVerdict,
  isAcpBridgeAvailable,
  listenToAcpSession,
  sendAcpLine,
  startAcpSession,
  stopAcpSession,
} from '@/shared/lib/agent-chat/tauri-acp';

import { GATED_SESSION_MODE } from './runtime-gate';
import { modeKeepsGate } from './mode-safety';
import { investigationPermissionVerified, type InvestigationSendGuard } from './investigation/guard';
import { readReportedPlan, type ReportedPlan } from './investigation/reported-plan';
import { isDiagnosticStderr } from './acp-trouble';
import { readSlashCommands, type AcpSlashCommand } from './slash-commands';
import { hasVaultMcpServer, VAULT_MCP_SERVER_NAME, vaultWriteConsentOn } from './vault-mcp-server';
import { latestSession, orderSessionsByRecency } from './session-recency';
import { keepToolOutput, type ToolOutputEvidence } from './tool-output';
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
} from '@/shared/lib/meaning-transition/acp-work-receipt';
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
      /** The only record of which node was touched (`tool-targets.ts`). */
      rawInput?: unknown;
      /** The only record of how much came back (`tool-outcome.ts`); large ones are previews. */
      rawOutput?: unknown;
      /** A trimmed answer's analysis rows, held only until its turn is captured. */
      outputEvidence?: ToolOutputEvidence;
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
   * Lets the screen answer a permission request itself. Return a short note to allow without a
   * card, `{ reject: reason }` to refuse, or null to ask. An unattended round has nobody to
   * ask, so what its scope disallows is refused. Ontology writes never come here.
   */
  autoDecide?: (request: AcpPermissionRequest) => string | { reject: string } | null;
  onToolSettled?: (toolCallId: string, status: string) => void;
  /**
   * A paragraph the consumer appends after the vault handoff, for rules that hold only on its
   * screen (the Library's citation rule).
   */
  systemPromptAppendix?: string | null;
  resumeLatest?: boolean;
  putAway?: boolean;
}

const PUT_AWAY_IDLE_STOP_MS = 10 * 60 * 1000;

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
 * A paragraph appended to the session's start instructions; it fills the relation `why`,
 * which the slot alone does not. It is appended, not replacing the defaults, because those
 * make the tool itself.
 */
/**
 * Where the answer-language rule is spliced in. "The language the person wrote in" fails for
 * turns started by a button, whose only text is this app's English. So the interface
 * language is stated outright; what the person types still overrides it.
 */
const ANSWER_LANGUAGE_SLOT = '__ANSWER_LANGUAGE__';

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
   * Report outcomes as sentences, not raw payloads: tool results are machine answers, and the
   * product exists to translate them. The raw value is demoted, not forbidden.
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
 * Claim the vault server is wired only when it is: an empty server list happens, and
 * insisting on absent tools sends the agent hunting.
 */
const VAULT_MCP_SENTENCE =
  'The `atlas-vault` MCP server is already connected to this exact folder. Use it for everything about this graph. Do not shell out, list directories, or open the markdown files yourself to find your way around — the tools already answer those questions, and reading the files by hand is how stale and duplicated nodes get made. When you report counts, keep their units explicit and treat `query_ontology` health `relationCensus` as the authority: MCP `graph.edges` and `internalEdges` count compiled frontmatter relation declarations, so parent and child declarations can describe the same containment twice; the map\'s canonical relation census counts deduplicated normalized typed edges across the loaded ontology, not the current view filter. The MCP process does not know that app-side numeric census. Neither number is wrong, and never present them as the same census.';

/**
 * Construction routing, not a qualification result; it grants no write authority, every
 * write still stops at the card. The bulk lifecycle needs an evaluator the app lacks, so one
 * completing path is named.
 */
const VAULT_CONSTRUCTION_SENTENCE =
  'When the person asks you to build or rebuild this repository\'s ontology: verify `connection_info` and read the construction card in its `guide`; survey with `analyze_repo_structure`, `index_project`, and `infer_imports` where structure does not say what depends on what; propose in plain sentences — each candidate one definition, what it includes and excludes, and the file proving it — preferring few well-evidenced concepts to many thin ones; then wait. Once they agree, write in reviewed batches of ≤12 with `add_concepts`: each slug under its kind folder, each body carrying the definition, `## Includes` / `## Excludes`, an `## Uncertainty` line naming what you did not read or could not check, and on a capability or element a `path:` naming a file. Then `add_relations` each with a `why`, `validate_vault`, `connect_project_source`, `finalize_project_meaning`. Answer every warning by the repair it names, or say why not. This session does not have an independent evaluator, and the bulk `analyze_repo_structure` writePlan route needs one, so do not author a qualification proposal or wait for `canWrite`; it stays open to a terminal run with one. Do not fabricate an evaluator.';

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
  onToolSettled,
  systemPromptAppendix = null,
  resumeLatest = false,
  putAway = false,
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
   * (`turn-liveness.ts`).
   */
  const [lastTurnUpdateAt, setLastTurnUpdateAt] = useState<number | null>(null);
  /*
   * Status is held in a ref as well: the moment the adapter dies (`onExit`) is outside render, so a
   * closure sees a stale value. What is needed there is the status **at that moment** — was a turn
   * in progress (died mid-answer) or had it simply finished?
   */
  const statusRef = useRef<AcpSessionStatus>('idle');
  /**
   * First-download indicator; `null` means none. Interrupting the first npx fetch leaves a
   * half-built cache (healed in `src-tauri/src/acp/npx_cache.rs`). `mb` is the cache size so
   * far, `null` until the first notice; no percentage since the total is unknown.
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
  const gateOffRef = useRef(false);
  /** Diagnostic lines are collected, never put into the conversation. */
  const resetDiagnostics = useCallback(() => {
    gateOffRef.current = false;
    stderrRef.current = [];
    setDiagnostics([]);
  }, []);
  const keepDiagnostic = useCallback((line: string) => {
    const text = line.trim();
    if (text.startsWith('gate-off')) gateOffRef.current = true;
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
  const [choices, setChoicesState] = useState<AcpSessionChoices>(EMPTY_CHOICES);
  const [reportedPlan,setReportedPlan] = useState<ReportedPlan|null>(null);
  const choicesRef = useRef(EMPTY_CHOICES);
  const sessionConsentRef = useRef(false);
  const changingModeRef = useRef(0);
  const setChoices = useCallback((value: AcpSessionChoices | ((current: AcpSessionChoices) => AcpSessionChoices)) => {
    const next = typeof value === 'function' ? value(choicesRef.current) : value;
    choicesRef.current = next;
    setChoicesState(next);
  }, []);

  const clientRef = useRef<AcpClient | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  /** The conversation the next `start()` resumes. Used once, then cleared. */
  const resumeIdRef = useRef<string | null>(null);
  const idleStoppedSessionIdRef = useRef<string | null>(null);
  const openAsksRef = useRef(0);
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
  const onToolSettledRef = useRef<UseAcpSessionOptions['onToolSettled']>(undefined);
  const systemPromptAppendixRef = useRef<string | null>(systemPromptAppendix);
  const stopRef = useRef<(() => Promise<void>) | null>(null);
  const acpSessionRef = useRef<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const disposedRef = useRef(false);
  /** The resolver of a permission request awaiting an answer — closed with a rejection on cleanup. */
  const pendingResolverRef = useRef<((optionId: string | null) => void) | null>(null);
  /**
   * Serializes concurrent permission requests: with one resolver slot the second card
   * overwrote the first and its JSON-RPC id was never answered.
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
      if (last && (event.kind === 'agent' || event.kind === 'thought') && last.kind === event.kind) {
        const next = prev.slice();
        next[next.length - 1] = { ...last, text: last.text + event.text };
        return next;
      }
      return [...prev, event];
    });
  }, [updateEvents]);

  const finishTurn = useCallback((outcome: AcpTurnCompletion['outcome'], stopReason: string | null) => {
    const active = activeTurnRef.current;
    if (!active) return;
    activeTurnRef.current = null;
    if (!active.observer) return;
    const currentEvents = eventsRef.current;
    const index = currentEvents.findIndex((event) => event.kind === 'user' && event.id === active.start.userEventId);
    // O(current-turn events), with one preallocated snapshot array.
    const turnEvents = new Array<AcpEvent>(index < 0 ? 0 : currentEvents.length - index);
    for (let offset = 0; offset < turnEvents.length; offset += 1) {
      turnEvents[offset] = { ...currentEvents[index + offset] };
    }
    const completion: AcpTurnCompletion = {
      ...active.start,
      endedAt: new Date().toISOString(),
      outcome: active.cancelRequested ? 'cancelled' : outcome,
      stopReason,
      events: turnEvents,
    };
    if (completion.events.some((event) => event.kind === 'tool' && event.outputEvidence)) {
      updateEvents((previous) => previous.map((event) => {
        if (event.kind !== 'tool' || !event.outputEvidence) return event;
        const { outputEvidence: _handedOver, ...kept } = event;
        return kept;
      }));
    }
    // Archival failure must not retry the prompt or turn a successful model
    // response into an ACP transport error. The caller owns save/retry UI.
    try {
      void Promise.resolve(active.observer(completion)).catch((error) => {
        keepDiagnostic(`analysis-archive: ${error instanceof Error ? error.message : String(error)}`);
      });
    } catch (error) {
      keepDiagnostic(`analysis-archive: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [keepDiagnostic, updateEvents]);

  /**
   * Stops the screen claiming a gate it no longer has. This is not the `gate-off` sentence,
   * whose settings and outside-folder wording is wrong here. The Atlas server checkpoint
   * reassurance is attached only when it is on (`vaultWriteConsentOn`).
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
      if(kind==='plan') {
        if(activeTurnRef.current)setReportedPlan(previous=>readReportedPlan(previous,update.entries));
        return;
      }

      if (kind === 'available_commands_update') {
        // What `/` can invoke. It holds **only what arrived** — with nothing, typing `/` in the
        // composer does nothing (`slash-commands.ts`).
        setSlashCommands(readSlashCommands(update));
        return;
      }
      if (kind === 'current_mode_update') {
        /*
         * The adapter moves the session on its own and announces it only with this notification.
         * State follows (`applyCurrentMode`); if the new mode removes the gate, the `gate-off`
         * notice is raised.
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
      const keptOutput = (rawOutput: unknown) =>
        keepToolOutput(rawOutput, { evidence: Boolean(activeTurnRef.current?.observer) });
      if (kind === 'tool_call') {
        // A call that arrives finished carries its answer here, not in a later update.
        const kept = keptOutput(update.rawOutput);
        push({
          kind: 'tool',
          id: typeof update.toolCallId === 'string' ? update.toolCallId : nextEventId(),
          title: typeof update.title === 'string' ? update.title : '',
          toolKind: typeof update.kind === 'string' ? update.kind : 'other',
          status: typeof update.status === 'string' ? update.status : 'pending',
          rawInput: update.rawInput,
          rawOutput: kept.rawOutput,
          ...(kept.evidence ? { outputEvidence: kept.evidence } : {}),
        });
        if (typeof update.toolCallId === 'string' && typeof update.status === 'string' && TERMINAL_TOOL_STATES.has(update.status)) {
          onToolSettledRef.current?.(update.toolCallId, update.status);
        }
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
        const kept = hasRawOutput ? keptOutput(update.rawOutput) : null;
        // The adapter sends a pending row, then its input in a status-less update: merge every
        // field an update carries, not only its status.
        updateEvents((prev) =>
          prev.map((event) => {
            if (event.kind !== 'tool' || event.id !== id) return event;
            return {
              ...event,
              ...(nextStatus ? { status: nextStatus } : {}),
              ...(nextTitle ? { title: nextTitle } : {}),
              ...(nextToolKind ? { toolKind: nextToolKind } : {}),
              ...(hasRawInput ? { rawInput: update.rawInput } : {}),
              ...(kept ? { rawOutput: kept.rawOutput, outputEvidence: kept.evidence ?? undefined } : {}),
            };
          }),
        );
        if (!nextStatus) return;
        if (TERMINAL_TOOL_STATES.has(nextStatus)) onToolSettledRef.current?.(id, nextStatus);
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
          // Legacy receipts have no explicit origin or correlation; the same live session and tool id still
          // close the UI state, but stay unverified.
          if (!approvedReceipt || (receiptMatches && originMatches && writerMatches)) {
            setApprovedOntologyWriteTracked(null);
          }
        }
      }
    },
    [emitWorkReceipt, noteModeMoved, push, setApprovedOntologyWriteTracked, setChoices, updateEvents],
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
      const decided = autoDecideRef.current?.(request) ?? null;
      if (decided !== null && typeof decided === 'object') {
        push({ kind: 'notice', id: nextEventId(), text: 'auto-refused', detail: decided.reject });
        resolve(null);
        return;
      }
      const note = request.reviewKind === 'permission' ? decided : null;
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
    openAsksRef.current += 1;
    const result = askChainRef.current.then(present, present).finally(() => {
      openAsksRef.current -= 1;
    });
    askChainRef.current = result.catch(() => null);
    return result;
  }, [approvalSettleMs, emitWorkReceipt, push, runtimeId, setApprovedOntologyWriteTracked, vaultRoot]);

  const start = useCallback(async () => {
    if (!isAcpBridgeAvailable() || !vaultRoot) return;
    /*
     * The lock is taken before the first `await`: `clientRef.current` fills only after spawn, so a
     * second `start()` in that window would start two adapters. Dev double invocation and a new
     * `mcpServers` array each render both trigger it.
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
            // The progress notice builds the indicator on its own, so a missed first notice costs
            // nothing; it is drawn only while starting, so a late one is harmless.
            const mb = Number(message.slice('npx-download-progress:'.length));
            setDownload({ mb: Number.isFinite(mb) ? mb : null });
            /*
             * A download in flight is not a hang: this notice restarts the handshake deadline, so the ceiling
             * means 45s with no sign of life. A download that truly stalls still times out.
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
           * A `gate-off:` notice means the "we ask first outside the folder" promise is not kept, so it must
           * show, not fold away. The detail is still kept as a diagnostic.
           */
          if (message.startsWith('gate-off')) {
            push({ kind: 'notice', id: nextEventId(), text: 'gate-off' });
          }
          keepDiagnostic(message);
        },
        /*
         * Collect stderr but do not put it on screen: `npx` emits npm warnings every run. Noise is never
         * collected (`isDiagnosticStderr`); what is collected shows only on error.
         */
        onStderr: (line) => {
          if (!isDiagnosticStderr(line)) return;
          keepDiagnostic(line);
        },
        onExit: () => {
          /*
           * A late callback from an old session must not clear the current ref, so this owns only its own
           * generation and process. Dying mid-answer is reported as `died-mid-turn`, not as a clean finish, so
           * a truncated answer is not read as complete.
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
           * Dispose the client of a finished session, or pending calls never finish and `clientRef` blocks
           * `start()` from restarting.
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
       * Looked up by name, not by a non-empty array: external connectors share the array, so a non-empty
       * list does not mean the vault server is wired.
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
         * Vault server tools are allowed on the user's behalf when there is no path; without this the agent
         * cannot write to the map. Pass the name only when wired, or someone else's `atlas-vault` server
         * would inherit the auto-allow.
         */
        vaultMcpServerName: hasVaultMcp ? VAULT_MCP_SERVER_NAME : undefined,
        verdict: (filePath) => acpPermissionVerdict(acpSessionId, filePath),
        askUser,
        onProtocolNotice: (message) => keepDiagnostic(message),
      });
      clientRef.current = client;

      await client.initialize();
      /*
       * With no requested conversation, resume the folder's latest; read before the session is created,
       * since only that order changes which one is created. The list also feeds the history door early. An
       * adapter without `session/list` yields an empty list and falls to `newSession`.
       */
      if (!resumeIdRef.current && resumeLatestRef.current && !freshRequestedRef.current) {
        const known = await client.listSessions(vaultRoot).catch(() => [] as AcpSessionSummary[]);
        if (!stale()) {
          const ordered = orderSessionsByRecency(known);
          if (!disposedRef.current) setSessions(ordered);
          resumeIdRef.current = latestSession(ordered)?.sessionId ?? null;
        }
      }
      let session: { sessionId: string; choices: AcpSessionChoices } | null = null;
      if (resumeIdRef.current) {
        try {
          session = await client.loadSession({
            sessionId: resumeIdRef.current,
            cwd: vaultRoot,
            mcpServers,
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
      if (idleStoppedSessionIdRef.current !== null && idleStoppedSessionIdRef.current !== session.sessionId) {
        updateEvents(() => []);
        latestUserRequestRef.current = null;
      }
      idleStoppedSessionIdRef.current = null;
      sessionIdRef.current = session.sessionId;
      sessionConsentRef.current = vaultWriteConsentOn(mcpServers);

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
           * Reflect the applied mode on screen: `session/new` answered from before it was applied, so the
           * dropdown would show a stale value.
           */
          choices = { ...choices, currentModeId: gatedMode };
        } else {
          const failure = `gate-mode-failed:${gatedMode}`;
          keepDiagnostic(failure);
          throw new Error(failure);
        }
      }

      /*
       * A session can begin in a mode the filter hides (a resumed `session/load` reports the mode it was
       * left in); `GATED_SESSION_MODE` names `codex-acp` alone. Same decision and sentence as the clamp
       * path; runs after the gate above because the applied mode is where the session is.
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
       * The failure path is generation-guarded like every await on the success path: a superseded start
       * can reject after `stop()` and must not clean up the replacement's listener, client or process.
       */
      if (!stale()) {
        setError(err instanceof Error ? err.message : String(err));
        setStatusTracked('error');
        /*
         * If starting failed, stop what was started: the child may already be up, and the next `start()`
         * would spawn another and orphan it.
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
    setChoices,
    setStatusTracked,
    updateEvents,
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
    [setApprovedOntologyWriteTracked, setChoices, updateEvents],
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
  }, [setChoices]);

  const chooseMode = useCallback(async (modeId: string) => {
    const client = clientRef.current;
    const sessionId = sessionIdRef.current;
    if (!client || !sessionId) return;
    changingModeRef.current += 1;
    try {
      if (await client.setMode(sessionId, modeId) && clientRef.current === client && sessionIdRef.current === sessionId) {
        setChoices((prev) => ({ ...prev, currentModeId: modeId }));
      }
    } finally { changingModeRef.current -= 1; }
  }, [setChoices]);

  const sendInternal = useCallback(
    async (text: string, guard?: InvestigationSendGuard): Promise<boolean> => {
      const client = clientRef.current;
      const sessionId = sessionIdRef.current;
      if (!client || !sessionId || !text.trim() || activeTurnRef.current) return false;
      const permissionCurrent = () => !guard || (
        guard.runtimeId === runtimeId && changingModeRef.current === 0 && openAsksRef.current === 0
        && investigationPermissionVerified(runtimeId, choicesRef.current, sessionConsentRef.current, gateOffRef.current)
      );
      if (guard && (statusRef.current !== 'ready' || !permissionCurrent())) return false;
      const generation = generationRef.current;
      const userEventId = nextEventId();
      const start: AcpTurnStart = { runtimeId, sessionId, vaultRoot, userEventId, text, startedAt: new Date().toISOString() };
      let observer: ((turn: AcpTurnCompletion) => void | Promise<void>) | null = null;
      try { observer = onTurnStarted?.(start) ?? null; } catch (error) {
        keepDiagnostic(`analysis-capture: ${error instanceof Error ? error.message : String(error)}`);
      }
      activeTurnRef.current = { start, observer, cancelRequested: false, taskBaseline: null };
      setReportedPlan(null);
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
      let investigationCurrent = permissionCurrent();
      if (guard && investigationCurrent) {
        try { investigationCurrent = await guard.revalidate(); } catch { investigationCurrent = false; }
        investigationCurrent = investigationCurrent && permissionCurrent();
      }
      const currentTurnScope = currentTurnScopeRef.current;
      if (generationRef.current !== generation || disposedRef.current || sessionIdRef.current !== sessionId
        || clientRef.current !== client || activeTurnRef.current?.start !== start || active?.start !== start || active.cancelRequested || baselineInvalidated || !investigationCurrent
        || currentTurnScope.runtimeId !== start.runtimeId || currentTurnScope.vaultRoot !== start.vaultRoot) {
        if (activeTurnRef.current?.start === start) {
          finishTurn('cancelled', !investigationCurrent ? 'investigation_context_changed' : baselineInvalidated
            || currentTurnScope.runtimeId !== start.runtimeId || currentTurnScope.vaultRoot !== start.vaultRoot
            ? 'capture_context_changed' : 'capture_cancelled');
          setLastTurnUpdateAt(null);
          setStatusTracked('ready');
        }
        return false;
      }
      try {
        const result = await client.prompt(sessionId, [{ type: 'text', text }]);
        if (generationRef.current !== generation) return true;
        const outcome = result.stopReason === 'cancelled' ? 'cancelled'
          : result.stopReason && result.stopReason !== 'end_turn' ? 'failed' : 'completed';
        finishTurn(outcome, result.stopReason ?? null);
        if (!disposedRef.current) {
          setApprovedOntologyWriteTracked(null);
          setLastTurnUpdateAt(null);
          setStatusTracked('ready');
        }
      } catch (err) {
        if (generationRef.current !== generation || statusRef.current === 'exited') return true;
        finishTurn('failed', null);
        setApprovedOntologyWriteTracked(null);
        setLastTurnUpdateAt(null);
        setError(err instanceof Error ? err.message : String(err));
        setStatusTracked('error');
      }
      return true;
    },
    [captureTaskBaseline, finishTurn, keepDiagnostic, onTurnStarted, push, runtimeId, setApprovedOntologyWriteTracked, setStatusTracked, vaultRoot],
  );
  const send = useCallback(async (text: string) => { await sendInternal(text); }, [sendInternal]);
  const sendInvestigation = useCallback((text: string, guard: InvestigationSendGuard) => sendInternal(text, guard), [sendInternal]);

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
    setReportedPlan(null);
    if (acpSessionId) await stopAcpSession(acpSessionId);
    setStatusTracked('idle');
  }, [emitWorkReceipt, finishTurn, setApprovedOntologyWriteTracked, setStatusTracked]);

  const stopIdleChain = useCallback(async () => {
    const settled = statusRef.current === 'ready' || statusRef.current === 'error';
    if (!settled || !acpSessionRef.current || activeTurnRef.current || openAsksRef.current > 0) return;
    idleStoppedSessionIdRef.current = sessionIdRef.current;
    resumeIdRef.current = sessionIdRef.current;
    await stop();
  }, [stop]);

  const idleWhilePutAway = putAway && (status === 'ready' || status === 'error') && pending === null;
  useEffect(() => {
    if (!idleWhilePutAway) return;
    const timer = window.setTimeout(() => void stopIdleChain(), PUT_AWAY_IDLE_STOP_MS);
    return () => window.clearTimeout(timer);
  }, [idleWhilePutAway, stopIdleChain]);

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
    onToolSettledRef.current = onToolSettled;
    systemPromptAppendixRef.current = systemPromptAppendix;
    stopRef.current = stop;
  }, [start, stop, setStatusTracked, autoDecide, onToolSettled, systemPromptAppendix]);

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
    reportedPlan,
    chooseModel,
    chooseMode,
    start,
    send,
    sendInvestigation,
    cancel,
    stop,
    switchSession,
  };
}
