export type Lens = "concepts" | "files";

/**
 * The document a person is following through its own history. A press on "Other steps that
 * changed this document" carries it to the opened step, or "Restore this version" there would
 * restore that step's first document instead of the followed one.
 */
export interface DocumentFollow {
  path: string;
  lens: Lens;
  conceptId: string | null;
}

/**
 * Which lens a step's detail opens in. Following a document the step changed: concepts when it
 * was read there and a concept of this step carries it, else files (a deleted document has no
 * concept). Not following: concepts first, unless the step touched no concept.
 */
export function arrivalLens({
  follow,
  followChanged,
  followCarried,
  conceptCount,
  fileCount,
}: {
  follow: DocumentFollow | null;
  followChanged: boolean;
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
