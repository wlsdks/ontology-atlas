"use client";

import { useMemo } from "react";
import { useLocalVault } from "@/features/docs-vault-local";
import { useDataSourceMode } from "@/features/data-source-mode";
import { useStaticVaultSource } from "@/features/vault-sample-source";
import type { VaultDoc } from "@/entities/docs-vault";

/**
 * Mode-aware vault doc list — the same `local` (the user's disk) vs `static` (the bundled sample vault)
 * source-of-truth precedence as `useOntologyInsight` / `useProjects`, but exposing `VaultDoc[]` directly
 * for callers that need real per-file `updatedAt` / `mtime` (the `/projects` "recent activity" strip —
 * `KnowledgeGraphNode.lastApprovedAt` is a sentinel in vault mode and cannot rank recency, see
 * `recent-activity.ts`).
 *
 * The static manifest must come from `useStaticVaultSource()` — importing the dogfood manifest directly
 * makes the user's "view the example business" choice silently ignored in this list alone.
 */
export function useVaultDocs(): readonly VaultDoc[] {
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  const { manifest: staticManifest } = useStaticVaultSource();

  return useMemo(() => {
    if (mode === "static") return staticManifest.docs;
    return vault.manifest?.docs ?? [];
  }, [mode, staticManifest, vault.manifest]);
}
