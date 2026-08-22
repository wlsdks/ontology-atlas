"use client";

import { useMemo } from "react";

import { useLocalVault } from "@/features/docs-vault-local";
import { useOntologyInsight } from "@/features/vault-ontology";
import { computeOntologyChangeset, useChangeBaseline } from "@/shared/lib/ontology-tree";
import { getTauriVaultRootPath } from "@/shared/lib/tauri-vault-fs";

/**
 * Vault path plus session changeset — the trail destination and the rail badge
 * read the **same value**.
 *
 * It lived inside `src/app/providers/NavRailGitTile.tsx` until 2026-07-25, when
 * the destination (`src/views/git/`) started needing it and that became a
 * reverse `views → app` import (an FSD violation ESLint blocks). With two
 * consumers it drops to the lowest layer both can reach: the widget.
 */
export function useAtlasGitContext() {
  const localVault = useLocalVault();
  const { insight } = useOntologyInsight();
  const changeBaseline = useChangeBaseline();

  const changeset = useMemo(
    () => computeOntologyChangeset(changeBaseline, insight?.nodes ?? [], insight?.edges ?? []),
    [changeBaseline, insight],
  );

  // On the Tauri desktop this is the vault's absolute path (bridge active); with
  // a web FSA handle it is null, and the destination degrades honestly to the
  // session changeset.
  const vaultPath = localVault.handle ? (getTauriVaultRootPath(localVault.handle) ?? null) : null;
  /*
   * The vault graph rides along — the history screen uses it to move a step's
   * files onto **concepts**. Why the widget does not call the hook itself is in
   * the `AtlasGitPanelProps.graph` comment: it would force tests to supply a
   * provider.
   */
  const graph = useMemo(
    () => (insight ? { nodes: insight.nodes, edges: insight.edges } : null),
    [insight],
  );
  return { vaultPath, changeset, graph };
}
