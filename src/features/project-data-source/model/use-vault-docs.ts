"use client";

import type { VaultDoc } from "@/entities/docs-vault";

import { useVaultManifest } from "./use-vault-manifest";

/** Stable identity so a caller may hold this in a dependency list while no folder is open. */
const NO_DOCS: readonly VaultDoc[] = [];

/**
 * Mode-aware vault doc list, taken from the same manifest every other figure on a page reads, so
 * that a page cannot count one folder's documents beside another folder's sources.
 *
 * It exposes `VaultDoc[]` directly for callers that need real per-file `updatedAt` / `mtime` (the
 * `/projects` "recent activity" strip — `KnowledgeGraphNode.lastApprovedAt` is a sentinel in vault
 * mode and cannot rank recency, see `recent-activity.ts`).
 */
export function useVaultDocs(): readonly VaultDoc[] {
  return useVaultManifest()?.docs ?? NO_DOCS;
}
