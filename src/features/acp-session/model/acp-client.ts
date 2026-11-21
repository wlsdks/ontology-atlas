/**
 * Line-delimited JSON-RPC ACP client; only `session/request_permission` and `session/update` are implemented.
 * Never pick `allow_always` for the user (it grants the directory); inside-vault is decided in Rust.
 */

import { atlasToolMode } from './permissions/atlas-tool-policy';
import {
  createMcpToolCorrelation,
  isMcpToolApproval,
  type CorrelatedMcpToolContext,
} from './permissions/mcp-tool-correlation';
import { cancelledOutcome, autoAllowOption, permissionOutcome, selectedOutcome } from './permissions/permission-answer';
import { toPermissionRequest, type AcpPermissionRequest } from './permissions/permission-request';
import { readSessionChoices, type AcpSessionChoices } from './session-choices/acp-session-choices';
import { asRecord, textValue } from './adapter-json';
import { readSessionSummaries, type AcpSessionSummary } from './session-summaries';
import type { AcpPermissionVerdict } from '@/shared/lib/agent-chat/tauri-acp';

export interface AcpTransport {
  send(line: string): void | Promise<void>;
  subscribe(onLine: (line: string) => void): () => void;
}

/** Only the handshake and queries time out; a conversation turn (`prompt`) can take longer. */
const CALL_TIMEOUT_MS = 45_000;

export interface AcpClientHandlers {
  onUpdate?: (update: Record<string, unknown>, context: { sessionId: string | null }) => void;
  /**
   * Reports a read allowed without asking the screen: that path skips `askUser`, where unattended rounds
   * record their standing scope, so without this a pass can finish with a ledger that says it reached no vault tool.
   */
  onAutoAllowed?: (request: AcpPermissionRequest) => void;
  /** The vault MCP server wired into the session: only its read tools are auto-allowed; omitted, the classification is off. */
  vaultMcpServerName?: string;
  verdict: (filePath: string | null) => Promise<AcpPermissionVerdict>;
  /** The chosen `optionId`, or null for a rejection. With no screen or no answer, rejection is the default: an unasked question counted as allowed is no gate. */
  askUser: (request: AcpPermissionRequest) => Promise<string | null>;
  /** True while every request must be refused unseen, before any automatic allow (a stopped turn). */
  refuseAll?: () => boolean;
  /**
   * True once the screen asked the agent to cancel the turn. A request still waiting for an answer then
   * gets the `cancelled` outcome, as the protocol requires of every request pending at `session/cancel`.
   */
  cancelRequested?: () => boolean;
  onProtocolNotice?: (message: string) => void;
}

interface PendingCall {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  extend: () => void;
}


const METHOD_NOT_FOUND = -32601;

export interface AcpClient {
  initialize(): Promise<Record<string, unknown>>;
  newSession(params: {
    cwd: string;
    mcpServers?: unknown[];
    appendSystemPrompt?: string;
  }): Promise<{ sessionId: string; choices: AcpSessionChoices }>;
  prompt(sessionId: string, blocks: unknown[]): Promise<{ stopReason?: string }>;
  cancel(sessionId: string): Promise<void>;
  listSessions(cwd: string): Promise<AcpSessionSummary[]>;
  loadSession(params: {
    sessionId: string;
    cwd: string;
    mcpServers?: unknown[];
    appendSystemPrompt?: string;
  }): Promise<{ sessionId: string; choices: AcpSessionChoices }>;
  /** Some adapters do not offer this (claude's `session/set_model` is "no such method"), so failure is swallowed and false returned. */
  setModel(sessionId: string, modelId: string): Promise<boolean>;
  setMode(sessionId: string, modeId: string): Promise<boolean>;
  ingest(line: string): void;
  /** Restarts the deadline on every in-flight call: a first launch downloads via `npx` and nothing answers `initialize` meanwhile. */
  extendPendingDeadlines(): void;
  dispose(): void;
}

export function createAcpClient(
  transport: AcpTransport,
  handlers: AcpClientHandlers,
): AcpClient {
  let nextId = 1;
  const pending = new Map<number, PendingCall>();
  const correlation = createMcpToolCorrelation();
  let disposed = false;

  // Failures are reported, not dropped: `void` would not catch a rejection after the adapter died.
  const send = (payload: unknown): Promise<void> => {
    try {
      // A synchronous transport records the line in the same tick; the local bridge's request/response ordering relies on it.
      return Promise.resolve(transport.send(JSON.stringify(payload)));
    } catch (error) {
      return Promise.reject(error);
    }
  };

  const write = (payload: unknown) => {
    void send(payload).catch((error: unknown) => {
      // Writing to an already-finished session is a normal race — kept only as a diagnostic.
      handlers.onProtocolNotice?.(`send-failed: ${String(error)}`);
    });
  };

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
    if (handlers.refuseAll?.()) {
      write({ jsonrpc: '2.0', id, result: permissionOutcome(request.options, null) });
      return;
    }

    const atlasMode = atlasToolMode(
      request.toolName,
      handlers.vaultMcpServerName ?? '',
    );
    const ontologyWrite = atlasMode === 'write';
    /*
     * Answer even when the check fails: a rejected IPC would leave the request unanswered.
     * Undecidable falls through to asking.
     */
    let verdict: AcpPermissionVerdict = 'ask';
    try {
      verdict = await handlers.verdict(request.filePath);
    } catch (error) {
      handlers.onProtocolNotice?.(`verdict-failed: ${String(error)}`);
    }
    const autoAllow = autoAllowOption(request, atlasMode, verdict);
    if (autoAllow) {
      handlers.onAutoAllowed?.(request);
      write({ jsonrpc: '2.0', id, result: selectedOutcome(autoAllow.optionId) });
      return;
    }

    // An Atlas write, any non-read tool, access outside the vault, or an unknown path: ask the person.
    let chosen: string | null = null;
    try {
      chosen = await handlers.askUser({
        ...request,
        pathVerdict: verdict,
        ...(ontologyWrite ? { reviewKind: 'ontology-write' as const } : {}),
      });
    } catch {
      chosen = null; // a failure while asking is a rejection
    }

    if (handlers.cancelRequested?.()) {
      write({ jsonrpc: '2.0', id, result: cancelledOutcome() });
      return;
    }
    write({ jsonrpc: '2.0', id, result: permissionOutcome(request.options, chosen) });
  };

  const handle = (message: Record<string, unknown>) => {
    const method = typeof message.method === 'string' ? message.method : null;
    const hasId = message.id !== undefined && message.id !== null;

    if (method && hasId) {
      if (method === 'session/request_permission') {
        const params = asRecord(message.params);
        if (isMcpToolApproval(params)) {
          const correlatedMcpTool = correlation.take(params);
          if (!correlatedMcpTool) {
            /*
             * A generic card cannot make an unidentified MCP write reviewable: fail closed as `cancelled`, not a
             * synthetic `reject_once` the person never made.
             */
            handlers.onProtocolNotice?.('permission-context-missing:mcp-tool-approval');
            write({ jsonrpc: '2.0', id: message.id, result: cancelledOutcome() });
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

    if (method) {
      if (method === 'session/update') {
        const params = asRecord(message.params);
        const update = asRecord(params.update);
        correlation.remember(textValue(params.sessionId), update);
        handlers.onUpdate?.(update, { sessionId: textValue(params.sessionId) });
      }
      return;
    }

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
    // File and terminal capabilities are not declared; undeclared means "unsupported" (the ACP initialization convention).
        clientCapabilities: {},
      }),
    newSession: async (params) => {
      correlation.clear();
      const result = await call('session/new', {
        cwd: params.cwd,
        mcpServers: params.mcpServers ?? [],
        // The adapter takes an append through `_meta.systemPrompt` (only `append` flows through); the default instructions are
        // not replaced because they are what make that tool itself.
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
       * A turn gets no time limit: an agent sweeping a codebase can take minutes, and the screen keeps saying
       * what is happening. The handshake and queries must answer promptly, so the ceiling applies to them.
       */
      const result = await call('session/prompt', { sessionId, prompt: blocks }, 0);
      return { stopReason: typeof result.stopReason === 'string' ? result.stopReason : undefined };
    },
    cancel: async (sessionId) => {
      correlation.clearSession(sessionId);
      write({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId } });
    },
    listSessions: async (cwd) => {
      let result: Record<string, unknown>;
      try {
        result = await call('session/list', { cwd });
      } catch {
        return [];
      }
      return readSessionSummaries(result, cwd);
    },
    loadSession: async (params) => {
      correlation.clear();
      const result = await call('session/load', {
        sessionId: params.sessionId,
        cwd: params.cwd,
        mcpServers: params.mcpServers ?? [],
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
      correlation.clear();
    },
  };
}
