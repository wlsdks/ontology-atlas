'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useLocalVault } from '@/entities/vault-session';
import type { VaultDoc, VaultManifest } from '@/entities/docs-vault';
import { selectOpenVaultHandle } from '@/shared/lib/vault-folder/select-open-vault-handle';
import { gitDiff, gitPathsLastChange } from '@/shared/lib/git/tauri-git';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';

export function manifestToFreshnessIndex(manifest: VaultManifest): Map<string, string> {
  const map = new Map<string, string>();
  for (const doc of manifest.docs) {
    map.set(doc.slug, doc.updatedAt);
  }
  return map;
}

const EMPTY_FRESHNESS_INDEX: Map<string, string> = new Map();

export interface VaultDocGitState {
  committedAt: ReadonlyMap<string, string | null>;
  pending: ReadonlySet<string>;
}

/** A file date alone is not a change date, since a clone or checkout stamps every file. */
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

/** Git names a path from the repository's root and the vault may sit anywhere inside it, so each changed path is matched to the longest document path it ends with, on whole segments. */
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

/** Dates docs by `git_paths_last_change` walk (MAX_EVIDENCE_PATHS: src-tauri/src/git/evidence.rs). */
const GIT_WALK_PATH_LIMIT = 512;

function isNodeDocument(doc: VaultDoc): boolean {
  return typeof doc.frontmatter.kind === 'string' && doc.frontmatter.kind.trim() !== '';
}

interface GitWalk {
  root: string;
  manifest: VaultManifest;
  git: VaultDocGitState | null;
  fileDates: ReadonlyMap<string, string>;
}

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
      const [changes, rows] = await Promise.all([gitDiff(root, { includePatch: false }), Promise.all(batches)]);
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
  index: ReadonlyMap<string, string>;
  /** Git is being asked for the first time; nothing is dated, or file dates flash everything as changed today. */
  reading: boolean;
}

export function useVaultDocDates(): VaultDocDates {
  const vault = useLocalVault();
  const manifest = vault.status === 'loaded' ? vault.manifest : null;
  const handle = selectOpenVaultHandle(vault.status, vault.handle);
  const root = handle ? (getTauriVaultRootPath(handle) ?? null) : null;

  const walk = useSyncExternalStore(subscribeWalk, settledWalkSnapshot, noWalkOnServer);
  useEffect(() => {
    if (root && manifest) requestDocGitState(root, manifest);
  }, [root, manifest]);

  return useMemo<VaultDocDates>(() => {
    if (!manifest) return { index: EMPTY_FRESHNESS_INDEX, reading: false };
    if (!root) return { index: manifestToFreshnessIndex(manifest), reading: false };
    if (!walk || walk.root !== root) return { index: EMPTY_FRESHNESS_INDEX, reading: true };
    // Git could not be read for this folder (no repository): its files' dates are all there is.
    if (!walk.git) return { index: manifestToFreshnessIndex(manifest), reading: false };
    if (walk.manifest === manifest) return { index: resolveDocChangeDates(manifest.docs, walk.git), reading: false };
    const pending = new Set(walk.git.pending);
    for (const doc of manifest.docs) if (walk.fileDates.get(doc.path) !== doc.updatedAt) pending.add(doc.path);
    return { index: resolveDocChangeDates(manifest.docs, { committedAt: walk.git.committedAt, pending }), reading: false };
  }, [manifest, root, walk]);
}

/** The manifest's own file dates, for "was this file written since I opened it", which a commit must not answer. */
export function useVaultDocFileDates(): ReadonlyMap<string, string> {
  const vault = useLocalVault();

  return useMemo(() => {
    if (vault.status !== 'loaded' || !vault.manifest) return EMPTY_FRESHNESS_INDEX;
    return manifestToFreshnessIndex(vault.manifest);
  }, [vault.status, vault.manifest]);
}
