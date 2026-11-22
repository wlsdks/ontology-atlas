import { useCallback, useState } from "react";
import type { AtlasGitDiffFile } from "@/shared/lib/git/atlas-git-record";
import type { GitCommitInfo } from "@/shared/lib/git/tauri-git";
import { HISTORY_PAGE } from "./git-workspace-read";
import type { DocumentFollow } from "../lib/document-follow";

export type WorkbenchSelection = { kind: "pending" } | { kind: "commit"; hash: string };

export type FollowedStep = DocumentFollow & { hash: string };

export function useWorkbenchSelection({
  history,
  historyHasMore,
  historyShort,
  historyLimit,
  setHistoryLimit,
  setJumpHash,
  diffFiles,
  diffTooLarge,
}: {
  history: readonly GitCommitInfo[];
  historyHasMore: boolean;
  historyShort: boolean;
  historyLimit: number;
  setHistoryLimit: (next: number) => void;
  setJumpHash: (hash: string | null) => void;
  diffFiles: readonly AtlasGitDiffFile[];
  diffTooLarge: boolean;
}) {
  const [focusedConceptId, setFocusedConceptId] = useState<string | null>(null);
  /*
   * The workbench selection, instead of tabs: the list's position already separates
   * uncommitted from committed. `null` lets `selection` below decide from state.
   */
  const [selectionChoice, setSelectionChoice] = useState<WorkbenchSelection | null>(null);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  /**
   * The document a jump from its own history is following, and the step it jumped to. Only that
   * step's detail reads it (`CommitDetail`'s `follow`); any other selection ends it.
   */
  const [followed, setFollowed] = useState<FollowedStep | null>(null);
  /**
   * Jump to a step named by a document's history, reading further pages until its row exists.
   * The focused concept and the document's path go with the jump, or the step would open, and
   * aim its restore door, at its first document instead of the followed one.
   */
  const jumpToCommit = useCallback(
    (hash: string, follow: DocumentFollow) => {
      setSelectionChoice({ kind: "commit", hash });
      setFollowed({ ...follow, hash });
      if (follow.conceptId) setFocusedConceptId(follow.conceptId);
      const loaded = history.some((commit) => commit.hash === hash);
      setJumpHash(loaded ? null : hash);
      if (!loaded && historyHasMore && !historyShort) setHistoryLimit(historyLimit + HISTORY_PAGE);
    },
    [history, historyHasMore, historyShort, historyLimit, setHistoryLimit, setJumpHash],
  );
  const selectStep = useCallback((next: WorkbenchSelection) => {
    setSelectionChoice(next);
    setJumpHash(null);
    setFollowed(null);
  }, [setJumpHash]);

  /*
   * Default: uncommitted changes when they have lines to compare, else the latest commit;
   * new documents alone have none.
   */
  const selection: WorkbenchSelection =
    selectionChoice ??
    (diffFiles.length > 0 || diffTooLarge
      ? { kind: "pending" }
      : history.length > 0
        ? { kind: "commit", hash: history[0].hash }
        : { kind: "pending" });

  return {
    selection,
    selectStep,
    jumpToCommit,
    followed,
    setFollowed,
    setSelectionChoice,
    selectedPath,
    setSelectedPath,
    focusedConceptId,
    setFocusedConceptId,
  };
}
