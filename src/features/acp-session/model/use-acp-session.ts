'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  acpPermissionVerdict,
  isAcpBridgeAvailable,
  listenToAcpSession,
  sendAcpLine,
  startAcpSession,
  stopAcpSession,
} from '@/shared/lib/tauri-acp';

import { GATED_SESSION_MODE } from './runtime-gate';
import { isDiagnosticStderr } from './acp-trouble';
import { readSlashCommands, type AcpSlashCommand } from './slash-commands';
import { VAULT_MCP_SERVER_NAME } from './vault-mcp-server';
import {
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
    }
  | { kind: 'notice'; id: string; text: string };

export type AcpSessionStatus =
  | 'idle'
  | 'starting'
  | 'ready'
  | 'thinking'
  | 'error'
  | 'exited';

export interface PendingPermission {
  request: AcpPermissionRequest;
  /** Passes the user's choice back to the agent. `null` is a rejection. */
  resolve: (optionId: string | null) => void;
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
  decision,
  result,
  at,
}: {
  request: AcpPermissionRequest;
  sessionId: string | null;
  runtimeId: string;
  userRequest: string | null;
  decision: AcpWorkDecision;
  result: AcpWorkResult;
  at: string;
}): AcpWorkReceipt {
  const changeSet = buildOntologyChangeSet(request.toolName ?? 'ontology-write', request.rawInput);
  const toolCallId = request.toolCallId ?? `${changeSet.toolName}:${at}`;
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
  };
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
  'Answer in the language the person wrote in.',
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
  'The `atlas-vault` MCP server is already connected to this exact folder. Use it for everything about this graph. Do not shell out, list directories, or open the markdown files yourself to find your way around — the tools already answer those questions, and reading the files by hand is how stale and duplicated nodes get made.';

function vaultHandoffPrompt(hasVaultMcp: boolean): string {
  return (hasVaultMcp ? [VAULT_HANDOFF_BASE[0], VAULT_MCP_SENTENCE, ...VAULT_HANDOFF_BASE.slice(1)] : VAULT_HANDOFF_BASE).join(' ');
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
}: UseAcpSessionOptions) {
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
  const stopRef = useRef<(() => Promise<void>) | null>(null);
  const acpSessionRef = useRef<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const disposedRef = useRef(false);
  /** The resolver of a permission request awaiting an answer — closed with a rejection on cleanup. */
  const pendingResolverRef = useRef<((optionId: string | null) => void) | null>(null);
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
    setEvents((prev) => {
      const last = prev[prev.length - 1];
      // Text fragments are **appended** rather than becoming a new bubble per line — one sentence
      // arrives in several fragments.
      if (last && (event.kind === 'agent' || event.kind === 'thought') && last.kind === event.kind) {
        return [...prev.slice(0, -1), { ...last, text: last.text + event.text }];
      }
      return [...prev, event];
    });
  }, []);

  const applyUpdate = useCallback(
    (update: Record<string, unknown>) => {
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
        // claude-agent-acp sends streamed tool_use as a pending row first,
        // and when input is complete, sends rawInput via **status-less** tool_call_update.
        // Merging only the status leaves only the tool name on screen, while the exact target and map intent
        // remain permanently empty. Overwrite existing fields with only the fields actually carried by the update.
        setEvents((prev) =>
          prev.map((event) => {
            if (event.kind !== 'tool' || event.id !== id) return event;
            return {
              ...event,
              ...(nextStatus ? { status: nextStatus } : {}),
              ...(nextTitle ? { title: nextTitle } : {}),
              ...(nextToolKind ? { toolKind: nextToolKind } : {}),
              ...(hasRawInput ? { rawInput: update.rawInput } : {}),
            };
          }),
        );
        if (!nextStatus) return;
        const approvedReceipt = approvedReceiptRef.current;
        if (
          TERMINAL_TOOL_STATES.has(nextStatus) &&
          approvedOntologyWriteRef.current?.toolCallId === id
        ) {
          if (approvedReceipt?.toolCallId === id) {
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
            });
            approvedReceiptRef.current = null;
          }
          setApprovedOntologyWriteTracked(null);
        }
      }
    },
    [emitWorkReceipt, push, setApprovedOntologyWriteTracked],
  );

  /** Creates the promise that waits until the screen answers. */
  const askUser = useCallback((request: AcpPermissionRequest) => {
    return new Promise<string | null>((resolve) => {
      pendingResolverRef.current = resolve;
      setPending({
        request,
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
  }, [approvalSettleMs, emitWorkReceipt, runtimeId, setApprovedOntologyWriteTracked]);

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

      /** Did we really wire the vault server? Both auto-allow and the instructions read this value. */
      const hasVaultMcp = (mcpServers?.length ?? 0) > 0;
      const client = createAcpClient(transport, {
        onUpdate: applyUpdate,
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
            appendSystemPrompt: vaultHandoffPrompt(hasVaultMcp),
          });
        } catch {
          keepDiagnostic('resume-failed');
        }
        resumeIdRef.current = null;
      }
      session ??= await client.newSession({
        cwd: vaultRoot,
        mcpServers,
        appendSystemPrompt: vaultHandoffPrompt(hasVaultMcp),
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

      if (!disposedRef.current) {
        setChoices(choices);
        setStatusTracked('ready');
      }
      // The list is filled after the session stands, so it does not hold up the frame the screen appears in.
      void client
        .listSessions(vaultRoot)
        .then((list) => {
          if (!disposedRef.current) setSessions(list);
        })
        .catch(() => {
          /* Being unable to read past conversations is not this conversation's problem. */
        });
    } catch (err) {
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
    } finally {
      startingRef.current = false;
    }
  }, [
    applyUpdate,
    askUser,
    keepDiagnostic,
    mcpServers,
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
      setEvents([]);
      latestUserRequestRef.current = null;
      setApprovedOntologyWriteTracked(null);
      setError(null);
      resumeIdRef.current = sessionId;
      setChoices(EMPTY_CHOICES);
      await startRef.current?.();
    },
    [setApprovedOntologyWriteTracked],
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
      if (!client || !sessionId || !text.trim()) return;
      latestUserRequestRef.current = text.trim();
      push({ kind: 'user', id: nextEventId(), text });
      setLastTurnUpdateAt(Date.now());
      setStatusTracked('thinking');
      try {
        await client.prompt(sessionId, [{ type: 'text', text }]);
        if (!disposedRef.current) {
          setApprovedOntologyWriteTracked(null);
          setLastTurnUpdateAt(null);
          setStatusTracked('ready');
        }
      } catch (err) {
        setApprovedOntologyWriteTracked(null);
        setLastTurnUpdateAt(null);
        setError(err instanceof Error ? err.message : String(err));
        setStatusTracked('error');
      }
    },
    [push, setApprovedOntologyWriteTracked, setStatusTracked],
  );

  const cancel = useCallback(() => {
    const client = clientRef.current;
    const sessionId = sessionIdRef.current;
    if (client && sessionId) void client.cancel(sessionId);
  }, []);

  const stop = useCallback(async () => {
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
  }, [emitWorkReceipt, setApprovedOntologyWriteTracked, setStatusTracked]);

  /*
   * Hold the latest in a ref so `switchSession` can call it without a circular dependency.
   *
   * **Deferred to an effect rather than done during render.** Touching a ref during render makes
   * React warn, and where a render is discarded (concurrency) it really does leave a mismatched
   * value. `switchSession` runs only after the user presses something, so this point is not too late.
   */
  useEffect(() => {
    startRef.current = start;
    stopRef.current = stop;
  }, [start, stop, setStatusTracked]);

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
