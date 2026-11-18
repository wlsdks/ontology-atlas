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

/** Payload of the app's `vault-changed` event. `rescan`: the paths are not the whole story. */
export interface VaultChangeBatch {
  changes: VaultPathChange[];
  rescan: boolean;
}

const RESCAN_BATCH: VaultChangeBatch = { changes: [], rescan: true };
const PATH_KINDS = new Set(['file', 'directory', 'missing', 'other']);

/** Anything but the documented shape asks for a full re-read. */
export function parseVaultChangeBatch(payload: unknown): VaultChangeBatch {
  if (!payload || typeof payload !== 'object') return RESCAN_BATCH;
  const { changes, rescan } = payload as { changes?: unknown; rescan?: unknown };
  if (rescan !== false || !Array.isArray(changes)) return RESCAN_BATCH;
  const parsed: VaultPathChange[] = [];
  for (const change of changes) {
    const { path, kind, lastModified, size } = (change ?? {}) as Record<string, unknown>;
    if (typeof path !== 'string' || typeof kind !== 'string' || !PATH_KINDS.has(kind)) return RESCAN_BATCH;
    parsed.push({
      path,
      kind: kind as VaultPathChange['kind'],
      ...(typeof lastModified === 'number' ? { lastModified } : {}),
      ...(typeof size === 'number' ? { size } : {}),
    });
  }
  return { changes: parsed, rescan: false };
}
