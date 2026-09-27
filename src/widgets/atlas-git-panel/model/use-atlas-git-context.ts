"use client";

import { useMemo } from "react";

import { useLocalVault } from "@/entities/vault-session";
import { useOntologyInsight } from "@/features/vault-ontology";
import { computeOntologyChangeset, useChangeBaseline } from "@/entities/knowledge-graph";
import { getTauriVaultRootPath } from "@/shared/lib/tauri-vault-fs";

/**
 * Vault path plus session changeset, so the git destination and the rail badge read
 * the same value; it lives in the widget, the lowest layer both can import.
 */
export function useAtlasGitContext() {
  const localVault = useLocalVault();
  const { insight } = useOntologyInsight();
  const changeBaseline = useChangeBaseline();

  const changeset = useMemo(
    () => computeOntologyChangeset(changeBaseline, insight?.nodes ?? [], insight?.edges ?? []),
    [changeBaseline, insight],
  );

  // Null for a web handle; the destination then shows only the session changeset.
  const vaultPath = localVault.handle ? (getTauriVaultRootPath(localVault.handle) ?? null) : null;
  // Passed in rather than read by the widget, which would force tests to supply a provider.
  const graph = useMemo(
    () => (insight ? { nodes: insight.nodes, edges: insight.edges } : null),
    [insight],
  );
  return { vaultPath, changeset, graph };
}
