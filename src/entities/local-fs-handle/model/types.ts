/** A persisted directory handle with metadata; on Tauri a shim is rebuilt from `desktopRootPath`. */

export interface LocalFsHandleRecord {
  /** 'current' in single-vault mode. */
  id: string;
  /** Permission is separate; check it after restoring. */
  handle: FileSystemDirectoryHandle;
  /** Tauri stores the path because the handle cannot be structured-cloned there. */
  desktopRootPath?: string;
  /** `handle.name` at registration. */
  name: string;
  /** Registration time, epoch ms. */
  createdAt: number;
  /** Refreshed on restore and open. */
  lastAccessedAt: number;
  /**
   * Counts from the last real read, cached at load because a chooser cannot read folders without a
   * permission gesture. Absent for older records, never shown as zero.
   */
  docCount?: number;
  /** Kind-bearing documents outside `wiki/`, as `src/features/library/lib/lint-brief.ts` counts them. */
  conceptCount?: number;
  /** Epoch ms. */
  countedAt?: number;
}
