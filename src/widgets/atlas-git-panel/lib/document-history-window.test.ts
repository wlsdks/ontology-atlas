import { describe, expect, it } from "vitest";
import type { GitCommitInfo } from "@/shared/lib/git/tauri-git";
import {
  DOCUMENT_HISTORY_LIMIT,
  motionDurationMs,
  readDocumentHistory,
  visibleDocumentHistory,
} from "./document-history-window";

const commits = (count: number): GitCommitInfo[] =>
  Array.from({ length: count }, (_, index) => ({ hash: `h${index}` }) as GitCommitInfo);

describe("readDocumentHistory", () => {
  it("keeps the limit and flags older steps only when one more was read", () => {
    expect(readDocumentHistory(commits(DOCUMENT_HISTORY_LIMIT))).toMatchObject({ older: false });
    const over = readDocumentHistory(commits(DOCUMENT_HISTORY_LIMIT + 1));
    expect(over.older).toBe(true);
    expect(over.rows).toHaveLength(DOCUMENT_HISTORY_LIMIT);
    expect(readDocumentHistory(null)).toEqual({ rows: [], older: false });
  });
});

describe("visibleDocumentHistory", () => {
  it("shows three and counts the rest behind one control", () => {
    const view = visibleDocumentHistory(commits(5), false, false);
    expect(view.shown).toHaveLength(3);
    expect(view).toMatchObject({ hidden: 2, showToggle: true, showOlderNote: false });
  });

  it("offers fewer once expanded and notes older steps only then", () => {
    const view = visibleDocumentHistory(commits(5), true, true);
    expect(view.shown).toHaveLength(5);
    expect(view).toMatchObject({ hidden: 0, showToggle: true, showOlderNote: true });
  });

  it("has no control for a short list, and notes older steps right away", () => {
    expect(visibleDocumentHistory(commits(3), false, true)).toMatchObject({
      hidden: 0,
      showToggle: false,
      showOlderNote: true,
    });
  });
});

describe("motionDurationMs", () => {
  it("reads seconds and milliseconds and falls back when the token is unreadable", () => {
    expect(motionDurationMs(" .12s ")).toBe(120);
    expect(motionDurationMs("150ms")).toBe(150);
    expect(motionDurationMs("")).toBe(120);
  });
});
