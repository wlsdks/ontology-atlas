"use client";

import type { VaultDoc } from "@/entities/docs-vault";

import { useVaultManifest } from "./use-vault-manifest";

/** Stable identity so a caller may hold this in a dependency list while no folder is open. */
const NO_DOCS: readonly VaultDoc[] = [];

/** Mode-aware docs from the shared manifest, for callers needing per-file `mtime`. */
export function useVaultDocs(): readonly VaultDoc[] {
  return useVaultManifest()?.docs ?? NO_DOCS;
}
