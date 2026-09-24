'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDataSourceMode, useLocalVault } from '@/entities/vault-session';
import type { VaultDoc } from '@/entities/docs-vault';
import type { KnowledgeGraphNode } from '@/entities/knowledge-graph';
import { buildEvidenceConcepts, resolveEvidenceStates } from '@/shared/lib/evidence-states';
import { selectOpenVaultHandle } from '@/shared/lib/select-open-vault-handle';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';
import { gitPathsLastChange, isGitBridgeAvailable, type GitPathLastChange } from '@/shared/lib/tauri-git';

/** One concept's evidence, in the three words the map draws. */
type MapEvidenceState = 'current' | 'stale' | 'unknown';

/**
 * Why the states are what they are. Only `measured` may draw anything but `unknown`; every
 * other value is said out loud in the legend, so an unknown is never mistaken for current.
 */
export type MapEvidenceAvailability = 'measured' | 'reading' | 'app-only' | 'unreadable' | 'no-paths';

export interface MapEvidence {
  availability: MapEvidenceAvailability;
  /** node id → state. Absent ids are `unknown`. */
  states: ReadonlyMap<string, MapEvidenceState>;
  /** Stale node id → the cited path that moved (or is gone), for a view that names it. */
  movedPaths: ReadonlyMap<string, string>;
}

const EMPTY_DOCS: readonly VaultDoc[] = [];
const NO_STATES: ReadonlyMap<string, MapEvidenceState> = new Map();
const NO_PATHS: ReadonlyMap<string, string> = new Map();

/**
 * The map's evidence states, from the same rule and the same Git walk the insights brief uses
 * (`shared/lib/evidence-states.ts` over `shared/lib/evidence-verdict.mjs`, which the MCP server
 * also runs). Nothing here is decided by the map: a concept whose cited code changed after its
 * document is stale, one whose cited path is gone is stale too (the meaning stands on nothing),
 * and anything the walk could not date is unknown.
 *
 * `enabled` is the Territories view being drawn — the walk is one Git call per load, and no
 * other view reads it.
 */
export function useMapEvidenceStates({
  nodes,
  enabled,
}: {
  nodes: readonly KnowledgeGraphNode[] | null | undefined;
  enabled: boolean;
}): MapEvidence {
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  const handle = mode === 'local' ? selectOpenVaultHandle(vault.status, vault.handle) : null;
  const docs = (mode === 'local' ? vault.manifest?.docs : null) ?? EMPTY_DOCS;
  const nativeRootPath = handle ? (getTauriVaultRootPath(handle) ?? null) : null;
  const bridge = isGitBridgeAvailable();

  const concepts = useMemo(
    () =>
      buildEvidenceConcepts(
        docs,
        (nodes ?? []).map((node) => ({
          id: node.id,
          docSlug: node.hasOwnDocument === false ? null : (node.evidenceIds[0] ?? null),
        })),
      ),
    [docs, nodes],
  );
  const noPaths = concepts.every((concept) => concept.evidencePaths.length === 0);

  const [walk, setWalk] = useState<{ key: string; changes: ReadonlyMap<string, GitPathLastChange> | null } | null>(null);
  const key = nativeRootPath ? `${nativeRootPath}\0${vault.lastLoadedAt ?? ''}` : '';
  useEffect(() => {
    if (!enabled || !nativeRootPath || !bridge || noPaths) return;
    const repoPaths = [...new Set(concepts.flatMap((concept) => concept.evidencePaths))];
    const vaultPaths = concepts.map((concept) => concept.docPath).filter((path): path is string => path != null);
    let cancelled = false;
    const walkKey = key;
    void gitPathsLastChange(nativeRootPath, repoPaths, vaultPaths)
      .then((rows) => {
        if (!cancelled) setWalk({ key: walkKey, changes: rows ? new Map(rows.map((row) => [row.path, row])) : null });
      })
      .catch(() => {
        if (!cancelled) setWalk({ key: walkKey, changes: null });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, nativeRootPath, bridge, noPaths, key, concepts]);

  return useMemo<MapEvidence>(() => {
    if (!bridge || !nativeRootPath) return { availability: 'app-only', states: NO_STATES, movedPaths: NO_PATHS };
    if (noPaths) return { availability: 'no-paths', states: NO_STATES, movedPaths: NO_PATHS };
    if (!walk || walk.key !== key) return { availability: 'reading', states: NO_STATES, movedPaths: NO_PATHS };
    if (!walk.changes) return { availability: 'unreadable', states: NO_STATES, movedPaths: NO_PATHS };
    const resolved = resolveEvidenceStates(concepts, walk.changes);
    const states = new Map<string, MapEvidenceState>();
    for (const id of resolved.current) states.set(id, 'current');
    for (const id of resolved.stale) states.set(id, 'stale');
    for (const id of resolved.missing) states.set(id, 'stale');
    const movedPaths = new Map<string, string>();
    for (const row of resolved.rows) {
      const path = row.moved[0]?.path ?? row.gone[0];
      if (path && states.get(row.id) === 'stale') movedPaths.set(row.id, path);
    }
    return { availability: 'measured', states, movedPaths };
  }, [bridge, nativeRootPath, noPaths, walk, key, concepts]);
}
