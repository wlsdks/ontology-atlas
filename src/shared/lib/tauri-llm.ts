import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

import { type NativeErrorLookup, nativeErrorMessage } from './native-error';

/** Native model transport keeps credentials and audit writes in Rust; the web has no transport. */

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  if (!isTauri()) return null;
  return (command, args) => tauriInvoke(command, args);
}

/** Tool calls carried by this round trip — only the name and target are recorded. */
interface LlmToolRef {
  name: string;
  target: string;
}

/**
 * What was actually sent — **measured values only.** An estimate here makes the
 * on-screen footer and the audit line lie at the same time.
 */
export interface LlmChatScope {
  /** Slugs of the vault nodes whose excerpts were sent up to this round trip. */
  nodes: string[];
  /** Total characters of the system prompt plus the whole conversation. */
  promptChars: number;
  /** How many of those characters are vault excerpts. */
  vaultChars: number;
  tools: LlmToolRef[];
}

/** Rust `LlmChatEcho` (serde camelCase). */
export interface LlmChatEcho {
  status: number;
  /** The vendor's raw response body; the adapter does the normalising. */
  body: string;
  /** Where this round trip actually went. */
  host: string;
  durationMs: number;
  /** Timestamp of the audit line this round trip left behind. */
  loggedAt: string;
}

/** Whether the Tauri chat IPC is available; false takes the web degradation path. */
export function isLlmChatBridgeAvailable(): boolean {
  return getInvoke() !== null;
}

const cancelledRequests = new Map<string, Set<Promise<void>>>();

function rejectAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('The request was cancelled.', 'AbortError');
}

/** A replacement waits for canceled native sends to finish their same-vault audit cleanup. */
export async function llmChat(args: {
  provider: string;
  vaultPath: string;
  model: string;
  /** The user's own words that opened this turn; the same value rides every round trip. */
  question: string | null;
  /** The JSON body in the vendor's own format. */
  body: string;
  scope: LlmChatScope;
  /**
   * Passed only on the connect-by-address branch. Passing it alongside a named
   * vendor is rejected by Rust: no path is left for a keychain key to leave for a
   * host the screen never promised.
   */
  baseUrl?: string | null;
  signal?: AbortSignal;
}): Promise<LlmChatEcho | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  rejectAborted(args.signal);
  while (cancelledRequests.has(args.vaultPath)) {
    await Promise.all(cancelledRequests.get(args.vaultPath) ?? []);
    rejectAborted(args.signal);
  }
  let requestId: string | null = null;
  let cancellation: Promise<unknown> | null = null;
  let settle!: () => void;
  const settled = new Promise<void>((resolve) => { settle = resolve; });
  const cancel = () => {
    if (requestId && !cancellation) {
      cancellation = invoke('llm_chat_cancel', { requestId }).catch(() => undefined);
    }
    return cancellation;
  };
  const onAbort = () => {
    const pending = cancelledRequests.get(args.vaultPath) ?? new Set<Promise<void>>();
    pending.add(settled);
    cancelledRequests.set(args.vaultPath, pending);
    void cancel();
  };
  args.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    requestId = await invoke<string>('llm_chat_prepare');
    rejectAborted(args.signal);
    return await invoke<LlmChatEcho>('llm_chat', {
      requestId,
      provider: args.provider,
      vaultPath: args.vaultPath,
      model: args.model,
      question: args.question,
      body: args.body,
      scope: args.scope,
      baseUrl: args.baseUrl ?? null,
    });
  } finally {
    args.signal?.removeEventListener('abort', onAbort);
    await cancel();
    const pending = cancelledRequests.get(args.vaultPath);
    pending?.delete(settled);
    if (pending?.size === 0) cancelledRequests.delete(args.vaultPath);
    settle();
  }
}

/**
 * invoke rejection payload → one line for the user.
 *
 * Rust answers with `<code>: <English detail>` (`src-tauri/src/errors.rs`); the
 * optional lookup is the `nativeErrors` catalogue. Without one the payload comes
 * back untouched, which the agent loop relies on: it recognises a failed turn by the
 * `audit-blocked:` / `timed-out:` prefix.
 */
export function llmChatErrorMessage(err: unknown, lookup?: NativeErrorLookup): string {
  return nativeErrorMessage(err, lookup);
}
