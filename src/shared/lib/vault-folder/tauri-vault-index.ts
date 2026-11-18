import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { definePreference } from '@/shared/lib/preferences/define-preference';

/**
 * The installed app's search index of every Markdown file (`src-tauri/crates/vault-index`). It
 * lives in the OS cache folder, holds only what can be rebuilt from the files, and never leaves
 * the computer. The web has none and every call here answers `null`, so search covers titles.
 */

/** Held in localStorage and sent with every command; off means no index files exist. */
export const vaultIndexPreference = definePreference({
  key: 'ontology-atlas:vault-index:v1',
  values: ['on', 'off'] as const,
  fallback: 'on',
});

/**
 * `partial`: ready over the part of the folder the walk reached before its limit. `unavailable`: the
 * index could not be opened or written. `unreadable`: the folder could not be listed.
 */
export type VaultIndexState =
  | 'off'
  | 'absent'
  | 'building'
  | 'ready'
  | 'partial'
  | 'paused'
  | 'unavailable'
  | 'unreadable';

export interface VaultIndexStatus {
  state: VaultIndexState;
  /** Files whose search data matches the disk so far. */
  indexed: number;
  total: number;
  /** This folder's index, WAL files included. */
  sizeBytes: number;
  /** Every folder's index on this computer. */
  allBytes: number;
  vaults: number;
}

export interface VaultIndexHit {
  /** Relative to the vault root, `/`-separated. */
  path: string;
  /** Lower is better. */
  rank: number;
}

export interface VaultIndexAnswer {
  hits: VaultIndexHit[];
  status: VaultIndexStatus;
}

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): Invoke | null {
  if (typeof window === 'undefined' || !isTauri()) return null;
  return (command, args) => tauriInvoke(command, args);
}

const enabled = () => vaultIndexPreference.read() === 'on';

export function isVaultIndexAvailable(): boolean {
  return getInvoke() !== null;
}

export async function vaultIndexStatus(rootPath: string | null): Promise<VaultIndexStatus | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke('vault_index_status', { rootPath, enabled: enabled() });
}

/** A stamp pass in the background; `opened` marks a fresh open of the folder. */
export async function syncVaultIndex(rootPath: string, opened: boolean): Promise<VaultIndexStatus | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke('vault_index_sync', { rootPath, enabled: enabled(), opened });
}

export async function searchVaultIndex(
  rootPath: string,
  query: string,
  limit: number,
): Promise<VaultIndexAnswer | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke('vault_index_search', { rootPath, query, limit, enabled: enabled() });
}

/** Deletes the open folder's index, or every folder's with `null`; it stays deleted until reopened. */
export async function clearVaultIndex(rootPath: string | null): Promise<VaultIndexStatus | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke('vault_index_clear', { rootPath, enabled: enabled() });
}

/** Deletes the index of a folder taken off the folder list; the folder itself is never touched. */
export async function forgetVaultIndex(rootPath: string): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke('vault_index_forget', { rootPath });
}

/**
 * Calls `onUpdate` after each pass that changed what a search can find, so an open query asks
 * again as soon as an edit is indexed. Resolves to the unsubscribe; on the web nothing fires.
 */
export async function onVaultIndexUpdated(onUpdate: () => void): Promise<() => void> {
  if (!getInvoke()) return () => undefined;
  return listen('vault-index-updated', () => onUpdate());
}
