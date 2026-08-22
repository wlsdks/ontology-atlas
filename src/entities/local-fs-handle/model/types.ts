/**
 * The persisted local file-system directory handle.
 *
 * The File System Access API's `FileSystemDirectoryHandle` survives a
 * structured clone into IndexedDB. This record bundles that handle with its
 * metadata (name, registered and last-accessed times). The `current` record is
 * restored automatically, and the recent-vault list uses the same shape. On Tauri
 * desktop the handle is not clonable, so a shim is rebuilt from `desktopRootPath`.
 */

export interface LocalFsHandleRecord {
  /** Stable identifier. 'current' in single-vault mode; an arbitrary slug if multi-vault ever lands. */
  id: string;
  /**
   * The directory handle, structured-cloned into IndexedDB. Permission is separate —
   * check with `queryPermission` / `requestPermission` after restoring.
   */
  handle: FileSystemDirectoryHandle;
  /**
   * Tauri desktop fallback. Web FileSystemDirectoryHandle cannot be structured
   * cloned there, so the desktop app stores the selected vault path and
   * reconstructs a handle shim on restore.
   */
  desktopRootPath?: string;
  /** Display name at registration time (`handle.name`) — the default label shown to the user. */
  name: string;
  /** Registration time, epoch ms. */
  createdAt: number;
  /** Last access, epoch ms — refreshed on restore and open. */
  lastAccessedAt: number;
}
