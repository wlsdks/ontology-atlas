'use client';

import { vaultIdentityScope, type VaultIdentityScope } from '@/entities/docs-vault';
import { useDataSourceMode } from './use-data-source-mode';
import { useLocalVault } from '../vault-provider/LocalVaultProvider';
import { useSampleSource } from './use-sample-source';

const localHandleIdentity = new WeakMap<FileSystemDirectoryHandle, string>();
let nextLocalHandleIdentity = 1;

function localHandleIdentityName(handle: FileSystemDirectoryHandle): string {
  const existing = localHandleIdentity.get(handle);
  if (existing) return existing;
  const created = `${handle.name}#${nextLocalHandleIdentity}`;
  nextLocalHandleIdentity += 1;
  localHandleIdentity.set(handle, created);
  return created;
}

/**
 * Which vault the screen is looking at, as one string; vault-scoped state must reset when it changes.
 * Derived by `vaultIdentityScope`. Differs from `vaultScopeKey` (pins, recents, tabs):
 * see `entities/docs-vault/lib/vault-scope-key.ts`.
 */
export function useVaultIdentityScope(): VaultIdentityScope {
  const mode = useDataSourceMode();
  const localVault = useLocalVault();
  const [sampleSource] = useSampleSource();

  return vaultIdentityScope({
    isLocalLoaded: mode === 'local' && localVault.status === 'loaded',
    handleName: localVault.handle?.name ?? null,
    sampleSource,
  });
}

/** Session-only identity for transient state (route cleanup, camera, an open editor baseline). A folder name is display text, not identity (two parents can both hold `ontology/`), so each directory handle gets an in-memory token; never a persisted storage key. */
export function useVaultSessionIdentityScope(): VaultIdentityScope {
  const mode = useDataSourceMode();
  const localVault = useLocalVault();
  const [sampleSource] = useSampleSource();

  return vaultIdentityScope({
    // A file watcher rescan keeps the open handle. It is not a switch to sample
    // data, and must not erase the transient observations that caused the rescan.
    isLocalLoaded: mode === 'local' && Boolean(localVault.handle)
      && (localVault.status === 'loaded' || localVault.status === 'loading'),
    handleName: localVault.handle ? localHandleIdentityName(localVault.handle) : null,
    sampleSource,
  });
}

export function useArrivingVaultIdentityScope(): VaultIdentityScope | null {
  const localVault = useLocalVault();
  const [sampleSource] = useSampleSource();
  if (!localVault.partialTotal || !localVault.handle) return null;
  return vaultIdentityScope({
    isLocalLoaded: true,
    handleName: localHandleIdentityName(localVault.handle),
    sampleSource,
  });
}
