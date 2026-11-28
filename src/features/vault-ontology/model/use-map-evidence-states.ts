import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useDataSourceMode, useLocalVault } from '@/entities/vault-session';
import type { VaultDoc } from '@/entities/docs-vault';
import type { KnowledgeGraphNode } from '@/entities/knowledge-graph';
import { buildEvidenceConcepts, resolveEvidenceStates, type EvidenceConceptInput } from '@/shared/lib/git/evidence-states';
import { EVIDENCE_TEXT_CHUNK, movedEvidencePairs, unchangedEvidencePairs } from '@/shared/lib/git/evidence-verdict.mjs';
import { selectOpenVaultHandle } from '@/shared/lib/vault-folder/select-open-vault-handle';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import {
  gitEvidenceTextPairs,
  gitPathsLastChange,
  type GitPathLastChange,
} from '@/shared/lib/git/tauri-git';

type MapEvidenceState = 'current' | 'stale' | 'unknown';

/** Only `measured` may draw anything but `unknown`; every other value is named in the legend. */
export type MapEvidenceAvailability = 'measured' | 'reading' | 'app-only' | 'unreadable' | 'no-paths';

export interface StaleEvidencePath {
  path: string;
  gone: boolean;
  changedAt: string | null;
}

export interface MapEvidence {
  availability: MapEvidenceAvailability;
  states: ReadonlyMap<string, MapEvidenceState>;
  movedPaths: ReadonlyMap<string, string>;
  stalePaths: ReadonlyMap<string, StaleEvidencePath>;
}

type WalkChanges = ReadonlyMap<string, GitPathLastChange>;

const EMPTY_DOCS: readonly VaultDoc[] = [];
const NO_STATES: ReadonlyMap<string, MapEvidenceState> = new Map();
const NO_PATHS: ReadonlyMap<string, string> = new Map();
const NO_STALE_PATHS: ReadonlyMap<string, StaleEvidencePath> = new Map();
const NO_CONCEPTS: ReturnType<typeof buildEvidenceConcepts> = [];

/**
 * One walk's answer: the dates, and the moved files whose only change since their concept's document
 * is in comments, imports or whitespace (`unchangedEvidencePairs`, the rule `validate_vault` uses).
 */
interface WalkAnswer {
  changes: WalkChanges;
  unchangedPairs: ReadonlySet<string>;
}

/** Stale-while-revalidate: a screen that mounts reads the folder's last answer at once and walks Git again in the background, joining a walk in flight for the same paths. Only a successful walk replaces the answer. */
const answers = new Map<string, { key: string; answer: WalkAnswer }>();
const inFlight = new Map<string, Promise<WalkAnswer | null>>();
const NO_UNCHANGED_PAIRS: ReadonlySet<string> = new Set();
const answerListeners = new Set<() => void>();

function subscribeToAnswers(listener: () => void): () => void {
  answerListeners.add(listener);
  return () => answerListeners.delete(listener);
}

/** The native walk answers this many paths per call and drops the rest (MAX_EVIDENCE_PATHS: src-tauri/src/git/evidence.rs). */
const GIT_WALK_PATH_LIMIT = 512;

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

/**
 * Each pair's last verdict, keyed by pair, with a fingerprint of the working text it was judged on.
 * The committed side never changes for a pair, so an unchanged working file reuses the verdict
 * instead of normalizing both sides again on the main thread.
 */
const pairVerdicts = new Map<string, Map<string, { after: string; unchangedKey: string | null }>>();
/** Normalizing gives the main thread back after this long. */
const NORMALIZE_SLICE_MS = 8;

/** Length and two independent 32-bit hashes: a false match needs all three to collide. */
function fingerprint(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b + code, 0x5bd1e995) ^ (b >>> 15);
  }
  return `${text.length}:${(a >>> 0).toString(36)}:${(b >>> 0).toString(36)}`;
}

const yieldToMainThread = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Re-reads each file the dates call moved, at its concept document's newest commit and on disk,
 * one chunk per call until every pair is judged, the order `validate_vault` reads them in. A chunk
 * that fails leaves its pairs moved.
 */
async function readUnchangedPairs(
  rootPath: string,
  concepts: readonly EvidenceConceptInput[],
  changes: WalkChanges,
): Promise<ReadonlySet<string>> {
  const pairs = movedEvidencePairs(concepts, changes);
  if (pairs.length === 0) return NO_UNCHANGED_PAIRS;
  const unchanged = new Set<string>();
  const previous = pairVerdicts.get(rootPath);
  // Only the pairs this folder asks about now are remembered.
  const remembered = new Map<string, { after: string; unchangedKey: string | null }>();
  for (let start = 0; start < pairs.length; start += EVIDENCE_TEXT_CHUNK) {
    let readings: Awaited<ReturnType<typeof gitEvidenceTextPairs>> = null;
    try {
      readings = await gitEvidenceTextPairs(rootPath, pairs.slice(start, start + EVIDENCE_TEXT_CHUNK));
    } catch {
      readings = null;
    }
    let sliceStart = performance.now();
    for (const reading of readings ?? []) {
      if (typeof reading.before !== 'string' || typeof reading.after !== 'string') continue;
      const memoKey = `${reading.commit}\0${reading.path}`;
      const after = fingerprint(reading.after);
      const known = previous?.get(memoKey);
      const unchangedKey =
        known && known.after === after ? known.unchangedKey : ([...unchangedEvidencePairs([reading])][0] ?? null);
      remembered.set(memoKey, { after, unchangedKey });
      if (unchangedKey) unchanged.add(unchangedKey);
      if (performance.now() - sliceStart >= NORMALIZE_SLICE_MS) {
        await yieldToMainThread();
        sliceStart = performance.now();
      }
    }
  }
  pairVerdicts.set(rootPath, remembered);
  return unchanged;
}

function revalidate(
  key: string,
  rootPath: string,
  repoPaths: string[],
  vaultPaths: string[],
  concepts: readonly EvidenceConceptInput[],
): Promise<WalkAnswer | null> {
  const running = inFlight.get(key);
  if (running) return running;
  const walk = walkInBatches(rootPath, repoPaths, vaultPaths)
    .then(async (rows): Promise<WalkAnswer | null> => {
      if (!rows) return null;
      const changes: WalkChanges = new Map(rows.map((row) => [row.path, row]));
      // Published once, after the re-read, so a comment-only file never flashes stale.
      const answer: WalkAnswer = { changes, unchangedPairs: await readUnchangedPairs(rootPath, concepts, changes) };
      answers.set(rootPath, { key, answer });
      for (const listener of answerListeners) listener();
      return answer;
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
  pairVerdicts.clear();
}

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

  // Nothing is built without a loaded folder or for a view that draws no evidence.
  const measurable = enabled && nativeRootPath !== null;
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
  const walked = useSyncExternalStore(
    subscribeToAnswers,
    () => {
      const stored = nativeRootPath ? answers.get(nativeRootPath) : undefined;
      return stored?.key === key ? stored.answer : null;
    },
    () => null,
  );
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const loadedAt = vault.lastLoadedAt;
  useEffect(() => {
    if (!enabled || !nativeRootPath || noPaths) return;
    let cancelled = false;
    void revalidate(key, nativeRootPath, repoPaths, vaultPaths, concepts).then((answer) => {
      if (!cancelled) setFailedKey(answer ? null : key);
    });
    return () => {
      cancelled = true;
    };
    // A new read of the folder walks again: a document or a commit may have changed the answer.
  }, [enabled, nativeRootPath, noPaths, key, repoPaths, vaultPaths, concepts, loadedAt]);

  const reading = walked === null && failedKey !== key;
  return useMemo<MapEvidence>(() => {
    if (!nativeRootPath) return unmeasured('app-only');
    if (!enabled) return unmeasured('reading');
    if (noPaths) return unmeasured('no-paths');
    if (reading) return unmeasured('reading');
    if (!walked) return unmeasured('unreadable');
    const resolved = resolveEvidenceStates(concepts, walked.changes, walked.changes, walked.unchangedPairs);
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
  }, [nativeRootPath, enabled, noPaths, reading, walked, concepts]);
}

function unmeasured(availability: Exclude<MapEvidenceAvailability, 'measured'>): MapEvidence {
  return { availability, states: NO_STATES, movedPaths: NO_PATHS, stalePaths: NO_STALE_PATHS };
}
