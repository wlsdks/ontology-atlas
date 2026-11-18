import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';
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

export type VaultIndexState = 'off' | 'absent' | 'building' | 'ready' | 'paused' | 'unavailable';

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

/** Deletes every folder's index; each stays deleted until its folder is opened again. */
export async function clearVaultIndex(rootPath: string | null): Promise<VaultIndexStatus | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke('vault_index_clear', { rootPath, enabled: enabled() });
}
