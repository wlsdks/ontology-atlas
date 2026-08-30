"use client";

import { useEffect, useRef } from "react";
import { useDataSourceMode } from "@/features/data-source-mode";
import {
  getChangeBaseline,
  markChangeBaseline,
  restorePersistedBaseline,
  setChangeBaselineScope,
  shouldAutoMarkBaseline,
} from "@/entities/knowledge-graph/lib/ontology-tree";
import { useVaultIdentityScope } from "@/features/vault-scope";
import { useOntologyInsight } from "../model/use-ontology-insight";

/**
 * Once a local vault loads, handles the change baseline (once per vault):
 *
 * 1. **Restore first** — if a baseline persisted before the reload overlaps the current
 *    graph enough, restore it (`restorePersistedBaseline`). Then "what changed while I
 *    was away" (persisted baseline vs the current disk state) survives a refresh, and
 *    "reviewed" approvals are preserved.
 * 2. **Otherwise auto-mark** — with nothing to restore, a baseline is captured once.
 *
 * That way later vault edits by an agent (MCP) or a person appear without a click, as
 * the same changeset, in the topology's fresh channel, INDEX, the review link, the git
 * workbench, and the activity count.
 *
 * Handled **once per vault** (`handledScopeRef`), so an explicit Clear is not
 * immediately undone (respecting manual intent). Static/dogfood mode never changes, so
 * there is no auto-mark. Headless (renders nothing) — mounted inside the layout's vault provider.
 *
 * ## Why "per vault" rather than "per mount" (fix, 2026-08-01)
 *
 * `handledRef` used to be a boolean, so **a folder switch mid-session went unseen**. The
 * restore guard (`snapshotMatchesGraph`) runs only inside this effect and the effect did
 * not re-run, so vault A's baseline left in memory was compared against vault B's graph
 * and "N changed while you were away" reported **all of B**. A scope change re-runs the
 * handling — and the store discards the previous vault's baseline the moment it receives
 * `setChangeBaselineScope`.
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
    // 0) Tell the store which vault is active — a scope change discards the previous
    //    vault's baseline here, and the save/restore key switches to this vault's.
    setChangeBaselineScope(vaultScope);
    // 1) Try restoring a persisted baseline (overlap-guarded); on success, skip auto-mark.
    const restored = restorePersistedBaseline(insight.nodes);
    // 2) With nothing restored and the auto-mark condition met, capture a new baseline.
    //    `getChangeBaseline()` is read directly — the scope switch just above may have
    //    discarded the baseline, while the value carried in this render is still the previous vault's.
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
