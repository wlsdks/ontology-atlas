/**
 * The Compile turn's **only window onto the raw sources.**
 *
 * The same structural proof `vault-read-port.ts` makes for the graph, made again for
 * `sources/`: there is no write method here, so a model that decides to edit its own
 * evidence finds no function to call. Compile rule (e) — *never modify anything under
 * `sources/`* — is a code path rather than a sentence in a prompt.
 *
 * `sources` is the folder's **own inventory**, handed over by the same walk the Library
 * list is drawn from. That is what bounds the reader: a path the walk did not produce is
 * refused, so nothing outside `sources/` and nothing the walk skipped — a symlink, which
 * neither the File System Access traversal nor Rust's `list_vault_directory` reports as a
 * file — can be reached by naming it.
 *
 * When adding a method, do not put a write here.
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
   * The sha256 of one inventoried source's bytes, lowercase hex, or null when this
   * runtime cannot measure it.
   *
   * Hashing sits on the port rather than in the pure builder because the two surfaces
   * measure it differently — one native call in the app, `crypto.subtle` over the bytes
   * in a browser — and `use-library-model.ts` already owns that choice for the Library's
   * own rows. Null is a real answer (a browser without a secure context has no digest),
   * and a proposal that cannot record what it read is refused rather than written with an
   * empty `source_hash`, which every reader would go on to call stale.
   */
  hashSource(path: string): Promise<string | null>;
}
