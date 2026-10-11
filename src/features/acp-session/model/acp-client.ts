/**
 * ACP client: turns line-delimited JSON-RPC into a conversation; transport is injected.
 * Only `session/request_permission` and `session/update` are implemented; options are found by `kind`.
 * Never pick `allow_always` for the user (it grants the directory); inside-vault is decided in Rust.
 */

import { modeKeepsGate, partitionModes } from './mode-safety';
import { atlasToolMode } from './atlas-tool-policy';

/** The channel that carries lines. A process or a fake, as long as it satisfies this. */
export interface AcpTransport {
  send(line: string): void | Promise<void>;
  /** Called for every incoming line. Calling the returned function unsubscribes. */
  subscribe(onLine: (line: string) => void): () => void;
}

/** One selectable option — a model or a mode; the screen draws both the same way. */
export interface AcpChoice {
  id: string;
  name: string;
  description: string | null;
  /**
   * `_meta.kind` as the adapter stated it; the safety check reads it, so dropping it disarms that
   * check. `mode-safety.ts` owns the values.
   */
  metaKind?: string | null;
  /**
   * The adapter's `_meta` verbatim. Kept whole because the next field we need will arrive inside it,
   * and a parser that keeps only the fields it already understands has to be edited before anyone
   * can even see what changed.
   */
  meta?: Record<string, unknown> | null;
}

/**
 * Ceiling on waiting for an answer. One conversation turn can take longer than this, so it applies
 * **only to the handshake and to queries** (`prompt` gets no limit — see its implementation below).
 */
const CALL_TIMEOUT_MS = 45_000;

/** Owned by `mode-safety.ts`: hide what is dangerous, offer the unmeasured marked unknown. */
export function keepGateSafeModes(modes: AcpChoice[]): AcpChoice[] {
  return partitionModes(modes).offered;
}

interface ParsedChoices {
  choices: AcpChoice[];
  dropped: number;
}

/** Reshapes `{availableModels|availableModes, current…Id}` into what the screen uses. */
function toChoices(raw: unknown, listKey: string): ParsedChoices {
  const block = asRecord(raw);
  const list = block && Array.isArray(block[listKey]) ? (block[listKey] as unknown[]) : [];
  const out: AcpChoice[] = [];
  let dropped = 0;
  for (const item of list) {
    const row = asRecord(item);
    const id =
      typeof row?.modelId === 'string'
        ? row.modelId
        : typeof row?.id === 'string'
          ? row.id
          : null;
    if (!id) {
      dropped += 1;
      continue;
    }
    const meta = asPlainRecord(row._meta);
    out.push({
      id,
      name: typeof row.name === 'string' && row.name.trim() ? row.name : id,
      description: typeof row.description === 'string' ? row.description : null,
      metaKind: typeof meta?.kind === 'string' ? meta.kind : null,
      meta,
    });
  }
  return { choices: out, dropped };
}

function currentId(raw: unknown, key: string): string | null {
  const block = asRecord(raw);
  const value = block?.[key];
  return typeof value === 'string' ? value : null;
}

/** What one session offers to choose from. An empty array when the adapter offers nothing. */
export interface AcpSessionChoices {
  models: AcpChoice[];
  currentModelId: string | null;
  modes: AcpChoice[];
  currentModeId: string | null;
  /** Modes that remain in the list but whose outside-the-folder gate has not been measured. */
  unverifiedModeIds: string[];
  /** Number of modes unreadable because the adapter's response shape was malformed. */
  droppedModeCount: number;
}

export function readSessionChoices(result: Record<string, unknown>): AcpSessionChoices {
  const modelChoices = toChoices(result.models, 'availableModels');
  const modeChoices = toChoices(result.modes, 'availableModes');
  const modePartition = partitionModes(modeChoices.choices);
  return {
    models: modelChoices.choices,
    currentModelId: currentId(result.models, 'currentModelId'),
    // Filter out the dangerous; emit the unknown along with its status.
    modes: modePartition.offered,
    currentModeId: currentId(result.modes, 'currentModeId'),
    unverifiedModeIds: modePartition.unverified,
    droppedModeCount: modeChoices.dropped + modePartition.dropped,
  };
}

/**
 * Choices after the adapter moved the session itself (`current_mode_update`).
 * A gate-removing mode is shown as current but not re-listed; `use-acp-session.ts` raises `gate-off`.
 * An unadvertised mode is shown marked unchecked.
 */
export function applyCurrentMode(
  choices: AcpSessionChoices,
  modeId: string,
): AcpSessionChoices {
  const id = modeId.trim();
  if (!id) return choices;
  if (choices.modes.some((mode) => mode.id === id)) return { ...choices, currentModeId: id };
  if (!modeKeepsGate(id)) return { ...choices, currentModeId: id };
  return {
    ...choices,
    currentModeId: id,
    modes: [...choices.modes, { id, name: id, description: null, metaKind: null, meta: null }],
    unverifiedModeIds: choices.unverifiedModeIds.includes(id)
      ? choices.unverifiedModeIds
      : [...choices.unverifiedModeIds, id],
  };
}

/** One past conversation — only as much as the list needs to draw. */
export interface AcpSessionSummary {
  sessionId: string;
  /** The absolute path of the folder that conversation was opened in. **This is the filter key.** */
  cwd: string;
  /** The title the adapter composed. Null when absent — the screen does not invent one. */
  title: string | null;
  /** An ISO string, or null. */
  updatedAt: string | null;
}

/**
 * The adapter ignores `cwd` in `session/list`, so filter here to keep unopened folders off screen.
 * Gate: `tests/contract/acp-session-scope.contract.test.ts`.
 */
export function keepSessionsInFolder(
  sessions: AcpSessionSummary[],
  cwd: string,
): AcpSessionSummary[] {
  const root = normalizeFolder(cwd);
  if (!root) return [];
  return sessions.filter((s) => normalizeFolder(s.cwd) === root);
}

/** Only trims a trailing `/`. Anything more is Rust's job (symlinks, relative paths). */
function normalizeFolder(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

/** One permission request, reduced to what the screen shows the user. */
export interface AcpPermissionRequest {
  /** Exact JSON-RPC request id. Numeric zero is valid and is never replaced. */
  requestId?: string | number | null;
  /** Session named by the permission request itself. */
  sessionId?: string | null;
  /** The human-readable line, exactly as the adapter gave it. */
  title: string | null;
  /** The ACP identifier linking this decision to the same tool's progress and completion updates. */
  toolCallId: string | null;
  /**
   * The **identifier** of the tool called (such as `mcp__atlas-vault__add_concept`). Policy reads
   * this, because an MCP tool call has no file path.
   */
  toolName: string | null;
  /** `edit`, `execute`, `read`, … — the typed fact the screen picks its icon and colour from. */
  toolKind: string | null;
  filePath: string | null;
  /** The arguments the tool actually requested. A meaning write builds its typed change from this. */
  rawInput: Record<string, unknown>;
  /** An ordinary file permission, or an ontology write needing the person's decision about meaning. */
  reviewKind: 'permission' | 'ontology-write';
  /** Present only for the structured MCP tool-call + structured approval cache chain. */
  writerCorrelation?: { status: 'verified'; server: string; tool: string; toolCall: 'structured-mcp'; approval: 'structured-mcp' };
  /** The available options — handled only by `kind`. */
  options: Array<{ optionId: string; kind: string; name: string | null }>;
}

export interface AcpClientHandlers {
  /** Streaming updates — text chunks, tool calls, plans. */
  onUpdate?: (update: Record<string, unknown>, context: { sessionId: string | null }) => void;
  /**
   * Reports a read that this client allowed without asking the screen. The caller needs this
   * because the direct auto-allow path deliberately does not enter `askUser`, where unattended
   * rounds normally record their standing scope. Without this callback a scheduled pass can finish
   * successfully while its ledger says it reached no vault tool.
   */
  onAutoAllowed?: (request: AcpPermissionRequest) => void;
  /**
   * The name of the vault MCP server we wired into the session. Only that server's read tools are
   * auto-allowed; its write tools go through the person's change review. Not passing it turns this
   * classification off — we do not pretend something exists.
   */
  vaultMcpServerName?: string;
  verdict: (filePath: string | null) => Promise<'allow-inside-vault' | 'ask'>;
  /**
   * Asks the user. Returns the chosen `optionId`, or null for a rejection.
   *
   * With no screen, or with no answer from the user, **rejection must be the default** — counting
   * an unasked question as allowed is the same as having no permission gate.
   */
  askUser: (request: AcpPermissionRequest) => Promise<string | null>;
  /** For diagnosis. Called when a line arrives that is outside the protocol. */
  onProtocolNotice?: (message: string) => void;
}

interface PendingCall {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  /**
   * Restarts this call's deadline. Used while a first-run download is **still advancing** —
   * see `extendPendingDeadlines` below.
   */
  extend: () => void;
}

/**
 * The only MCP identity trusted for a correlated permission request.
 *
 * Codex ACP intentionally keeps the permission request itself sparse and emits this structured
 * triple on the preceding `session/update`. The dotted, human-facing update title is not policy
 * input: only the adapter's explicit server/tool/arguments fields cross this boundary.
 */
interface CorrelatedMcpToolContext {
  server: string;
  tool: string;
  arguments: Record<string, unknown>;
}

/** The JSON-RPC error code answering a method we did not declare. */
const METHOD_NOT_FOUND = -32601;

export interface AcpClient {
  initialize(): Promise<Record<string, unknown>>;
  newSession(params: {
    cwd: string;
    mcpServers?: unknown[];
    /** A paragraph appended to the session's start instructions. It **does not replace** them. */
    appendSystemPrompt?: string;
  }): Promise<{ sessionId: string; choices: AcpSessionChoices }>;
  prompt(sessionId: string, blocks: unknown[]): Promise<{ stopReason?: string }>;
  cancel(sessionId: string): Promise<void>;
  /**
   * Past conversations in this folder, **filtered by `cwd`** — see the comment above. An empty array
   * when the adapter does not offer this (we do not pretend something exists).
   */
  listSessions(cwd: string): Promise<AcpSessionSummary[]>;
  /** Resumes a past conversation. Throws on failure — the caller falls through to a new one. */
  loadSession(params: {
    sessionId: string;
    cwd: string;
    mcpServers?: unknown[];
    /** Gives **the same instructions** as a new conversation, so resuming does not change the rules. */
    appendSystemPrompt?: string;
  }): Promise<{ sessionId: string; choices: AcpSessionChoices }>;
  /**
   * Changes the model. **Some adapters do not offer this** — for claude, `session/set_model` itself
   * is "no such method" (measured). So failure is swallowed and `false` returned: the screen draws
   * only what works and quietly leaves what does not absent.
   */
  setModel(sessionId: string, modelId: string): Promise<boolean>;
  /** Changes the mode. Both adapters support it (measured). */
  setMode(sessionId: string, modeId: string): Promise<boolean>;
  /** Feeds one line from the transport. Used only when the subscription is wired directly. */
  ingest(line: string): void;
  /**
   * Restarts the deadline on every in-flight call. The first launch of an adapter downloads
   * via `npx`, and nothing answers `initialize` meanwhile; the caller restarts on each
   * `npx-download-progress` notice, so the ceiling means no sign of life, not wall clock.
   */
  extendPendingDeadlines(): void;
  dispose(): void;
}

export function createAcpClient(
  transport: AcpTransport,
  handlers: AcpClientHandlers,
): AcpClient {
  let nextId = 1;
  const pending = new Map<number, PendingCall>();
  const correlatedMcpTools = new Map<string, Map<string, CorrelatedMcpToolContext>>();
  let disposed = false;

  const forgetCorrelatedTool = (sessionId: string, toolCallId: string) => {
    const sessionTools = correlatedMcpTools.get(sessionId);
    if (!sessionTools) return;
    sessionTools.delete(toolCallId);
    if (sessionTools.size === 0) correlatedMcpTools.delete(sessionId);
  };

  const clearCorrelatedSession = (sessionId: string) => {
    correlatedMcpTools.delete(sessionId);
  };

  const rememberCorrelatedMcpTool = (
    sessionId: string | null,
    update: Record<string, unknown>,
  ) => {
    if (!sessionId) return;
    const toolCallId = textValue(update.toolCallId);
    if (!toolCallId) return;

    const status = textValue(update.status);
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      forgetCorrelatedTool(sessionId, toolCallId);
      return;
    }

    // A later status-only update refines the same row. It must not erase the structured start event.
    const context = readCorrelatedMcpToolContext(update);
    if (!context) {
      // An update that claims to replace MCP input but cannot supply the full structured triple
      // invalidates the old entry. Keeping it would attach stale arguments to a malformed request.
      if (asRecord(update._meta).is_mcp_tool_call === true && update.rawInput !== undefined) {
        forgetCorrelatedTool(sessionId, toolCallId);
      }
      return;
    }
    const sessionTools = correlatedMcpTools.get(sessionId) ?? new Map();
    sessionTools.set(toolCallId, context);
    correlatedMcpTools.set(sessionId, sessionTools);
  };

  const takeCorrelatedMcpTool = (
    params: Record<string, unknown>,
  ): CorrelatedMcpToolContext | null => {
    const sessionId = textValue(params.sessionId);
    const toolCallId = textValue(asRecord(params.toolCall).toolCallId);
    if (!sessionId || !toolCallId) return null;
    const context = correlatedMcpTools.get(sessionId)?.get(toolCallId) ?? null;
    // Permission context is single-use. A duplicate or late approval must not reuse an older call.
    if (context) forgetCorrelatedTool(sessionId, toolCallId);
    return context;
  };

  /**
   * Send failures are swallowed but reported: `void` would not catch a rejection after the
   * adapter died.
   */
  const send = (payload: unknown): Promise<void> => {
    try {
      // A synchronous transport records the line in the same tick — not only the tests but the local
      // bridge's request/response ordering relies on that property.
      return Promise.resolve(transport.send(JSON.stringify(payload)));
    } catch (error) {
      return Promise.reject(error);
    }
  };

  /** Sends a notification or response that expects no answer. Failure is kept only as a diagnostic. */
  const write = (payload: unknown) => {
    void send(payload).catch((error: unknown) => {
      // Writing to an already-finished session is a normal race — kept only as a diagnostic.
      handlers.onProtocolNotice?.(`send-failed: ${String(error)}`);
    });
  };

  /** Without an answer a request never finishes, so it ends in a rejection after the timeout. */
  const call = (
    method: string,
    params: unknown,
    timeoutMs = CALL_TIMEOUT_MS,
  ): Promise<Record<string, unknown>> => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const arm = () => {
        if (timeoutMs <= 0) return;
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
          if (!pending.has(id)) return;
          pending.delete(id);
          reject(new Error(`acp-timeout: ${method}`));
        }, timeoutMs);
      };
      arm();
      const clear = () => {
        if (timer !== null) clearTimeout(timer);
      };
      pending.set(id, {
        resolve: (value) => {
          clear();
          resolve(value);
        },
        reject: (error) => {
          clear();
          reject(error);
        },
        extend: arm,
      });
      void send({ jsonrpc: '2.0', id, method, params }).catch((error: unknown) => {
        handlers.onProtocolNotice?.(`send-failed: ${String(error)}`);
        const waiting = pending.get(id);
        if (!waiting) return;
        pending.delete(id);
        waiting.reject(new Error(`acp-send-failed: ${method}: ${String(error)}`));
      });
    });
  };

  const answerPermission = async (
    id: unknown,
    params: Record<string, unknown>,
    correlatedMcpTool: CorrelatedMcpToolContext | null = null,
  ) => {
    const request = toPermissionRequest(params, correlatedMcpTool, id);
    const allowOnce = request.options.find((o) => o.kind === 'allow_once');
    const rejectOnce = request.options.find((o) => o.kind === 'reject_once');

    /*
     * The Atlas reads we wired do not block the conversation. A write continues only after the person
     * has seen the typed change, even on the same server and the same vault. Path safety and meaning
     * approval are different questions: the first being true does not answer the second.
     */
    const atlasMode = atlasToolMode(
      request.toolName,
      handlers.vaultMcpServerName ?? '',
    );
    const ontologyWrite = atlasMode === 'write';
    /*
     * Answer even when the check fails: a rejected IPC would leave the request unanswered.
     * Undecidable falls through to asking.
     */
    let verdict: 'allow-inside-vault' | 'ask' = 'ask';
    try {
      verdict = await handlers.verdict(request.filePath);
    } catch (error) {
      handlers.onProtocolNotice?.(`verdict-failed: ${String(error)}`);
    }
    /*
     * A read is auto-allowed only with no path or inside the vault. Our server names files
     * vault-relative and Rust judges absolute paths only; a relative path without `..` on an
     * Atlas read is inside by construction, since the server resolves it against its vault root.
     */
    const vaultRelativeAtlasPath =
      atlasMode !== null &&
      request.filePath !== null &&
      !request.filePath.startsWith('/') &&
      !request.filePath.split(/[\\/]/).includes('..');
    if (
      atlasMode === 'read' &&
      allowOnce &&
      (request.filePath === null || vaultRelativeAtlasPath || verdict === 'allow-inside-vault')
    ) {
      handlers.onAutoAllowed?.(request);
      write({ jsonrpc: '2.0', id, result: selected(allowOnce.optionId) });
      return;
    }
    /*
     * A non-Atlas tool is auto-allowed only inside the vault AND with a read-only kind: an agent
     * edit tool on vault Markdown can rewrite frontmatter, so it must reach the card like an
     * Atlas write. An unknown or missing kind fails closed to asking.
     */
    const readOnlyKind = request.toolKind === 'read' || request.toolKind === 'search';
    if (atlasMode === null && readOnlyKind && verdict === 'allow-inside-vault' && allowOnce) {
      handlers.onAutoAllowed?.(request);
      write({ jsonrpc: '2.0', id, result: selected(allowOnce.optionId) });
      return;
    }

    // An Atlas write, any non-read tool, access outside the vault, or an unknown path: ask the person.
    let chosen: string | null = null;
    try {
      chosen = await handlers.askUser(
        ontologyWrite ? { ...request, reviewKind: 'ontology-write' } : request,
      );
    } catch {
      chosen = null; // a failure while asking is a rejection
    }

    // Verify the user's choice really is an option of that request. A screen returning a stale
    // request's value would allow the wrong thing.
    const valid = chosen && request.options.some((o) => o.optionId === chosen);
    if (valid) {
      write({ jsonrpc: '2.0', id, result: selected(chosen as string) });
      return;
    }
    if (rejectOnce) {
      write({ jsonrpc: '2.0', id, result: selected(rejectOnce.optionId) });
      return;
    }
    // With not even a reject option, answer cancelled — no answer leaves the other side waiting forever.
    write({ jsonrpc: '2.0', id, result: { outcome: { outcome: 'cancelled' } } });
  };

  const handle = (message: Record<string, unknown>) => {
    const method = typeof message.method === 'string' ? message.method : null;
    const hasId = message.id !== undefined && message.id !== null;

    // Agent → us, a **request**: it must be answered.
    if (method && hasId) {
      if (method === 'session/request_permission') {
        const params = asRecord(message.params);
        if (isMcpToolApproval(params)) {
          const correlatedMcpTool = takeCorrelatedMcpTool(params);
          if (!correlatedMcpTool) {
            /*
             * A generic card cannot make an unidentified MCP write reviewable. Fail closed without
             * pretending the person rejected a change they were never shown. This is deliberately
             * `cancelled`, not a synthetic `reject_once` selection.
             */
            handlers.onProtocolNotice?.('permission-context-missing:mcp-tool-approval');
            write({ jsonrpc: '2.0', id: message.id, result: cancelled() });
            return;
          }
          void answerPermission(message.id, params, correlatedMcpTool);
          return;
        }
        void answerPermission(message.id, params);
        return;
      }
    // An undeclared capability. Staying silent leaves the other side stalled.
      handlers.onProtocolNotice?.(`declined:${method}`);
      write({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: METHOD_NOT_FOUND, message: `capability not declared: ${method}` },
      });
      return;
    }

    // A notification: no answer.
    if (method) {
      if (method === 'session/update') {
        const params = asRecord(message.params);
        const update = asRecord(params.update);
        rememberCorrelatedMcpTool(textValue(params.sessionId), update);
        handlers.onUpdate?.(update, { sessionId: textValue(params.sessionId) });
      }
      return;
    }

    // A response to one of our requests.
    const id = typeof message.id === 'number' ? message.id : null;
    if (id === null) return;
    const waiting = pending.get(id);
    if (!waiting) return;
    pending.delete(id);
    if (message.error) {
      waiting.reject(new Error(JSON.stringify(message.error)));
      return;
    }
    waiting.resolve(asRecord(message.result));
  };

  const ingest = (line: string) => {
    if (disposed) return;
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
    // A non-protocol line (the adapter's banner, say) is discarded — but not silently.
      handlers.onProtocolNotice?.(`unparsable:${trimmed.slice(0, 120)}`);
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;
    handle(parsed as Record<string, unknown>);
  };

  const unsubscribe = transport.subscribe(ingest);

  return {
    initialize: () =>
      call('initialize', {
        protocolVersion: 1,
    // ⚠️ File and terminal capabilities are not declared. What is not declared is treated as
    // "unsupported" (the ACP initialization convention).
        clientCapabilities: {},
      }),
    newSession: async (params) => {
      correlatedMcpTools.clear();
      const result = await call('session/new', {
        cwd: params.cwd,
        mcpServers: params.mcpServers ?? [],
        // The adapter takes an **append** through `_meta.systemPrompt` (its `type` and `preset` are
        // fixed and only `append` flows through). The default instructions are not replaced wholesale
        // because they are what make that tool itself, and we have no grounds to rewrite them.
        ...(params.appendSystemPrompt
          ? { _meta: { systemPrompt: { append: params.appendSystemPrompt } } }
          : {}),
      });
      const sessionId = typeof result.sessionId === 'string' ? result.sessionId : null;
      if (!sessionId) throw new Error('session/new response missing sessionId');
      return { sessionId, choices: readSessionChoices(result) };
    },
    prompt: async (sessionId, blocks) => {
      /*
       * A conversation turn gets **no time limit.** An agent sweeping a codebase can take minutes,
       * and throughout the screen keeps saying what is happening with "thinking" and tool rows — a
       * wait that is explained. The handshake and queries must answer promptly, so the ceiling above
       * applies to them.
       */
      const result = await call('session/prompt', { sessionId, prompt: blocks }, 0);
      return { stopReason: typeof result.stopReason === 'string' ? result.stopReason : undefined };
    },
    cancel: async (sessionId) => {
      // Cancel is a notification — no answer awaited.
      clearCorrelatedSession(sessionId);
      write({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId } });
    },
    listSessions: async (cwd) => {
      let result: Record<string, unknown>;
      try {
        result = await call('session/list', { cwd });
      } catch {
        // Some adapters do not offer this. Absent stays absent — an empty list produces the same
        // screen as "no past conversations" (nothing to choose either way).
        return [];
      }
      const raw = Array.isArray(result.sessions) ? result.sessions : [];
      const summaries: AcpSessionSummary[] = [];
      for (const item of raw) {
        const row = asRecord(item);
        const sessionId = typeof row?.sessionId === 'string' ? row.sessionId : null;
        const folder = typeof row?.cwd === 'string' ? row.cwd : null;
        // A line whose folder is unknown is **discarded.** Keeping it on "it is probably this folder"
        // is precisely the accident of another folder's titles appearing on screen.
        if (!sessionId || !folder) continue;
        summaries.push({
          sessionId,
          cwd: folder,
          title: typeof row.title === 'string' && row.title.trim() ? row.title : null,
          updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : null,
        });
      }
      return keepSessionsInFolder(summaries, cwd);
    },
    loadSession: async (params) => {
      correlatedMcpTools.clear();
      const result = await call('session/load', {
        sessionId: params.sessionId,
        cwd: params.cwd,
        mcpServers: params.mcpServers ?? [],
        /*
         * A resumed conversation gets the same system prompt as a new one, or the two run under
         * different rules.
         */
        ...(params.appendSystemPrompt
          ? { _meta: { systemPrompt: { append: params.appendSystemPrompt } } }
          : {}),
      });
      // Some adapters do not return `sessionId`, so the requested value is kept.
      const sessionId =
        typeof result.sessionId === 'string' ? result.sessionId : params.sessionId;
      return { sessionId, choices: readSessionChoices(result) };
    },
    setModel: async (sessionId, modelId) => {
      try {
        await call('session/set_model', { sessionId, modelId });
        return true;
      } catch {
        return false;
      }
    },
    setMode: async (sessionId, modeId) => {
      try {
        await call('session/set_mode', { sessionId, modeId });
        return true;
      } catch {
        return false;
      }
    },
    ingest,
    extendPendingDeadlines: () => {
      for (const [, waiting] of pending) waiting.extend();
    },
    dispose: () => {
      disposed = true;
      unsubscribe();
      for (const [, waiting] of pending) {
        waiting.reject(new Error('acp session closed'));
      }
      pending.clear();
      correlatedMcpTools.clear();
    },
  };
}

function selected(optionId: string) {
  return { outcome: { outcome: 'selected', optionId } };
}

function cancelled() {
  return { outcome: { outcome: 'cancelled' } };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isMcpToolApproval(params: Record<string, unknown>): boolean {
  return asRecord(params._meta).is_mcp_tool_approval === true;
}

function readCorrelatedMcpToolContext(
  update: Record<string, unknown>,
): CorrelatedMcpToolContext | null {
  if (asRecord(update._meta).is_mcp_tool_call !== true) return null;
  const rawInput = asPlainRecord(update.rawInput);
  if (!rawInput) return null;
  const server = textValue(rawInput.server);
  const tool = textValue(rawInput.tool);
  const argumentsValue = asPlainRecord(rawInput.arguments);
  if (!server || !tool || !argumentsValue) return null;
  return { server, tool, arguments: argumentsValue };
}

/** Reduces the raw permission request to what the screen and the policy use. */
/**
 * Extracts the **name of the tool** called. Structured fields first, falling back to the title.
 *
 * ⚠️ This looks like it conflicts with this file's rule against judging policy by title
 * (contract ②), but it does not. What that rule prevents is scraping a path out of **a sentence
 * written for a person to read** (change the wording and the policy silently flips). What is
 * looked for here is an **identifier**, not a sentence, and the structured field takes precedence —
 * the `_meta` of an `allow_always` option carries `targets[].toolName` (measured). The title is the
 * fallback when that is absent, and measured, that value was the tool name itself
 * (`"mcp__atlas-vault__add_concept"`).
 */
function readToolName(params: Record<string, unknown>): string | null {
  const options = Array.isArray(params.options) ? params.options : [];
  for (const entry of options) {
    const changes = asRecord(asRecord(asRecord(entry)._meta).permission).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const targets = asRecord(change).targets;
      if (!Array.isArray(targets)) continue;
      for (const target of targets) {
        const t = asRecord(target);
        if (t.type === 'tool' && typeof t.toolName === 'string') return t.toolName;
      }
    }
  }
  const title = asRecord(params.toolCall).title;
  return typeof title === 'string' ? title : null;
}

/**
 * Finds the path carried by the request; the argument name differs per tool. Our server uses
 * `filePath`, claude built-ins use `file_path`. Folder-sweeping tools take a directory
 * (`rootPath`), which is checked too.
 */
function readPathArg(rawInput: Record<string, unknown>): string | null {
  const KEYS = ['file_path', 'filePath', 'rootPath', 'root_path', 'path', 'targetPath'];
  for (const key of KEYS) {
    const value = rawInput[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

/**
 * The sentence shown on the permission card. A server-side elicitation reaches ACP with no
 * `toolCall.title`; `codex-acp` puts the message in `toolCall.content[]`. `title` wins when
 * present.
 */
function readPermissionTitle(toolCall: Record<string, unknown>): string | null {
  if (typeof toolCall.title === 'string' && toolCall.title.trim()) return toolCall.title;
  const content = Array.isArray(toolCall.content) ? toolCall.content : [];
  for (const entry of content) {
    const inner = asRecord(asRecord(entry).content);
    if (inner.type === 'text' && typeof inner.text === 'string' && inner.text.trim()) {
      return inner.text.trim();
    }
  }
  return null;
}

export function toPermissionRequest(
  params: Record<string, unknown>,
  correlatedMcpTool: CorrelatedMcpToolContext | null = null,
  requestId: unknown = null,
): AcpPermissionRequest {
  const toolCall = asRecord(params.toolCall);
  const rawInput = correlatedMcpTool?.arguments ?? asRecord(toolCall.rawInput);
  const rawOptions = Array.isArray(params.options) ? params.options : [];
  return {
    requestId: typeof requestId === 'string' || typeof requestId === 'number' ? requestId : null,
    sessionId: typeof params.sessionId === 'string' ? params.sessionId : null,
    title: readPermissionTitle(toolCall),
    toolCallId: typeof toolCall.toolCallId === 'string' ? toolCall.toolCallId : null,
    toolName: correlatedMcpTool
      ? `mcp__${correlatedMcpTool.server}__${correlatedMcpTool.tool}`
      : readToolName(params),
    toolKind: typeof toolCall.kind === 'string' ? toolCall.kind : null,
    // The policy reads this value, not the title: the title is relative inside the vault and
    // absolute outside, so the policy would flip when the wording changes.
    filePath: readPathArg(rawInput),
    rawInput,
    reviewKind: 'permission',
    ...(correlatedMcpTool ? { writerCorrelation: { status: 'verified' as const, server: correlatedMcpTool.server,
      tool: correlatedMcpTool.tool, toolCall: 'structured-mcp' as const, approval: 'structured-mcp' as const } } : {}),
    options: rawOptions.flatMap((entry) => {
      const option = asRecord(entry);
      const optionId = typeof option.optionId === 'string' ? option.optionId : null;
      const kind = typeof option.kind === 'string' ? option.kind : null;
      if (!optionId || !kind) return [];
      return [{ optionId, kind, name: typeof option.name === 'string' ? option.name : null }];
    }),
  };
}
