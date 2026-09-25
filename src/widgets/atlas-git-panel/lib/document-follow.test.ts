import { describe, expect, it } from "vitest";

import { arrivalLens, type DocumentFollow } from "./document-follow";

const inConcepts: DocumentFollow = { path: "elements/bar.md", lens: "concepts", conceptId: "element:bar" };
const inFiles: DocumentFollow = { path: "elements/bar.md", lens: "files", conceptId: null };

describe("arrivalLens", () => {
  it("keeps a followed document in the lens it was read in when this step changed it", () => {
    expect(arrivalLens({ follow: inConcepts, followChanged: true, followCarried: true, conceptCount: 97, fileCount: 100 })).toBe(
      "concepts",
    );
    expect(arrivalLens({ follow: inFiles, followChanged: true, followCarried: true, conceptCount: 97, fileCount: 100 })).toBe(
      "files",
    );
  });

  it("opens the file itself when no concept of this step carries it (a step that deleted it)", () => {
    expect(arrivalLens({ follow: inConcepts, followChanged: true, followCarried: false, conceptCount: 1, fileCount: 1 })).toBe(
      "files",
    );
  });

  it("stays in the lens being read when this step's files do not hold the document, unless that lens is empty", () => {
    expect(arrivalLens({ follow: inConcepts, followChanged: false, followCarried: false, conceptCount: 1, fileCount: 1 })).toBe(
      "concepts",
    );
    expect(arrivalLens({ follow: inFiles, followChanged: false, followCarried: false, conceptCount: 1, fileCount: 1 })).toBe(
      "files",
    );
    // A merge git lists in a document's history carries no files of its own.
    expect(arrivalLens({ follow: inConcepts, followChanged: false, followCarried: false, conceptCount: 0, fileCount: 0 })).toBe(
      "files",
    );
    expect(arrivalLens({ follow: inFiles, followChanged: false, followCarried: false, conceptCount: 2, fileCount: 0 })).toBe(
      "concepts",
    );
  });

  it("opens an ordinary selection on concepts, or on files when the step touched no concept", () => {
    expect(arrivalLens({ follow: null, followChanged: false, followCarried: false, conceptCount: 3, fileCount: 3 })).toBe("concepts");
    expect(arrivalLens({ follow: null, followChanged: false, followCarried: false, conceptCount: 0, fileCount: 2 })).toBe("files");
  });
});
