/**
 * The Compile turn's only window onto raw sources: no write method, so a model cannot edit its
 * evidence. Only paths from the folder's own inventory can be read. Do not add a write here.
 */

/** One raw source, as the folder's walk found it. */
export interface SourceReadEntry {
  /** Vault-relative path, always beginning `sources/`. */
  path: string;
  /** File name as it sits on disk. */
  name: string;
  /** Lowercase extension without the dot (`pdf`), or `''` when the name has none. */
  format: string;
  /** Byte length from the directory entry. */
  bytes: number;
}

export interface SourceReadPort {
  /** The inventory of `sources/` in the open folder. A path outside it cannot be read. */
  readonly sources: readonly SourceReadEntry[];
  /**
   * The raw bytes of one inventoried source. Null when the folder no longer holds it —
   * the inventory is a snapshot, and a file deleted since the walk is absent rather than
   * invented.
   */
  readSourceBytes(path: string): Promise<ArrayBuffer | null>;
  /**
   * sha256 of the supplied read snapshot, never a reopened path, so newer bytes are never
   * attributed to older text. Null when this runtime cannot hash; that proposal is refused.
   */
  hashSource(path: string, bytes: ArrayBuffer): Promise<string | null>;
}
