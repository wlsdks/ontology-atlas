'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDataSourceMode, useLocalVault } from '@/entities/vault-session';
import type { VaultDoc } from '@/entities/docs-vault';
import type { KnowledgeGraphNode } from '@/entities/knowledge-graph';
import { buildEvidenceConcepts, resolveEvidenceStates } from '@/shared/lib/git/evidence-states';
import { selectOpenVaultHandle } from '@/shared/lib/vault-folder/select-open-vault-handle';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/tauri-vault-fs';
import { gitPathsLastChange, isGitBridgeAvailable, type GitPathLastChange } from '@/shared/lib/git/tauri-git';

type MapEvidenceState = 'current' | 'stale' | 'unknown';

/** Only `measured` may draw anything but `unknown`; every other value is named in the legend. */
export type MapEvidenceAvailability = 'measured' | 'reading' | 'app-only' | 'unreadable' | 'no-paths';

/** The cited file a stale concept is judged by: gone from the code folder, or changed at `changedAt`. */
export interface StaleEvidencePath {
  path: string;
  gone: boolean;
  changedAt: string | null;
}

export interface MapEvidence {
  availability: MapEvidenceAvailability;
  /** Absent ids are `unknown`. */
  states: ReadonlyMap<string, MapEvidenceState>;
  /** Stale node id to the cited path that moved or is gone. */
  movedPaths: ReadonlyMap<string, string>;
  /** Stale node id to that path's detail; a gone path wins over a moved one. */
  stalePaths: ReadonlyMap<string, StaleEvidencePath>;
}

type WalkChanges = ReadonlyMap<string, GitPathLastChange> | null;

const EMPTY_DOCS: readonly VaultDoc[] = [];
const NO_STATES: ReadonlyMap<string, MapEvidenceState> = new Map();
const NO_PATHS: ReadonlyMap<string, string> = new Map();
const NO_STALE_PATHS: ReadonlyMap<string, StaleEvidencePath> = new Map();

/**
 * One walk per folder load and path set, shared by every screen that reads evidence: the map and
 * the project page ask the same question, so they must not walk Git twice or disagree.
 */
let sharedWalk: { key: string; promise: Promise<WalkChanges>; settled: { changes: WalkChanges } | null } | null = null;

function walkOnce(key: string, rootPath: string, repoPaths: string[], vaultPaths: string[]): Promise<WalkChanges> {
  if (sharedWalk?.key === key) return sharedWalk.promise;
  const entry: NonNullable<typeof sharedWalk> = {
    key,
    settled: null,
    promise: gitPathsLastChange(rootPath, repoPaths, vaultPaths)
      .then((rows) => (rows ? new Map(rows.map((row) => [row.path, row])) : null))
      .catch(() => null),
  };
  void entry.promise.then((changes) => {
    entry.settled = { changes };
  });
  sharedWalk = entry;
  return entry.promise;
}

function settledWalk(key: string): { changes: WalkChanges } | null {
  return sharedWalk?.key === key ? sharedWalk.settled : null;
}

/** Test seam: forget the shared walk between cases. */
export function resetSharedEvidenceWalk(): void {
  sharedWalk = null;
}

/**
 * Same rule and Git walk as the insights brief and MCP (`shared/lib/git/evidence-states.ts` over
 * `shared/lib/git/evidence-verdict.mjs`). `enabled` is a view that draws evidence.
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
  const repoPaths = useMemo(() => [...new Set(concepts.flatMap((concept) => concept.evidencePaths))].sort(), [concepts]);
  const vaultPaths = useMemo(
    () => concepts.map((concept) => concept.docPath).filter((path): path is string => path != null).sort(),
    [concepts],
  );

  const key = nativeRootPath ? [nativeRootPath, vault.lastLoadedAt ?? '', repoPaths.join('\n'), vaultPaths.join('\n')].join('\0') : '';
  const [walk, setWalk] = useState<{ key: string; changes: WalkChanges } | null>(null);
  useEffect(() => {
    if (!enabled || !nativeRootPath || !bridge || noPaths) return;
    let cancelled = false;
    const walkKey = key;
    void walkOnce(walkKey, nativeRootPath, repoPaths, vaultPaths).then((changes) => {
      if (!cancelled) setWalk({ key: walkKey, changes });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, nativeRootPath, bridge, noPaths, key, repoPaths, vaultPaths]);

  // Another screen's finished walk for the same folder load answers at once, with no reading frame.
  const settled = walk?.key === key ? walk : key ? settledWalk(key) : null;
  const reading = settled === null;
  const changes = settled?.changes ?? null;
  return useMemo<MapEvidence>(() => {
    if (!bridge || !nativeRootPath) return unmeasured('app-only');
    if (noPaths) return unmeasured('no-paths');
    if (reading) return unmeasured('reading');
    if (!changes) return unmeasured('unreadable');
    const resolved = resolveEvidenceStates(concepts, changes);
    const states = new Map<string, MapEvidenceState>();
    for (const id of resolved.current) states.set(id, 'current');
    for (const id of resolved.stale) states.set(id, 'stale');
    for (const id of resolved.missing) states.set(id, 'stale');
    const movedPaths = new Map<string, string>();
    const stalePaths = new Map<string, StaleEvidencePath>();
    for (const row of resolved.rows) {
      if (states.get(row.id) !== 'stale') continue;
      const path = row.moved[0]?.path ?? row.gone[0];
      if (path) movedPaths.set(row.id, path);
      const gone = row.gone[0];
      const moved = row.moved[0];
      if (gone) stalePaths.set(row.id, { path: gone, gone: true, changedAt: null });
      else if (moved) stalePaths.set(row.id, { path: moved.path, gone: false, changedAt: moved.changedAt });
    }
    return { availability: 'measured', states, movedPaths, stalePaths };
  }, [bridge, nativeRootPath, noPaths, reading, changes, concepts]);
}

function unmeasured(availability: Exclude<MapEvidenceAvailability, 'measured'>): MapEvidence {
  return { availability, states: NO_STATES, movedPaths: NO_PATHS, stalePaths: NO_STALE_PATHS };
}
