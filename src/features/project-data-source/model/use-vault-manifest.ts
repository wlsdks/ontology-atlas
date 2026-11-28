import { useLocalVault } from "@/entities/vault-session";
import type { VaultManifest } from "@/entities/docs-vault";

/** The open folder's manifest, or null while none is open. */
export function useVaultManifest(): VaultManifest | null {
  return useLocalVault().manifest ?? null;
}
