/**
 * A connector's tokens in the OS keychain — the Tauri IPC bridge over
 * `src-tauri/src/connector_secrets.rs`.
 *
 * ## The value goes down, and never comes back
 *
 * `connectorSecretSet` is the only direction a token travels through this file: the person types
 * it, it goes to Rust once, and the caller drops it from its own state. There is **no wrapper that
 * returns a stored value**, because there is no such command — a source-reflection test in the Rust
 * module pins that.
 *
 * The token still has to reach the agent, inside `session/new`'s `mcpServers`. That line is
 * composed here, so it is composed with a **reference**:
 *
 * ```json
 * { "name": "NOTION_TOKEN", "__atlasSecretRef": "connector:c1:NOTION_TOKEN" }
 * ```
 *
 * and Rust swaps it for the real value in `acp_send`, one line before it leaves the process. So the
 * WebView holds the shape of the token — its name and last four characters — and never the token.
 *
 * ## Web degradation contract
 *
 * A browser has no keychain. `isConnectorSecretBridgeAvailable()` is false there and every wrapper
 * returns `null` without invoking, so the screen renders no field to type a token into and says
 * why (`.claude/rules/surfaces.md`).
 */
import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

import { type NativeErrorLookup, nativeErrorMessage } from './native-error';

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  if (!isTauri()) return null;
  return (command, args) => tauriInvoke(command, args);
}

/**
 * The marker key that stands in for a value in an outgoing ACP line.
 *
 * The same literal exists in `src-tauri/src/connector_secrets.rs` as `SECRET_REF_KEY`, and
 * `tests/contract/connector-secret-ref-parity.contract.test.ts` compares the two. If they drifted,
 * the marker would travel to the agent verbatim — a connector configured with the string
 * `connector:c1:NOTION_TOKEN` as its token, failing on every call for a reason nothing states.
 */
export const ACP_SECRET_REF_KEY = '__atlasSecretRef';

/** Rust `ConnectorSecretStatus` (serde camelCase). */
export interface ConnectorSecretStatus {
  secretRef: string;
  stored: boolean;
  /** Last four characters, only when present. The whole value arrives by no path. */
  last4: string | null;
}

/** Whether this machine has a keychain to reach — false in a browser. */
export function isConnectorSecretBridgeAvailable(): boolean {
  return getInvoke() !== null;
}

/**
 * The keychain account for one connector variable.
 *
 * Built from the record's **id**, not its name, so renaming a connector on screen does not orphan
 * the token behind it. Rust validates the same shape before it becomes an account name.
 */
export function connectorSecretRef(connectorId: string, variableName: string): string {
  return `connector:${connectorId}:${variableName}`;
}

/** Store one value — only on an explicit save, and the caller clears its own field afterwards. */
export async function connectorSecretSet(
  secretRef: string,
  secret: string,
): Promise<ConnectorSecretStatus | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  const status = await invoke<ConnectorSecretStatus>('connector_secret_set', {
    secretRef,
    secret,
  });
  notifyConnectorSecretChange();
  return status;
}

/**
 * Present or not, plus the last four characters.
 *
 * Read **before** a connector is switched on. A reference with nothing behind it would otherwise
 * surface as a session that refuses to open, at the moment somebody was trying to ask a question.
 */
export async function connectorSecretStatus(
  secretRef: string,
): Promise<ConnectorSecretStatus | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<ConnectorSecretStatus>('connector_secret_status', { secretRef });
}

/** Delete one. Absence counts as success; a delete that failed throws, and must be shown. */
export async function connectorSecretDelete(
  secretRef: string,
): Promise<ConnectorSecretStatus | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  const status = await invoke<ConnectorSecretStatus>('connector_secret_delete', { secretRef });
  notifyConnectorSecretChange();
  return status;
}

/**
 * Announce that a token's presence changed, so a panel mounted elsewhere re-asks rather than
 * showing a stale "not stored" until the next reload. The keychain stays the source of truth; only
 * the moment to re-read is shared. Same pattern and same reason as `tauri-secrets.ts`.
 */
const CONNECTOR_SECRET_CHANGE_EVENT = 'ontology-atlas:connector-secret-change';

function notifyConnectorSecretChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CONNECTOR_SECRET_CHANGE_EVENT));
}

export function subscribeConnectorSecretChange(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CONNECTOR_SECRET_CHANGE_EVENT, handler);
  return () => window.removeEventListener(CONNECTOR_SECRET_CHANGE_EVENT, handler);
}

/** An invoke rejection turned into one sentence in the reader's language. */
export function connectorSecretErrorMessage(
  err: unknown,
  lookup?: NativeErrorLookup,
): string {
  return nativeErrorMessage(err, lookup);
}
