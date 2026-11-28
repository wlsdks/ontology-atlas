import { useMemo } from 'react';
import { useLocalVault } from '@/entities/vault-session';
import type { VaultManifest } from '@/entities/docs-vault';
import { computeVaultHealth, type VaultHealthResult } from '@/entities/knowledge-graph';

/** Twin of MCP `query_ontology` health, computed from the open folder's manifest. */
const manifestHealthCache = new WeakMap<VaultManifest, VaultHealthResult>();
function manifestHealth(manifest: VaultManifest): VaultHealthResult {
  const cached = manifestHealthCache.get(manifest);
  if (cached) return cached;
  const result = computeVaultHealth(manifest.docs);
  manifestHealthCache.set(manifest, result);
  return result;
}

function useHealthManifest(): VaultManifest | null {
  const vault = useLocalVault();
  // A same-folder refresh keeps its manifest, or ACP would recommend bootstrap after a write;
  // the flag is false while switching folders, so another vault's health never leaks.
  const localManifestUsable = vault.status === 'loaded' || vault.isReloadingSameVault;

  return useMemo(
    () => (localManifestUsable && vault.manifest ? vault.manifest : null),
    [localManifestUsable, vault.manifest],
  );
}

export function useVaultHealth(): VaultHealthResult {
  const manifest = useHealthManifest();
  return useMemo(
    () => (manifest ? manifestHealth(manifest) : computeVaultHealth([])),
    [manifest],
  );
}
