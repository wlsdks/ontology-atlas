/** The two ways a step's detail reads what it changed: by concept, or by file. */
export type Lens = "concepts" | "files";

/**
 * The document a person is following through its own history. A press on "Other steps that
 * changed this document" carries it to the opened step, or "Restore this version" there would
 * restore that step's first document instead of the followed one.
 */
export interface DocumentFollow {
  /** Repository-relative path, as `GitChangeEntry.path`: the document's identity across steps. */
  path: string;
  /** The lens it was being read in; the step opens in the same one wherever it can. */
  lens: Lens;
  /** In the concepts lens, the concept whose document it is; `null` in the files lens. */
  conceptId: string | null;
}

/**
 * Which lens a step's detail opens in.
 *
 * - Following a document the step changed: the concepts lens when it was being read there and a
 *   concept of this step carries it; otherwise the files lens, which always holds the file itself
 *   (a document the step deleted has no concept to carry it, and its missing door is explained
 *   there).
 * - Following one the step's file list does not hold (a merge prints no files): the lens it was
 *   being read in, unless that lens is empty.
 * - Not following: concepts first — that is where this product parts ways with a git client —
 *   except when the step touched no concept, because a lens with nothing in it is not a default.
 */
export function arrivalLens({
  follow,
  followChanged,
  followCarried,
  conceptCount,
  fileCount,
}: {
  follow: DocumentFollow | null;
  /** The step's changed files include the followed document. */
  followChanged: boolean;
  /** A concept of this step carries the followed document. */
  followCarried: boolean;
  conceptCount: number;
  fileCount: number;
}): Lens {
  if (follow && followChanged) {
    return follow.lens === "concepts" && followCarried ? "concepts" : "files";
  }
  if ((follow?.lens ?? "concepts") === "concepts") return conceptCount > 0 ? "concepts" : "files";
  return fileCount > 0 || conceptCount === 0 ? "files" : "concepts";
}
