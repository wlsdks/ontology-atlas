/**
 * Bridge over `src-tauri/src/connectors/secrets.rs`. A token only travels down: no command returns a
 * stored value (a Rust source test pins it). The `session/new` line carries a reference that Rust
 * swaps for the value in `acp_send`, so the WebView never holds the token. Without Tauri every
 * wrapper returns `null`.
 */
import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

import { type NativeErrorLookup, nativeErrorMessage } from '../desktop-shell/native-error';

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  if (!isTauri()) return null;
  return (command, args) => tauriInvoke(command, args);
}

/**
 * Must equal `SECRET_REF_KEY` in `src-tauri/src/connectors/secrets.rs` (a parity contract checks);
 * a drift would send the reference itself to the agent as the token.
 */
export const ACP_SECRET_REF_KEY = '__atlasSecretRef';

/** Rust `ConnectorSecretStatus` (serde camelCase). */
export interface ConnectorSecretStatus {
  secretRef: string;
  stored: boolean;
  /** Last four characters, only when present. The whole value arrives by no path. */
  last4: string | null;
}

export function isConnectorSecretBridgeAvailable(): boolean {
  return getInvoke() !== null;
}

export { connectorSecretRef } from './connector-record';

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

/** Read before a connector is switched on, or an empty reference surfaces as a session that will not open. */
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

/** Same pattern as `tauri-secrets.ts`: only the moment to re-read the keychain is shared. */
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

export function connectorSecretErrorMessage(
  err: unknown,
  lookup?: NativeErrorLookup,
): string {
  return nativeErrorMessage(err, lookup);
}
