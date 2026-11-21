import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

import { type NativeErrorLookup, nativeErrorMessage } from '../desktop-shell/native-error';

/**
 * Typed wrappers over `src-tauri/src/secrets.rs` and `llm.rs`. No command returns the full key (a
 * source-reflection test in `secrets.rs` enforces it), so no type here holds one; the key passes
 * through `secretSet` once. Without Tauri every wrapper returns `null`.
 */

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  if (!isTauri()) return null;
  return (command, args) => tauriInvoke(command, args);
}

/**
 * Same order as the Rust `PROVIDERS` allow-list. Named vendors are frozen at three (see
 * `secrets.rs`); every other vendor takes the typed-address branch.
 */
export const SECRET_PROVIDERS = ['anthropic', 'openai', 'gemini'] as const;
export type SecretProvider = (typeof SECRET_PROVIDERS)[number];

/**
 * Where each key travels, shown before it is pasted. Must match `src-tauri/src/llm/verify.rs`;
 * both test suites read `tests/fixtures/llm-provider-hosts.json`.
 */
export const SECRET_PROVIDER_HOSTS: Record<SecretProvider, string> = {
  anthropic: 'api.anthropic.com',
  openai: 'api.openai.com',
  gemini: 'generativelanguage.googleapis.com',
};

/**
 * A local runner whose address the user types. It has no key, so it stays out of
 * `SECRET_PROVIDERS`; its address and model live in `local-endpoint.ts`.
 */
export const LOCAL_PROVIDER = 'local';

/** Ollama's default port. Same value as the Rust `LOCAL_DEFAULT_BASE_URL`. */
export const LOCAL_DEFAULT_BASE_URL = 'http://localhost:11434';

export type ConnectionProvider = SecretProvider | typeof LOCAL_PROVIDER;


/** Rust `SecretStatus` (serde camelCase). */
export interface SecretStatus {
  provider: string;
  stored: boolean;
  /** Last 4 characters, only when present. The full key never arrives by any path. */
  last4: string | null;
}

/** Rust `LlmVerifyResult`. */
export interface LlmVerifyResult {
  provider: string;
  ok: boolean;
  /** Never re-derive from the status code: vendors differ (Gemini answers 400). Rust decides once. */
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

export function isSecretBridgeAvailable(): boolean {
  return getInvoke() !== null;
}

/**
 * A key saved on one surface is used on another, so a save or delete announces once and listeners
 * re-query the keychain, which stays the source of truth.
 */
const SECRET_CHANGE_EVENT = 'ontology-atlas:secret-change';

function notifySecretChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SECRET_CHANGE_EVENT));
}

export function subscribeSecretChange(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(SECRET_CHANGE_EVENT, handler);
  return () => window.removeEventListener(SECRET_CHANGE_EVENT, handler);
}

const pendingStatuses = new Map<SecretProvider, Promise<SecretStatus>>();

/** Store — **only when the user pastes and presses save**. The caller discards the input on success. */
export async function secretSet(
  provider: SecretProvider,
  secret: string,
): Promise<SecretStatus | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  pendingStatuses.delete(provider);
  let status: SecretStatus;
  try { status = await invoke<SecretStatus>('secret_set', { provider, secret }); }
  finally { pendingStatuses.delete(provider); }
  notifySecretChange();
  return status;
}

export async function secretStatus(
  provider: SecretProvider,
): Promise<SecretStatus | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  if (!SECRET_PROVIDERS.includes(provider)) return invoke<SecretStatus>('secret_status', { provider });
  const existing = pendingStatuses.get(provider);
  if (existing) {
    const status = await existing;
    return status ? { ...status } : status;
  }
  const pending = invoke<SecretStatus>('secret_status', { provider }).finally(() => {
    if (pendingStatuses.get(provider) === pending) pendingStatuses.delete(provider);
  });
  pendingStatuses.set(provider, pending);
  const status = await pending;
  return status ? { ...status } : status;
}

/**
 * Absent counts as success (idempotent), but a failed delete throws so the caller surfaces it via
 * `secretErrorMessage`: a locked keychain must not report "deleted" while the key is still there.
 */
export async function secretClear(
  provider: SecretProvider,
): Promise<SecretStatus | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  pendingStatuses.delete(provider);
  let status: SecretStatus;
  try { status = await invoke<SecretStatus>('secret_clear', { provider }); }
  finally { pendingStatuses.delete(provider); }
  notifySecretChange();
  return status;
}

/**
 * Verifies auth only, sending no vault data, and records the call in
 * `.ontology-atlas/llm-audit.jsonl`: without a vault path Rust does not send (log-before-send).
 */
export async function secretVerify(
  provider: ConnectionProvider,
  vaultPath: string,
  /** Address branch only: Rust rejects it beside a named vendor, whose key must not reach another host. */
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
 * Rust answers `<code>: <English detail>` (`src-tauri/src/coded_error.rs`); the locale lives here. Pass
 * the `nativeErrors` lookup for the reader's language, or nothing for the payload untouched.
 */
export function secretErrorMessage(err: unknown, lookup?: NativeErrorLookup): string {
  return nativeErrorMessage(err, lookup);
}

export async function sourceModelVerify(baseUrl: string): Promise<LlmVerifyResult | null> {
  const invoke = getInvoke();
  return invoke ? invoke<LlmVerifyResult>('source_model_verify', { baseUrl }) : null;
}
