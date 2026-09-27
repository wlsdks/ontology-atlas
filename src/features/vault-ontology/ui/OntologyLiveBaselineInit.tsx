"use client";

import { useEffect, useRef } from "react";
import { useDataSourceMode, useVaultIdentityScope } from "@/entities/vault-session";
import {
  getChangeBaseline,
  markChangeBaseline,
  restorePersistedBaseline,
  setChangeBaselineScope,
  shouldAutoMarkBaseline,
} from "@/entities/knowledge-graph";
import { useOntologyInsight } from "../model/use-ontology-insight";

/**
 * Once per vault scope: restore a persisted baseline if it matches the graph, otherwise capture
 * one, so later edits appear as one changeset. Per scope, not per mount, or a folder switch
 * compares one vault's baseline against another's graph.
 */
export function OntologyLiveBaselineInit() {
  const mode = useDataSourceMode();
  const { insight } = useOntologyInsight();
  const vaultScope = useVaultIdentityScope();
  const handledScopeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!insight) return;
    if (handledScopeRef.current === vaultScope) return;
    handledScopeRef.current = vaultScope;
    // A scope change discards the previous vault's baseline and switches the save key.
    setChangeBaselineScope(vaultScope);
    // 1) Try restoring a persisted baseline (overlap-guarded); on success, skip auto-mark.
    const restored = restorePersistedBaseline(insight.nodes);
    // Read `getChangeBaseline()` directly: the scope switch above may just have discarded it.
    if (
      !restored &&
      shouldAutoMarkBaseline({
        mode,
        hasBaseline: getChangeBaseline() !== null,
        nodeCount: insight.nodes.length,
      })
    ) {
      markChangeBaseline(insight.nodes, insight.edges, Date.now());
    }
  }, [mode, insight, vaultScope]);

  return null;
}
