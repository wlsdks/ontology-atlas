import {
  gitDiff,
  gitHistory,
  gitStatus,
  type GitChangeEntry,
  type GitCommitInfo,
  type GitStatusResult,
} from "@/shared/lib/tauri-git";

export type GitWorkspaceRead = {
  status: GitStatusResult;
  changes: GitChangeEntry[];
  diffText: string;
  diffTooLarge: boolean;
  history: GitCommitInfo[];
  /** Whether git holds steps older than the ones read — the list says so instead of just stopping. */
  historyHasMore: boolean;
};

/**
 * One workspace read plus the instant it was read at, which is what the panel remembers
 * across a route change (`shared/lib/route-arrival-memory.ts`).
 */
export type GitWorkspaceMemory = {
  read: GitWorkspaceRead;
  referenceMs: number;
};

/** Steps read per page, about what one column holds at a 14-inch height. */
export const HISTORY_PAGE = 10;

/**
 * Reads one step past the limit so the list knows whether older steps exist, rather than
 * guessing from a count that happens to equal the page size.
 */
export async function readGitHistoryPage(
  vaultPath: string,
  limit: number,
): Promise<{ history: GitCommitInfo[]; historyHasMore: boolean }> {
  const rows = (await gitHistory(vaultPath, limit + 1)) ?? [];
  return { history: rows.slice(0, limit), historyHasMore: rows.length > limit };
}

export async function readGitWorkspace(
  vaultPath: string,
  historyLimit: number,
): Promise<GitWorkspaceRead | null> {
  const status = await gitStatus(vaultPath);
  if (!status) return null;
  if (!status.initialized) {
    return { status, changes: [], diffText: "", diffTooLarge: false, history: [], historyHasMore: false };
  }
  const [diff, page] = await Promise.all([gitDiff(vaultPath), readGitHistoryPage(vaultPath, historyLimit)]);
  return {
    status,
    changes: diff?.files ?? [],
    diffText: diff?.diff ?? "",
    diffTooLarge: diff?.tooLarge ?? false,
    ...page,
  };
}
