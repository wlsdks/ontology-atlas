'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useDataSourceMode } from '@/entities/vault-session';
import { useLocalVault } from '@/entities/vault-session';
import { useStaticVaultSource } from '@/entities/vault-session';
import type { VaultDoc, VaultManifest } from '@/entities/docs-vault';
import { selectOpenVaultHandle } from '@/shared/lib/select-open-vault-handle';
import { gitDiff, gitPathsLastChange, isGitBridgeAvailable } from '@/shared/lib/tauri-git';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';

/** Document slug → its manifest date: the file's own date locally, the build's stamp in a sample. */
export function manifestToFreshnessIndex(manifest: VaultManifest): Map<string, string> {
  const map = new Map<string, string>();
  for (const doc of manifest.docs) {
    map.set(doc.slug, doc.updatedAt);
  }
  return map;
}

const EMPTY_FRESHNESS_INDEX: Map<string, string> = new Map();

/** What Git says about a vault's documents, keyed by vault-relative path (`VaultDoc.path`). */
export interface VaultDocGitState {
  /** The newest commit touching each document, as far as the walk reached; null when none did. */
  committedAt: ReadonlyMap<string, string | null>;
  /** Documents Git shows changed since their last commit: edited, added, renamed or never tracked. */
  pending: ReadonlySet<string>;
}

/**
 * Change dates by the manifest's rule (`scripts/build-docs-vault.mjs`, `latestInputDay`): Git's
 * last commit unless Git shows the file changed since. A file date alone is not a change date,
 * since a clone or checkout stamps every file.
 */
export function resolveDocChangeDates(
  docs: readonly Pick<VaultDoc, 'slug' | 'path' | 'updatedAt'>[],
  git: VaultDocGitState,
): Map<string, string> {
  const dates = new Map<string, string>();
  for (const doc of docs) {
    const committed = git.pending.has(doc.path) ? null : (git.committedAt.get(doc.path) ?? null);
    dates.set(doc.slug, committed ?? doc.updatedAt);
  }
  return dates;
}

/**
 * The documents among `docPaths` that Git lists as changed. Git names a path from the
 * repository's root and the vault may sit anywhere inside it (`<project>/atlas`), so each
 * changed path is matched to the longest document path it ends with, on whole segments.
 */
export function pendingDocPaths(changedRepoPaths: readonly string[], docPaths: Iterable<string>): Set<string> {
  const docs = new Set(docPaths);
  const pending = new Set<string>();
  for (const changed of changedRepoPaths) {
    const segments = changed.split('/');
    for (let start = 0; start < segments.length; start += 1) {
      const tail = segments.slice(start).join('/');
      if (docs.has(tail)) {
        pending.add(tail);
        break;
      }
    }
  }
  return pending;
}

/** Documents `git_paths_last_change` dates in one walk (`MAX_EVIDENCE_PATHS`, `src-tauri/src/git.rs`). */
const GIT_WALK_PATH_LIMIT = 512;

/** A document that is a node — the only documents the change dates are read for. */
function isNodeDocument(doc: VaultDoc): boolean {
  return typeof doc.frontmatter.kind === 'string' && doc.frontmatter.kind.trim() !== '';
}

/** One settled Git walk: the folder and the read it answered, and what the files said then. */
interface GitWalk {
  root: string;
  manifest: VaultManifest;
  /** null: Git could not be read for this folder (no repository, no Git). */
  git: VaultDocGitState | null;
  /** Each document's file date when Git was asked, by path. */
  fileDates: ReadonlyMap<string, string>;
}

/* One Git walk per folder read, shared by every reader and kept after it settles. */
let settledWalk: GitWalk | null = null;
let pendingWalk: { root: string; manifest: VaultManifest } | null = null;
const walkListeners = new Set<() => void>();

function subscribeWalk(listener: () => void): () => void {
  walkListeners.add(listener);
  return () => walkListeners.delete(listener);
}
const settledWalkSnapshot = () => settledWalk;
const noWalkOnServer = () => null;

function requestDocGitState(root: string, manifest: VaultManifest): void {
  if (settledWalk && settledWalk.root === root && settledWalk.manifest === manifest) return;
  if (pendingWalk && pendingWalk.root === root && pendingWalk.manifest === manifest) return;
  pendingWalk = { root, manifest };
  const paths = manifest.docs.filter(isNodeDocument).map((doc) => doc.path);
  const fileDates = new Map(manifest.docs.map((doc) => [doc.path, doc.updatedAt] as const));
  void (async (): Promise<VaultDocGitState | null> => {
    try {
      const batches: Promise<Awaited<ReturnType<typeof gitPathsLastChange>>>[] = [];
      for (let from = 0; from < paths.length; from += GIT_WALK_PATH_LIMIT) {
        batches.push(gitPathsLastChange(root, [], paths.slice(from, from + GIT_WALK_PATH_LIMIT)));
      }
      const [changes, rows] = await Promise.all([gitDiff(root), Promise.all(batches)]);
      if (!changes || rows.some((batch) => batch === null)) return null;
      const committedAt = new Map<string, string | null>();
      for (const batch of rows) for (const row of batch ?? []) committedAt.set(row.path, row.lastChangedAt);
      return { committedAt, pending: pendingDocPaths(changes.files.map((file) => file.path), paths) };
    } catch {
      // Not a repository, or Git could not run here: the files' own dates are all there is.
      return null;
    }
  })().then((git) => {
    // A newer read of the folder asked meanwhile; its own answer is the one to keep.
    if (pendingWalk?.root !== root || pendingWalk.manifest !== manifest) return;
    pendingWalk = null;
    settledWalk = { root, manifest, git, fileDates };
    for (const listener of walkListeners) listener();
  });
}

export interface VaultDocDates {
  /** Document slug → when that document last changed (ISO). */
  index: ReadonlyMap<string, string>;
  /** Git is being asked for the first time; nothing is dated, or file dates flash everything as changed today. */
  reading: boolean;
}

/**
 * When each vault document last changed, keyed by slug, for every recency surface. In the app
 * inside Git this uses `resolveDocChangeDates`; elsewhere the manifest dates stand. A re-read
 * keeps the last walk's answer for unwritten files.
 */
export function useVaultDocDates(): VaultDocDates {
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  // With two bundled vaults the manifest arrives as a module constant, so the memo re-runs only per sample.
  const staticSource = useStaticVaultSource();
  const manifest = mode === 'local' && vault.status === 'loaded' ? vault.manifest : null;
  const handle = mode === 'local' ? selectOpenVaultHandle(vault.status, vault.handle) : null;
  const root = handle ? (getTauriVaultRootPath(handle) ?? null) : null;
  const bridge = isGitBridgeAvailable();

  const walk = useSyncExternalStore(subscribeWalk, settledWalkSnapshot, noWalkOnServer);
  useEffect(() => {
    if (bridge && root && manifest) requestDocGitState(root, manifest);
  }, [bridge, root, manifest]);

  return useMemo<VaultDocDates>(() => {
    if (mode === 'static') return { index: manifestToFreshnessIndex(staticSource.manifest), reading: false };
    if (!manifest) return { index: EMPTY_FRESHNESS_INDEX, reading: false };
    if (!bridge || !root) return { index: manifestToFreshnessIndex(manifest), reading: false };
    if (!walk || walk.root !== root) return { index: EMPTY_FRESHNESS_INDEX, reading: true };
    // Git could not be read for this folder (no repository): its files' dates are all there is.
    if (!walk.git) return { index: manifestToFreshnessIndex(manifest), reading: false };
    if (walk.manifest === manifest) return { index: resolveDocChangeDates(manifest.docs, walk.git), reading: false };
    const pending = new Set(walk.git.pending);
    for (const doc of manifest.docs) if (walk.fileDates.get(doc.path) !== doc.updatedAt) pending.add(doc.path);
    return { index: resolveDocChangeDates(manifest.docs, { committedAt: walk.git.committedAt, pending }), reading: false };
  }, [mode, staticSource.manifest, manifest, bridge, root, walk]);
}

/** `useVaultDocDates().index` — the change date of each document, by slug. */
export function useVaultDocFreshnessIndex(): ReadonlyMap<string, string> {
  return useVaultDocDates().index;
}

/** The manifest's own file dates, for "was this file written since I opened it", which a commit must not answer. */
export function useVaultDocFileDates(): ReadonlyMap<string, string> {
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  const staticSource = useStaticVaultSource();

  return useMemo(() => {
    if (mode === 'static') return manifestToFreshnessIndex(staticSource.manifest);
    if (vault.status !== 'loaded' || !vault.manifest) return EMPTY_FRESHNESS_INDEX;
    return manifestToFreshnessIndex(vault.manifest);
  }, [mode, vault.status, vault.manifest, staticSource.manifest]);
}
