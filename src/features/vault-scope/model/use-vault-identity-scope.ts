'use client';

import { vaultIdentityScope, type VaultIdentityScope } from '@/entities/docs-vault';
import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';
import { useSampleSource } from '@/features/vault-sample-source';

/**
 * **Which vault the screen is currently looking at**, as one string.
 *
 * When this value changes, state that only meant something *inside that vault* (the node
 * slug in the address, per-vault stored state) loses its meaning. Every defect of the
 * "state that outlived its scope" family comes from that moment passing with nobody
 * clearing it — a stale value survives and becomes **the input to a false verdict**.
 *
 * The single source for the derivation is `vaultIdentityScope` (entities). This hook only
 * gathers the app's three signals into that function:
 *
 * - `useDataSourceMode()` — is this the user's vault or a bundled sample?
 * - `useLocalVault().handle?.name` — if local, which folder?
 * - `useSampleSource()` — if a sample, which one? (**without this axis a sample↔sample
 *   switch is not seen as a change**)
 *
 * ⚠️ This is a **different value** from the `vaultScopeKey` used by pins, recents, and open
 * tabs. That one names already-shipped storage locations and treats both samples as one —
 * the reasoning is in the table in `entities/docs-vault/lib/vault-scope-key.ts`.
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
