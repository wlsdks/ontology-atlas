"use client";

import { useMemo } from "react";
import { useLocalVault } from "@/features/docs-vault-local";
import { useDataSourceMode } from "@/features/data-source-mode";
import { vaultManifest as staticVaultManifestRaw, type VaultDoc, type VaultManifest } from "@/entities/docs-vault";

const staticVaultManifest = staticVaultManifestRaw as VaultManifest;

/**
 * Mode-aware vault doc list — the same `local` (user's disk) vs `static`
 * (build-time dogfood manifest) truth-source priority as `useOntologyInsight`
 * / `useProjects`, but exposing `VaultDoc[]` directly for callers that need
 * real per-file `updatedAt`/`mtime` (the /projects "recent activity" strip —
 * `KnowledgeGraphNode.lastApprovedAt` is a sentinel in vault mode and can't
 * rank recency, see `recent-activity.ts`).
 */
export function useVaultDocs(): readonly VaultDoc[] {
  const mode = useDataSourceMode();
  const vault = useLocalVault();

  return useMemo(() => {
    if (mode === "static") return staticVaultManifest.docs;
    return vault.manifest?.docs ?? [];
  }, [mode, vault.manifest]);
}
