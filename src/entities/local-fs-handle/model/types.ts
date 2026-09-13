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
  /**
   * What the folder held the last time it was actually read, and when that reading
   * happened. Three fields rather than two, because a count with no timestamp cannot
   * be labelled — and an unlabelled count on a chooser row reads as "this is what is
   * in there right now", which it is not.
   *
   * They exist so a chooser row can say what a folder *contains* instead of only its
   * name. Counting at chooser time is not an option: on the web reading a folder needs
   * a permission gesture, which is the very thing the person has not made yet, and on
   * the desktop walking five folders to draw one list spends a full vault read per row.
   * So the count is cached at load, by the one code path that has already paid for the
   * walk, and the row states its age.
   *
   * All three are optional and stay absent for a folder whose last open predates this
   * record shape. A row with no counts says so; it does not print a zero. Zero is a
   * real and different answer ("an empty folder").
   */
  docCount?: number;
  /**
   * Kind-bearing documents outside `wiki/` — the same predicate the Library's lint
   * brief uses (`src/features/library/lib/lint-brief.ts`), so two surfaces cannot
   * disagree about what counts as a concept.
   */
  conceptCount?: number;
  /** When `docCount` / `conceptCount` were taken, epoch ms. */
  countedAt?: number;
}
