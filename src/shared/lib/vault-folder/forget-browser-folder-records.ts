import { idbRewriteAll, type IdbRewrite } from './idb-kv';

/** The keys `src/entities/local-fs-handle/api/store.ts` keeps remembered folders under. */
const FOLDER_KEY_PREFIX = 'docs-vault:fs-handle:';
const LEGACY_FOLDER_KEY = 'docs-vault:current-handle';

const isFolderKey = (key: string) => key.startsWith(FOLDER_KEY_PREFIX) || key === LEGACY_FOLDER_KEY;

/** The installed app's records name a path on disk; a browser's hold a folder handle only. */
const namesAPathOnDisk = (record: unknown): boolean =>
  typeof record === 'object' && record !== null && Boolean((record as { desktopRootPath?: unknown }).desktopRootPath);

function rewriteFolderRecord(key: string, value: unknown): IdbRewrite {
  if (!isFolderKey(key)) return { action: 'keep' };
  if (Array.isArray(value)) {
    const kept = value.filter(namesAPathOnDisk);
    if (kept.length === value.length) return { action: 'keep' };
    return kept.length === 0 ? { action: 'delete' } : { action: 'set', value: kept };
  }
  return namesAPathOnDisk(value) ? { action: 'keep' } : { action: 'delete' };
}

/**
 * Deletes the folder records a browser once kept, the ones with no path on disk, and nothing else:
 * a record of the installed app and every other key stay. A browser's website no longer reads them,
 * and deleting them touches no folder on disk.
 */
export function forgetBrowserFolderRecords(): Promise<void> {
  return idbRewriteAll(rewriteFolderRecord);
}
