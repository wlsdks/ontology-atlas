import { isAtlasTemporaryName } from '@/shared/lib/vault-folder/atlas-temporary-names';
import type { StampedVaultEntry } from '@/shared/lib/vault-folder/tauri-vault-fs';
import type { VaultPathChange } from '@/shared/lib/vault-folder/vault-change-batch';
import type { VaultManifest } from '../../../model/types';
import type { BuiltVaultEntry } from '../md-entry';
import {
  CACHE_DIR_TAG,
  isPrunedDirName,
  VAULT_WALK_MAX_DEPTH,
  VAULT_WALK_MAX_ENTRIES,
  walkedKind,
  type WalkEntry,
} from '../walk-vault';
import type { DeltaState } from './vault-delta-state';
import { isConfinedRelativePath, nameOf, withinAny } from '../vault-paths';

export interface Upsert {
  path: string;
  kind: WalkEntry['kind'];
  lastModified?: number;
  size?: number;
}

export type ListDir = (dir: string) => Promise<StampedVaultEntry[]>;

export class NeedsRescan extends Error {}

interface Listed {
  kind: WalkEntry['kind'];
  lastModified: number;
  size: number;
}

/**
 * What the walk would find under `dir` now, by its rules, with stamps and no reads. O(entries
 * beneath it). The folders it prunes are collected so the caller can compare them with the last
 * walk's; source code throws, because only a walk keeps that count.
 */
async function listSubtree(list: ListDir, dir: string, out: Map<string, Listed>, pruned: string[]): Promise<void> {
  if (dir.split('/').length > VAULT_WALK_MAX_DEPTH) throw new NeedsRescan();
  const children = await list(dir);
  if (children.some((child) => child.name === CACHE_DIR_TAG)) {
    pruned.push(dir);
    return;
  }
  for (const child of children) {
    if (child.name.startsWith('.')) continue;
    const path = `${dir}/${child.name.normalize('NFC')}`;
    if (child.kind === 'directory') {
      if (isPrunedDirName(child.name)) pruned.push(path);
      else await listSubtree(list, path, out, pruned);
      continue;
    }
    const kind = walkedKind(path, child.name);
    if (kind === 'code') throw new NeedsRescan();
    if (!kind) continue;
    if (child.lastModified === undefined || child.size === undefined) throw new NeedsRescan();
    out.set(path, { kind, lastModified: child.lastModified, size: child.size });
  }
}

/** Whether the stamp is the one the last build read: an echo, or a file a listing found unchanged. */
export function sameStamp(known: BuiltVaultEntry, lastModified: number | undefined, size: number | undefined): boolean {
  return lastModified !== undefined && known.lastModified === lastModified && (known.kind !== 'source' || known.bytes === size);
}

/** Past this many changed files the walk is cheaper: a fifth of the vault, never below 1,000. At 50,000 files removals cross over near a quarter (10,000: 231 vs 294 ms; 17,945: 320 vs 251 ms), so a fifth keeps margin. */
export function deltaCeiling(knownFiles: number): number {
  return Math.max(1_000, Math.floor(knownFiles / 5));
}

export interface ChangePlan {
  upserts: Map<string, Upsert>;
  removals: Set<string>;
  sidecarsTouched: boolean;
}

/**
 * Sorts each reported path into reads and removals, or gives up. A reported folder is listed
 * again whole, as the walk would list it, so a folder moved in, replaced or emptied converges.
 * O(paths + listed entries), plus one O(known files · depth) pass when a folder was reported.
 */
export async function planChanges(
  manifest: VaultManifest,
  state: DeltaState,
  changes: readonly VaultPathChange[],
  list: ListDir,
  pendingSources: () => Promise<ReadonlySet<string>>,
): Promise<ChangePlan | null> {
  const prunedDirs = manifest.prunedDirs ?? [];
  const codeFiles = manifest.sourceFileCount ?? 0;
  const byPath = new Map<string, VaultPathChange>();
  const byFold = new Map<string, string>();
  let sidecarsTouched = false;
  for (const change of changes) {
    const path = change.path.normalize('NFC');
    if (!isConfinedRelativePath(path)) return null;
    const parts = path.split('/');
    const name = parts[parts.length - 1];
    // A writer's temporary is renamed over its target, whose own path the batch reports.
    if (isAtlasTemporaryName(name)) continue;
    // A case-only rename reports both spellings; on a case-blind disk either one reads.
    const fold = path.toLowerCase();
    if ((byFold.get(fold) ?? path) !== path) return null;
    byFold.set(fold, path);
    if (parts.some((part) => part.startsWith('.'))) {
      sidecarsTouched = true;
      continue;
    }
    if (parts.slice(0, -1).some(isPrunedDirName)) continue;
    // A cache tag prunes or un-prunes its folder, inside a pruned one or not.
    if (name === CACHE_DIR_TAG) return null;
    if (prunedDirs.some((dir) => path.startsWith(`${dir}/`))) continue;
    if (isPrunedDirName(name) || parts.length > VAULT_WALK_MAX_DEPTH + 1) return null;
    if (change.kind !== 'directory' && prunedDirs.some((dir) => dir === path || dir.startsWith(`${path}/`))) return null;
    byPath.set(path, { ...change, path });
  }

  const upserts = new Map<string, Upsert>();
  const removals = new Set<string>();
  const gone = new Set<string>();
  const relisted = new Set<string>();
  for (const [path, change] of byPath) {
    const known = state.byPath.get(path);
    if (change.kind === 'file') {
      const kind = walkedKind(path, nameOf(path));
      if (kind === 'code') return null;
      if (kind && !(known && sameStamp(known, change.lastModified, change.size))) {
        upserts.set(path, { path, kind, lastModified: change.lastModified, size: change.size });
      }
      continue;
    }
    if (known) removals.add(path);
    if (change.kind === 'directory') relisted.add(path);
    else if (state.dirCounts.has(path)) gone.add(path);
    // It may have been a source-code file or a folder of them; only a walk recounts those.
    else if (!known && codeFiles > 0) return null;
  }

  if (gone.size > 0 || relisted.size > 0) {
    // A gone folder's code files were counted, never listed.
    if (gone.size > 0 && codeFiles > 0) return null;
    const roots = new Set([...relisted].filter((dir) => withinAny(dir, relisted, false) === null));
    const listed = new Map<string, Listed>();
    const pruned: string[] = [];
    try {
      for (const dir of roots) await listSubtree(list, dir, listed, pruned);
    } catch (error) {
      if (error instanceof NeedsRescan || (error as { name?: string })?.name === 'NotFoundError') return null;
      throw error;
    }
    // The folders the walk prunes under a listed one must be the ones it pruned last time.
    const prunedBefore = prunedDirs.filter((dir) => withinAny(dir, roots, true) !== null);
    if (prunedBefore.length !== pruned.length || !prunedBefore.every((dir) => pruned.includes(dir))) return null;
    // Under a gone folder every known file leaves; under a listed one, every file it did not list.
    for (const path of state.byPath.keys()) {
      if (withinAny(path, gone, false) !== null || (!listed.has(path) && withinAny(path, roots, false) !== null)) {
        removals.add(path);
      }
    }
    // The listing is newer than the watcher's stamps for what lies under it.
    for (const path of upserts.keys()) {
      if (!listed.has(path) && withinAny(path, roots, false) !== null) {
        upserts.delete(path);
        if (state.byPath.has(path)) removals.add(path);
      }
    }
    for (const [path, found] of listed) {
      const known = state.byPath.get(path);
      if (known && sameStamp(known, found.lastModified, found.size)) {
        upserts.delete(path);
        removals.delete(path);
      } else {
        upserts.set(path, { path, kind: found.kind, lastModified: found.lastModified, size: found.size });
      }
    }
  }

  if ([...upserts.values()].some((upsert) => upsert.kind === 'source')) {
    const pending = await pendingSources();
    for (const [path, upsert] of upserts) {
      if (upsert.kind !== 'source' || !pending.has(path)) continue;
      upserts.delete(path);
      if (state.byPath.has(path)) removals.add(path);
    }
  }
  for (const path of upserts.keys()) removals.delete(path);
  if (upserts.size + removals.size > deltaCeiling(state.byPath.size)) return null;
  let size = state.byPath.size - removals.size;
  for (const path of upserts.keys()) if (!state.byPath.has(path)) size += 1;
  if (size >= VAULT_WALK_MAX_ENTRIES) return null;
  return { upserts, removals, sidecarsTouched };
}
