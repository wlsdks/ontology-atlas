/**
 * The TypeScript side of the app watcher's `vault-changed` payload (`VaultChangeBatch` in
 * `src-tauri/src/vault/watch.rs`): the paths that changed, never trusted for a write.
 */

/** What the watcher found at one changed path, by `lstat` without following a link. */
export interface VaultPathChange {
  /** Relative to the vault root, `/`-separated. */
  path: string;
  /** `other`: a link, a special file, or anything under a linked folder; the walk skips all three. */
  kind: 'file' | 'directory' | 'missing' | 'other';
  /** Files only: milliseconds since the epoch and bytes, as `vault_fingerprint` reports them. */
  lastModified?: number;
  size?: number;
}

/**
 * Payload of the app's `vault-changed` event. `rescan`: the paths are not the whole story.
 * `root`: the folder the watcher reports on, as `start_vault_watch` returned it; a batch for any
 * other folder is not this vault's. `null` only in a rescan made from a malformed payload.
 */
export interface VaultChangeBatch {
  root: string | null;
  changes: VaultPathChange[];
  rescan: boolean;
}

const RESCAN_BATCH: VaultChangeBatch = { root: null, changes: [], rescan: true };
const PATH_KINDS = new Set(['file', 'directory', 'missing', 'other']);

/** Anything but the documented shape asks for a full re-read. */
export function parseVaultChangeBatch(payload: unknown): VaultChangeBatch {
  if (!payload || typeof payload !== 'object') return RESCAN_BATCH;
  const { root, changes, rescan } = payload as { root?: unknown; changes?: unknown; rescan?: unknown };
  if (typeof root !== 'string') return RESCAN_BATCH;
  if (rescan !== false || !Array.isArray(changes)) return { root, changes: [], rescan: true };
  const parsed: VaultPathChange[] = [];
  for (const change of changes) {
    const { path, kind, lastModified, size } = (change ?? {}) as Record<string, unknown>;
    if (typeof path !== 'string' || typeof kind !== 'string' || !PATH_KINDS.has(kind)) return { root, changes: [], rescan: true };
    parsed.push({
      path,
      kind: kind as VaultPathChange['kind'],
      ...(typeof lastModified === 'number' ? { lastModified } : {}),
      ...(typeof size === 'number' ? { size } : {}),
    });
  }
  return { root, changes: parsed, rescan: false };
}
