"use client";

import { useEffect, useState } from "react";
import { gitHistory, type GitCommitInfo } from "@/shared/lib/git/tauri-git";
import { DOCUMENT_HISTORY_LIMIT, readDocumentHistory } from "../lib/document-history-window";

/** The steps that changed one document, read from git scoped to its path; `rows` is `null` until read. */
export function useDocumentHistoryRows(
  vaultPath: string | null,
  path: string,
): { rows: GitCommitInfo[] | null; older: boolean } {
  const [rows, setRows] = useState<GitCommitInfo[] | null>(null);
  const [older, setOlder] = useState(false);
  useEffect(() => {
    if (!vaultPath) return;
    let cancelled = false;
    void gitHistory(vaultPath, DOCUMENT_HISTORY_LIMIT + 1, path)
      .then((result) => {
        if (cancelled) return;
        const read = readDocumentHistory(result);
        setOlder(read.older);
        setRows(read.rows);
      })
      // A failed read shows nothing rather than a wrong list; the main list still has every step.
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [vaultPath, path]);
  return { rows, older };
}
