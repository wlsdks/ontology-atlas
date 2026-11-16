'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
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
  /** Stale node id to that path's detail; a moved path is named before a gone one, as in `movedPaths`. */
  stalePaths: ReadonlyMap<string, StaleEvidencePath>;
}

type WalkChanges = ReadonlyMap<string, GitPathLastChange>;

const EMPTY_DOCS: readonly VaultDoc[] = [];
const NO_STATES: ReadonlyMap<string, MapEvidenceState> = new Map();
const NO_PATHS: ReadonlyMap<string, string> = new Map();
const NO_STALE_PATHS: ReadonlyMap<string, StaleEvidencePath> = new Map();
const NO_CONCEPTS: ReturnType<typeof buildEvidenceConcepts> = [];

/**
 * Stale-while-revalidate, shared by every screen that reads evidence: a screen that mounts reads the
 * folder's last answer at once and walks Git again in the background, joining a walk already in
 * flight for the same paths. Only a successful walk replaces the answer; a failed one is retried by
 * the next mount.
 */
const answers = new Map<string, { key: string; changes: WalkChanges }>();
const inFlight = new Map<string, Promise<WalkChanges | null>>();
const answerListeners = new Set<() => void>();

function subscribeToAnswers(listener: () => void): () => void {
  answerListeners.add(listener);
  return () => answerListeners.delete(listener);
}

/** The native walk answers this many paths per call and drops the rest (MAX_EVIDENCE_PATHS: src-tauri/src/git/evidence.rs). */
const GIT_WALK_PATH_LIMIT = 512;

/** Every path in calls of at most `GIT_WALK_PATH_LIMIT`, so a large folder is compared in full. */
async function walkInBatches(rootPath: string, repoPaths: readonly string[], vaultPaths: readonly string[]) {
  const calls: Promise<GitPathLastChange[] | null>[] = [];
  let vaultFrom = 0;
  let repoFrom = 0;
  while (vaultFrom < vaultPaths.length || repoFrom < repoPaths.length) {
    const vault = vaultPaths.slice(vaultFrom, vaultFrom + GIT_WALK_PATH_LIMIT);
    const repo = repoPaths.slice(repoFrom, repoFrom + GIT_WALK_PATH_LIMIT - vault.length);
    vaultFrom += vault.length;
    repoFrom += repo.length;
    calls.push(gitPathsLastChange(rootPath, repo, vault));
  }
  const batches = await Promise.all(calls);
  return batches.some((rows) => rows === null) ? null : batches.flatMap((rows) => rows ?? []);
}

function revalidate(key: string, rootPath: string, repoPaths: string[], vaultPaths: string[]): Promise<WalkChanges | null> {
  const running = inFlight.get(key);
  if (running) return running;
  const walk = walkInBatches(rootPath, repoPaths, vaultPaths)
    .then((rows): WalkChanges | null => {
      if (!rows) return null;
      const changes: WalkChanges = new Map(rows.map((row) => [row.path, row]));
      answers.set(rootPath, { key, changes });
      for (const listener of answerListeners) listener();
      return changes;
    })
    .catch(() => null)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, walk);
  return walk;
}

/** Test seam: forget every answer and walk between cases. */
export function resetSharedEvidenceWalk(): void {
  answers.clear();
  inFlight.clear();
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

  // Nothing is built on the web or for a view that draws no evidence.
  const measurable = enabled && bridge && nativeRootPath !== null;
  const concepts = useMemo(
    () =>
      measurable
        ? buildEvidenceConcepts(
            docs,
            (nodes ?? []).map((node) => ({
              id: node.id,
              docSlug: node.hasOwnDocument === false ? null : (node.evidenceIds[0] ?? null),
            })),
          )
        : NO_CONCEPTS,
    [measurable, docs, nodes],
  );
  const noPaths = useMemo(() => concepts.every((concept) => concept.evidencePaths.length === 0), [concepts]);
  const repoPaths = useMemo(() => [...new Set(concepts.flatMap((concept) => concept.evidencePaths))].sort(), [concepts]);
  const vaultPaths = useMemo(
    () => concepts.map((concept) => concept.docPath).filter((path): path is string => path != null).sort(),
    [concepts],
  );

  const key = useMemo(
    () => (nativeRootPath ? [nativeRootPath, repoPaths.join('\n'), vaultPaths.join('\n')].join('\0') : ''),
    [nativeRootPath, repoPaths, vaultPaths],
  );
  // While a walk runs, the last answer stands; with none yet, the screen reads.
  const changes = useSyncExternalStore(
    subscribeToAnswers,
    () => {
      const answer = nativeRootPath ? answers.get(nativeRootPath) : undefined;
      return answer?.key === key ? answer.changes : null;
    },
    () => null,
  );
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const loadedAt = vault.lastLoadedAt;
  useEffect(() => {
    if (!enabled || !nativeRootPath || !bridge || noPaths) return;
    let cancelled = false;
    void revalidate(key, nativeRootPath, repoPaths, vaultPaths).then((changes) => {
      if (!cancelled) setFailedKey(changes ? null : key);
    });
    return () => {
      cancelled = true;
    };
    // A new read of the folder walks again: a document or a commit may have changed the answer.
  }, [enabled, nativeRootPath, bridge, noPaths, key, repoPaths, vaultPaths, loadedAt]);

  const reading = changes === null && failedKey !== key;
  return useMemo<MapEvidence>(() => {
    if (!bridge || !nativeRootPath) return unmeasured('app-only');
    if (!enabled) return unmeasured('reading');
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
      if (moved) stalePaths.set(row.id, { path: moved.path, gone: false, changedAt: moved.changedAt });
      else if (gone) stalePaths.set(row.id, { path: gone, gone: true, changedAt: null });
    }
    return { availability: 'measured', states, movedPaths, stalePaths };
  }, [bridge, nativeRootPath, enabled, noPaths, reading, changes, concepts]);
}

function unmeasured(availability: Exclude<MapEvidenceAvailability, 'measured'>): MapEvidence {
  return { availability, states: NO_STATES, movedPaths: NO_PATHS, stalePaths: NO_STALE_PATHS };
}
