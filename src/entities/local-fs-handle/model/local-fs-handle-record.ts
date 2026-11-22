/** A persisted directory handle with metadata; on Tauri a shim is rebuilt from `desktopRootPath`. */

export interface LocalFsHandleRecord {
  /** 'current' in single-vault mode. */
  id: string;
  /** Permission is separate; check it after restoring. */
  handle: FileSystemDirectoryHandle;
  /** Tauri stores the path because the handle cannot be structured-cloned there. */
  desktopRootPath?: string;
  name: string;
  createdAt: number;
  /** Refreshed on restore and open. */
  lastAccessedAt: number;
  /**
   * Counts from the last real read, cached at load because a chooser cannot read folders without a
   * permission gesture. Absent for older records, never shown as zero.
   */
  docCount?: number;
  /** The map's census (`MAP_CONCEPT_KINDS`). */
  conceptCount?: number;
  countedAt?: number;
}
