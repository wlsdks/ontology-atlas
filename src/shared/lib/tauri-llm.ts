import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

/**
 * The vault agent's chat round trip — the Tauri IPC bridge (a typed wrapper over
 * `llm_chat` in `src-tauri/src/llm.rs`), following the conventions of
 * `tauri-secrets.ts`.
 *
 * Contract (the Rust code is the source of truth):
 * - `llm_chat(provider, vaultPath, model, question, body, scope)` → `LlmChatEcho`
 *
 * **No key passes through this file.** The WebView assembles the request body only;
 * Rust reads the key from the keychain and attaches the auth header. The response
 * body comes back because it needs normalising, but the audit log records only its
 * length — this is not a conversation store.
 *
 * Web degradation contract: outside a Tauri runtime `isLlmChatBridgeAvailable()` is
 * false and `llmChat` returns `null` without invoking. Callers then do not render the
 * input at all and explain honestly why it is desktop-only. Having no transport path
 * in the web build is the trust charter's honest degradation.
 */

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

/**
 * One chat round trip, **only within the turn where the user pressed send**. The
 * vault path is required because the audit log lives inside the vault: with nowhere
 * to record it, Rust does not send (log-before-send).
 */
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
}): Promise<LlmChatEcho | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<LlmChatEcho>('llm_chat', {
    provider: args.provider,
    vaultPath: args.vaultPath,
    model: args.model,
    question: args.question,
    body: args.body,
    scope: args.scope,
    baseUrl: args.baseUrl ?? null,
  });
}

/** invoke rejection payload → one line for the user (Rust returns `Err(String)`). */
export function llmChatErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return String(err);
}
