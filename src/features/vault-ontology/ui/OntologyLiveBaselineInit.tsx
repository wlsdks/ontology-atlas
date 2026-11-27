"use client";

import { useEffect, useRef } from "react";
import { useDataSourceMode, useVaultIdentityScope } from "@/entities/vault-session";
import {
  getChangeBaseline,
  markChangeBaseline,
  prepareGraphSignatures,
  restorePersistedBaseline,
  setChangeBaselineScope,
  shouldAutoMarkBaseline,
} from "@/entities/knowledge-graph";
import { useOntologyInsight } from "../model/use-ontology-insight";

/** Per scope, not per mount, or a folder switch compares one vault's baseline against another's graph. Once, so an explicit Clear is not re-marked. */
export function OntologyLiveBaselineInit() {
  const mode = useDataSourceMode();
  const { insight } = useOntologyInsight();
  const vaultScope = useVaultIdentityScope();
  const handledScopeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!insight) return;
    if (handledScopeRef.current === vaultScope) return;
    setChangeBaselineScope(vaultScope);
    handledScopeRef.current = null;
    const preparing = new AbortController();
    prepareGraphSignatures(insight.nodes, insight.edges, { signal: preparing.signal }).then(() => {
      // A pass can finish after its abort; its graph is no longer the one on screen.
      if (preparing.signal.aborted) return;
      handledScopeRef.current = vaultScope;
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
    }, () => undefined);
    return () => preparing.abort();
  }, [mode, insight, vaultScope]);

  return null;
}
