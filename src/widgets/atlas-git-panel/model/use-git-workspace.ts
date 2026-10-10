import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { useArrivalMemory } from "@/shared/lib/route-arrival-memory";
import {
  gitErrorMessage,
  type GitChangeEntry,
  type GitCommitInfo,
} from "@/shared/lib/tauri-git";
import type { NativeErrorLookup } from "@/shared/lib/native-error";
import { describeRemoteState } from "../lib/remote-state";
import {
  HISTORY_PAGE,
  readGitHistoryPage,
  readGitWorkspace,
  type GitWorkspaceMemory,
  type GitWorkspaceRead,
} from "./git-workspace-read";

/* Stable empty values, so callers' `useMemo` dependencies do not change every render. */
const NO_CHANGES: readonly GitChangeEntry[] = [];
const NO_HISTORY: readonly GitCommitInfo[] = [];

export function useGitWorkspace({
  vaultPath,
  desktop,
  nativeErrors,
}: {
  vaultPath: string | null;
  desktop: boolean;
  nativeErrors: NativeErrorLookup;
}) {
  /*
   * One workspace read remembered across route changes, so a return arrival skips the loading
   * skeleton; status, diff and history come from the same read. Keyed on the vault path;
   * `refresh()` still runs on every mount.
   */
  const [workspace, rememberWorkspace] = useArrivalMemory<GitWorkspaceMemory | null>(
    vaultPath ? `atlas-git-workspace:${vaultPath}` : null,
    null,
  );
  const status = workspace?.read.status ?? null;
  /**
   * `git_set_remote` just answered ok while the status read is in flight: the location line
   * says "never sent" from the notice's frame, and the read ends it. Kept apart from the
   * remembered read, which is one moment's facts.
   */
  const [originJustSaved, setOriginJustSaved] = useState(false);
  /** Where this branch's steps can go — decides what the header and the dock offer. */
  const remoteState = describeRemoteState(
    originJustSaved && status ? { ...status, hasOrigin: true } : status,
  );
  const currentBranch = status?.branch ?? "";
  const changes = workspace?.read.changes ?? NO_CHANGES;
  const diffText = workspace?.read.diffText ?? "";
  const diffTooLarge = workspace?.read.diffTooLarge ?? false;
  const history = workspace?.read.history ?? NO_HISTORY;
  const historyHasMore = workspace?.read.historyHasMore ?? false;
  /*
   * How many steps the person has opened. Remembered per folder like the read itself, so a
   * return trip keeps the depth rather than folding the list back to ten.
   */
  const [historyLimit, setHistoryLimit] = useArrivalMemory<number>(
    vaultPath ? `atlas-git-history-limit:${vaultPath}` : null,
    HISTORY_PAGE,
  );
  /** The depth to read at, as seen from an effect that must not re-run when it changes. */
  const currentHistoryLimit = useEffectEvent(() => historyLimit);
  const historyNowMs = workspace?.referenceMs ?? 0;
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadErrorText, setLoadErrorText] = useState<string | null>(null);

  const applyWorkspaceRead = useCallback(
    (next: GitWorkspaceRead) => {
      setLoadErrorText(null);
      rememberWorkspace({ read: next, referenceMs: Date.now() });
      setLoadState("ready");
    },
    [rememberWorkspace],
  );
  const reportWorkspaceReadFailure = useCallback((err: unknown) => {
    setLoadErrorText(gitErrorMessage(err, nativeErrors));
    setLoadState("error");
  }, [nativeErrors]);
  /*
   * Reads overlap — the watcher, a commit and a click may each start one — and git answers
   * in any order. Only the newest read may land: a status from before a commit arriving
   * after the commit's own read would put the old count back.
   */
  const readSeqRef = useRef(0);
  // Read-only queries (status/diff/history) only — a write (git_snapshot) never happens here.
  const refresh = useCallback(async () => {
    if (!vaultPath) return;
    const seq = ++readSeqRef.current;
    const limit = historyLimit;
    try {
      const next = await readGitWorkspace(vaultPath, limit);
      if (seq !== readSeqRef.current) return;
      if (next) applyWorkspaceRead(next);
    } catch (err) {
      if (seq !== readSeqRef.current) return;
      reportWorkspaceReadFailure(err);
    }
  }, [applyWorkspaceRead, historyLimit, reportWorkspaceReadFailure, vaultPath]);
  const applyInitialWorkspaceRead = useEffectEvent((next: GitWorkspaceRead) => {
    applyWorkspaceRead(next);
  });
  const reportInitialWorkspaceReadFailure = useEffectEvent((err: unknown) => {
    reportWorkspaceReadFailure(err);
  });

  useEffect(() => {
    if (!desktop || !vaultPath) return;
    let cancelled = false;
    const seq = ++readSeqRef.current;
    const limit = currentHistoryLimit();
    void readGitWorkspace(vaultPath, limit)
      .then((next) => {
        if (!cancelled && seq === readSeqRef.current && next) applyInitialWorkspaceRead(next);
      })
      .catch((err) => {
        if (!cancelled && seq === readSeqRef.current) reportInitialWorkspaceReadFailure(err);
      });
    return () => {
      cancelled = true;
    };
  }, [desktop, vaultPath]);

  /**
   * Older steps, one page at a time. The click only raises the depth; the effect below reads
   * the page. Only history is re-read — the status and the diff on screen are still true, and
   * asking for them again would only give the list a reason to blink.
   */
  const loadMoreHistory = useCallback(() => {
    setHistoryLimit(historyLimit + HISTORY_PAGE);
  }, [historyLimit, setHistoryLimit]);
  /**
   * A step a document's history named that the list has not read yet. While set, each landed
   * page is checked for it and the next page is read until it appears.
   */
  const [jumpHash, setJumpHash] = useState<string | null>(null);
  /** Lands a page on the memory **as it is then** — a status read that overlapped is kept. */
  const landHistoryPage = useEffectEvent((page: { history: GitCommitInfo[]; historyHasMore: boolean }) => {
    if (!workspace) return;
    rememberWorkspace({ read: { ...workspace.read, ...page }, referenceMs: Date.now() });
    // A jump still looking for its step reads the next page; found, or no more pages, it ends.
    if (jumpHash === null) return;
    if (page.history.some((commit) => commit.hash === jumpHash) || !page.historyHasMore) {
      setJumpHash(null);
      return;
    }
    setHistoryLimit(historyLimit + HISTORY_PAGE);
  });
  const reportHistoryPageFailure = useEffectEvent((err: unknown) => {
    reportWorkspaceReadFailure(err);
  });
  /*
   * "The list is shorter than the depth asked for, and git has more" is exactly the window in
   * which a page is being read — so it is also the button's busy state, with no second
   * variable to fall out of step.
   */
  const historyShort = Boolean(workspace) && historyHasMore && history.length < historyLimit;
  useEffect(() => {
    if (!desktop || !vaultPath || !historyShort) return;
    let cancelled = false;
    void readGitHistoryPage(vaultPath, historyLimit)
      .then((page) => {
        if (!cancelled) landHistoryPage(page);
      })
      .catch((err) => {
        if (!cancelled) reportHistoryPageFailure(err);
      });
    return () => {
      cancelled = true;
    };
  }, [desktop, vaultPath, historyLimit, historyShort]);

  return {
    status,
    remoteState,
    setOriginJustSaved,
    currentBranch,
    changes,
    diffText,
    diffTooLarge,
    history,
    historyHasMore,
    historyLimit,
    setHistoryLimit,
    historyNowMs,
    loadState,
    loadErrorText,
    refresh,
    loadMoreHistory,
    setJumpHash,
    historyShort,
  };
}
