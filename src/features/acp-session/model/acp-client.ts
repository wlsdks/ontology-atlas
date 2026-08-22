/**
 * The ACP client — the layer that turns line-delimited JSON-RPC into a conversation.
 *
 * Transport (process stdio) is injected, so this file's tests run with no real process and the
 * process layer's tests need know nothing of the protocol.
 *
 * **The four contracts this file keeps:**
 *
 * 1. **Only two implementations are required** — `session/request_permission` and
 *    `session/update`. File read/write, terminal, and elicitation are all optional and we **do not
 *    declare them.** An undeclared method is answered with "no such thing".
 *    ⚠️ That alone is not the permission gate — an undeclared capability closes only the ACP
 *    channel, and the real CLI the adapter wraps does not consult this declaration for its own
 *    tools. The actual gate comes from the config the app isolates (`src-tauri/src/acp.rs`).
 * 2. **Never hardcode an `optionId`.** Options are located by `kind` (`allow_once`,
 *    `reject_once`, …). Measured, those values were short strings like `allow` and `reject`, but
 *    the adapter decides them and they can change at any time.
 * 3. **The app never picks `allow_always` on the user's behalf.** That option carries a rule
 *    granting "this entire directory for the whole session" (measured). Widening the boundary is
 *    the user's decision alone.
 * 4. **Ask Rust for the verdict.** Reimplementing inside/outside-vault here makes two copies, and
 *    the browser side cannot resolve symlinks and not-yet-existing paths correctly anyway.
 */

import { partitionModes } from './mode-safety';
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
}

/**
 * Ceiling on waiting for an answer. One conversation turn can take longer than this, so it applies
 * **only to the handshake and to queries** (`prompt` gets no limit — see its implementation below).
 */
const CALL_TIMEOUT_MS = 45_000;

/**
 * ⚠️ **The verdict is not rewritten here** (2026-08-17).
 *
 * This function used to be a one-line denylist — hiding only the names written down, so an adapter
 * adding a new mode made it visible and selectable **without our knowing**. A safety device that
 * treats what it does not know as safe is not a device.
 *
 * The verdict is owned solely by `mode-safety.ts`: hide what was measured to be dangerous, offer
 * what was measured to be fine, and **offer what was never measured while marking it unknown.**
 */
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
    out.push({
      id,
      name: typeof row.name === 'string' && row.name.trim() ? row.name : id,
      description: typeof row.description === 'string' ? row.description : null,
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
 * **We do the filtering** (measured 2026-08-16).
 *
 * Passing `cwd` to `session/list` does **not** make the adapter filter by that folder — measured,
 * conversations from other repositories that were never opened came back, titles and all
 * (`/Users/…/side-project/…`'s "디자인 시스템 수준 파악" among them).
 *
 * Rendering that as-is puts **work titles from folders the user has never opened in this app** on
 * screen. The trust charter's second promise (zero collection without the user knowing) and the
 * local-first rule (do not sweep outside the vault) both forbid it outright.
 *
 * So this function is the only path and it must filter here. Even if the adapter starts filtering
 * properly later, this check stays — our promises are not staked on someone else's behaviour.
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
  /** An absolute path when present. The basis for the policy verdict and what the screen displays. */
  filePath: string | null;
  /** The arguments the tool actually requested. A meaning write builds its typed change from this. */
  rawInput: Record<string, unknown>;
  /** An ordinary file permission, or an ontology write needing the person's decision about meaning. */
  reviewKind: 'permission' | 'ontology-write';
  /** The available options — handled only by `kind`. */
  options: Array<{ optionId: string; kind: string; name: string | null }>;
}

export interface AcpClientHandlers {
  /** Streaming updates — text chunks, tool calls, plans. */
  onUpdate?: (update: Record<string, unknown>) => void;
  /**
   * The name of the vault MCP server we wired into the session. Only that server's read tools are
   * auto-allowed; its write tools go through the person's change review. Not passing it turns this
   * classification off — we do not pretend something exists.
   */
  vaultMcpServerName?: string;
  /** Is this path inside the vault? Goes to the Rust verdict. */
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
  dispose(): void;
}

export function createAcpClient(
  transport: AcpTransport,
  handlers: AcpClientHandlers,
): AcpClient {
  let nextId = 1;
  const pending = new Map<number, PendingCall>();
  let disposed = false;

  /**
   * Sends one line.
   *
   * ⚠️ **Failure is swallowed but not silently** (review 2026-08-16). This used to be
   * `void transport.send(...)`, and `void` **does not catch** a failure — answering a permission
   * card or pressing "stop" just after the adapter died has that send rejected, and an unhandled
   * rejection surfaces in the console.
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

  /**
   * One request. **With no answer it never finishes** — hence the time limit.
   *
   * Review 2026-08-16: with the adapter up but not answering (a wrong binary, or npx waiting on
   * something), status stuck at "starting" — and in that state the "new conversation" button was
   * locked too, so **closing the panel was the only way out.** Now it ends in a rejection after the
   * timeout, and the screen says so.
   */
  const call = (
    method: string,
    params: unknown,
    timeoutMs = CALL_TIMEOUT_MS,
  ): Promise<Record<string, unknown>> => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              if (!pending.has(id)) return;
              pending.delete(id);
              reject(new Error(`acp-timeout: ${method}`));
            }, timeoutMs)
          : null;
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

  const answerPermission = async (id: unknown, params: Record<string, unknown>) => {
    const request = toPermissionRequest(params);
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
     * ⚠️ **Answer even when the verdict fails** (caught in review, 2026-08-16).
     * `await handlers.verdict(...)` used to be unwrapped, so a rejected IPC (the window closing, a
     * bridge error) left this request with **no answer at all**. The other side waits forever and the
     * user sees neither a card nor an error.
     *
     * Undecidable falls through to **asking** — the safe side.
     */
    let verdict: 'allow-inside-vault' | 'ask' = 'ask';
    try {
      verdict = await handlers.verdict(request.filePath);
    } catch (error) {
      handlers.onProtocolNotice?.(`verdict-failed: ${String(error)}`);
    }
    /* A read is auto-allowed only with no path or inside the vault. A read outside falls through to
       the ordinary permission card too. */
    if (
      atlasMode === 'read' &&
      allowOnce &&
      (request.filePath === null || verdict === 'allow-inside-vault')
    ) {
      write({ jsonrpc: '2.0', id, result: selected(allowOnce.optionId) });
      return;
    }
    if (!ontologyWrite && verdict === 'allow-inside-vault' && allowOnce) {
      write({ jsonrpc: '2.0', id, result: selected(allowOnce.optionId) });
      return;
    }

    // An Atlas write, access outside the vault, or a generic tool with an unknown path: ask the person.
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
        void answerPermission(message.id, asRecord(message.params));
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
        handlers.onUpdate?.(asRecord(params.update));
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
      const result = await call('session/load', {
        sessionId: params.sessionId,
        cwd: params.cwd,
        mcpServers: params.mcpServers ?? [],
        /*
         * ⚠️ **A resumed conversation gets the same instructions** (caught in review, 2026-08-16).
         *
         * They used to be attached to new conversations only. So a session resumed from "past
         * conversations" **ran under different rules** — no requirement to write `why` when changing a
         * relation, no requirement to stay inside the folder. If a conversation started yesterday and
         * one started today behave differently on the same screen and the same folder, that is not a rule.
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
    dispose: () => {
      disposed = true;
      unsubscribe();
      for (const [, waiting] of pending) {
        waiting.reject(new Error('acp session closed'));
      }
      pending.clear();
    },
  };
}

function selected(optionId: string) {
  return { outcome: { outcome: 'selected', optionId } };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
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
 * Is this tool from **the vault MCP server we wired**?
 *
 * Why this is needed (found by measurement, 2026-08-16). Running a real session end to end showed
 * **the agent could not write anything to the map.** Our own gate was blocking our own tools:
 *
 * ```
 * permission request: outside · (no path)  ×4  → all rejected
 * answer: "every MCP tool call was blocked by a permission denial, so nothing was actually written to the map"
 * ```
 *
 * The cause was that the policy **only knew how to look at file paths**. An MCP tool call has no
 * `file_path`, so it fell through to "path unknown → ask", and in a measurement environment with no
 * auto-answer that meant rejection.
 *
 * But that server is **one we launched with the vault path**, so it cannot touch anything outside
 * the vault — auto-allow is right on exactly the same grounds as "a file inside the vault". What the
 * gate protects is "outside the vault", not "using a tool".
 *
 * ⚠️ **One residual risk**: a project's `.mcp.json` defining a server with the same name could
 * borrow this verdict. A name collision causes a conflict on the adapter side, so it is a narrow
 * hole, but not zero. Hence the name is not written here as a literal but taken from **the very
 * constant we inject with** — change one place and both move together.
 */
export function isVaultMcpTool(toolName: string | null, serverName: string): boolean {
  if (!toolName || !serverName) return false;
  return toolName.startsWith(`mcp__${serverName}__`);
}

/**
 * Finds the **path** carried by the request — the argument name differs per tool.
 *
 * Why several names are checked (caught in the second review, 2026-08-16). It used to check
 * `file_path` **alone**. That is the name used by claude's built-in tools, and **the MCP server we
 * wire never uses it once** — our server's argument is `filePath` (measured: `mcp/src/index.js` has
 * zero `file_path` and 30 `filePath`). So a request from our own tools was always "path unknown",
 * and the hole the previous commit claimed to have closed **was in fact still open.**
 *
 * Worse, the test written at the time hand-crafted a `file_path` — a shape the real server never
 * produces, so the test was green while the screen was wide open. That is the failure this
 * repository records as "a gate that passes on invented input is not a gate".
 *
 * Tools that sweep a folder (`analyze_repo_structure`, `index_project`, `infer_imports`,
 * `connect_project_source`) take a **directory** rather than a file, so their name (`rootPath`) is
 * checked too. The verdict is ultimately "is this path inside the vault", and that question has an
 * answer for a folder as much as for a file.
 */
function readPathArg(rawInput: Record<string, unknown>): string | null {
  const KEYS = ['file_path', 'filePath', 'rootPath', 'root_path', 'path', 'targetPath'];
  for (const key of KEYS) {
    const value = rawInput[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

export function toPermissionRequest(params: Record<string, unknown>): AcpPermissionRequest {
  const toolCall = asRecord(params.toolCall);
  const rawInput = asRecord(toolCall.rawInput);
  const rawOptions = Array.isArray(params.options) ? params.options : [];
  return {
    title: typeof toolCall.title === 'string' ? toolCall.title : null,
    toolCallId: typeof toolCall.toolCallId === 'string' ? toolCall.toolCallId : null,
    toolName: readToolName(params),
    toolKind: typeof toolCall.kind === 'string' ? toolCall.kind : null,
    // The verdict uses this value rather than the title — the title is a relative path inside the
    // vault and an absolute one outside, so the policy silently flips the day the wording changes.
    filePath: readPathArg(rawInput),
    rawInput,
    reviewKind: 'permission',
    options: rawOptions.flatMap((entry) => {
      const option = asRecord(entry);
      const optionId = typeof option.optionId === 'string' ? option.optionId : null;
      const kind = typeof option.kind === 'string' ? option.kind : null;
      if (!optionId || !kind) return [];
      return [{ optionId, kind, name: typeof option.name === 'string' ? option.name : null }];
    }),
  };
}
