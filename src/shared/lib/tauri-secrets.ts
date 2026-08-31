import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

import { type NativeErrorLookup, nativeErrorMessage } from './native-error';

/**
 * BYOK key storage — the Tauri IPC bridge (a typed wrapper over
 * `src-tauri/src/secrets.rs` and `llm.rs`), following the conventions in
 * `tauri-git.ts`.
 *
 * Contract (the Rust code is the source of truth):
 * - `secret_set(provider, secret)`       → `SecretStatus`
 * - `secret_status(provider)`            → `SecretStatus` — absent is a normal state
 * - `secret_clear(provider)`             → `SecretStatus` — idempotent, throws if it could not delete
 * - `secret_verify(provider, vaultPath)` → `LlmVerifyResult`
 *
 * **No command returns the full key.** The UI only ever learns `stored` and
 * `last4`, and a source-reflection test in `secrets.rs` enforces that. So no
 * type here holds a key either — it flows through `secretSet`'s argument once,
 * and the caller drops it from its own state the moment the call succeeds.
 *
 * Web degradation contract: outside the Tauri runtime
 * `isSecretBridgeAvailable()` is false and every wrapper returns `null` without
 * invoking, so callers render no input field at all and explain honestly why
 * this is desktop-only.
 */

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  if (!isTauri()) return null;
  return (command, args) => tauriInvoke(command, args);
}

/**
 * Same order as the Rust `PROVIDERS` allow-list, which is also the display order.
 *
 * Named vendors are **frozen at three** (rationale: the matching constant's
 * comment in `secrets.rs`). Read that condition before adding a fourth here —
 * every other vendor goes down the branch where the user types the address,
 * not the named-vendor arm.
 */
export const SECRET_PROVIDERS = ['anthropic', 'openai', 'gemini'] as const;
export type SecretProvider = (typeof SECRET_PROVIDERS)[number];

/**
 * The host each key actually travels to. This is what lets the UI say where the
 * key goes **before** it is pasted, and the same host lands in the audit line's
 * `host`.
 *
 * The source of truth is the Rust-side verification URL (`src-tauri/src/llm.rs`).
 * If these values diverge, the destination the UI promised stops matching the
 * real one — so both test suites read the shared fixture
 * `tests/fixtures/llm-provider-hosts.json`.
 */
export const SECRET_PROVIDER_HOSTS: Record<SecretProvider, string> = {
  anthropic: 'api.anthropic.com',
  openai: 'api.openai.com',
  gemini: 'generativelanguage.googleapis.com',
};

/**
 * The **fourth branch**, not a named vendor — a local/open-source runner whose
 * address the user types in (Ollama · LM Studio · llama.cpp server · vLLM …).
 *
 * There is no key here, which is why it stays out of the keychain allow-list
 * (`SECRET_PROVIDERS`): with no secret to store, `secret_set`/`secret_status`/
 * `secret_clear` have nothing to act on. The address and model live in this
 * browser's localStorage instead (`local-endpoint.ts`); the runner itself is
 * still the source of truth.
 */
export const LOCAL_PROVIDER = 'local';

/** Ollama's default port. Same value as the Rust `LOCAL_DEFAULT_BASE_URL`. */
export const LOCAL_DEFAULT_BASE_URL = 'http://localhost:11434';

/** Every provider that can be connected — the three that take a key plus the one that takes an address. */
export type ConnectionProvider = SecretProvider | typeof LOCAL_PROVIDER;


/** Rust `SecretStatus` (serde camelCase). */
export interface SecretStatus {
  provider: string;
  /** Whether the key is in this machine's keychain. */
  stored: boolean;
  /** Last 4 characters, only when present. The full key never arrives by any path. */
  last4: string | null;
}

/** Rust `LlmVerifyResult`. */
export interface LlmVerifyResult {
  provider: string;
  ok: boolean;
  /**
   * Whether the key itself was rejected. **The UI never re-derives this from the
   * status code** — the code that means "rejected" differs per vendor (Gemini
   * answers 400, not 401). Rust decides once, and the same conclusion is what
   * lands in the audit line.
   */
  denied: boolean;
  httpStatus: number | null;
  /** One line for a network failure and the like. Never contains the key. */
  message: string | null;
  durationMs: number;
  /** Timestamp of the audit line this call wrote. */
  loggedAt: string;
  /**
   * The verification response body — present **only on success down the address
   * branch**, where the body is the list of installed models. `local-endpoint.ts`
   * parses it (Rust does not know vendor schemas). Always null for named vendors.
   */
  body: string | null;
}

/** Whether the Tauri storage IPC is available — false means the degraded web path. */
export function isSecretBridgeAvailable(): boolean {
  return getInvoke() !== null;
}

/**
 * Signal that key-possession state has just changed.
 *
 * The key is registered on one surface (the settings sheet) and comes alive on
 * another (the map's right dock). If each queried the keychain only at its own
 * mount, a user who entered a key would come back to a screen that needs a
 * **reload** — a defect. So a successful save or delete announces once and
 * listeners re-query themselves: the state is not hoisted into a shared store
 * (the keychain is the source of truth), only the moment to refresh is shared.
 */
const SECRET_CHANGE_EVENT = 'ontology-atlas:secret-change';

function notifySecretChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SECRET_CHANGE_EVENT));
}

/** Subscribe to key-possession changes. Returns the unsubscribe function. */
export function subscribeSecretChange(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(SECRET_CHANGE_EVENT, handler);
  return () => window.removeEventListener(SECRET_CHANGE_EVENT, handler);
}

/** Store — **only when the user pastes and presses save**. The caller discards the input on success. */
export async function secretSet(
  provider: SecretProvider,
  secret: string,
): Promise<SecretStatus | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  const status = await invoke<SecretStatus>('secret_set', { provider, secret });
  notifySecretChange();
  return status;
}

/** Read status — "is it there · last 4 characters". */
export async function secretStatus(
  provider: SecretProvider,
): Promise<SecretStatus | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<SecretStatus>('secret_status', { provider });
}

/**
 * Delete — **absent still counts as success (idempotent), but a failed delete
 * throws** (2026-08-17).
 *
 * Rust used to discard the delete result and unconditionally report "deleted".
 * With a locked keychain the UI said "deleted" while **the key was still there**.
 * A false "deleted" is what makes someone walk away reassured — and hand the
 * machine on believing the key is gone.
 *
 * The two cases are now separated: "there was nothing" vs "could not delete".
 * The latter throws, so the caller surfaces it via `secretErrorMessage`.
 */
export async function secretClear(
  provider: SecretProvider,
): Promise<SecretStatus | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  const status = await invoke<SecretStatus>('secret_clear', { provider });
  notifySecretChange();
  return status;
}

/**
 * Connection check — the minimal request that verifies auth only. **Zero
 * characters of vault data** leave, and the call is recorded in the vault's
 * `.ontology-atlas/llm-audit.jsonl`. That is why the vault path is required:
 * with nowhere to record it, Rust does not send (log-before-send).
 */
export async function secretVerify(
  provider: ConnectionProvider,
  vaultPath: string,
  /**
   * Passed only down the address branch. Rust **rejects** an address supplied
   * alongside a named vendor — letting it through would send a keychain key to
   * a host the UI never promised.
   */
  baseUrl?: string,
): Promise<LlmVerifyResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<LlmVerifyResult>('secret_verify', {
    provider,
    vaultPath,
    baseUrl: baseUrl ?? null,
  });
}

/**
 * invoke reject payload → one line for the user.
 *
 * Rust answers with `<code>: <English detail>` (`src-tauri/src/errors.rs`), never a
 * finished sentence, because the locale it would have to pick lives here and not
 * there. Pass the `nativeErrors` lookup and the reader gets their own
 * language; pass nothing and the payload comes back untouched, exactly as this
 * returned before codes existed.
 */
export function secretErrorMessage(err: unknown, lookup?: NativeErrorLookup): string {
  return nativeErrorMessage(err, lookup);
}
