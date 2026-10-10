import { useCallback, useState } from "react";
import type { NativeErrorLookup } from "@/shared/lib/native-error";
import { gitErrorMessage, gitRestoreFile } from "@/shared/lib/tauri-git";
import type { Translator } from "../lib/translator";
import type { FollowedStep, WorkbenchSelection } from "./use-workbench-selection";

export function useGitRestore({
  vaultPath,
  t,
  refresh,
  nativeErrors,
  setSelectionChoice,
  setSelectedPath,
  setJumpHash,
  setFollowed,
}: {
  vaultPath: string | null;
  t: Translator;
  refresh: () => Promise<void>;
  nativeErrors: NativeErrorLookup;
  setSelectionChoice: (next: WorkbenchSelection | null) => void;
  setSelectedPath: (path: string | null) => void;
  setJumpHash: (hash: string | null) => void;
  setFollowed: (next: FollowedStep | null) => void;
}) {
  /**
   * Put one document back: `HEAD` discards its uncommitted changes, a hash restores that
   * commit's version as an uncommitted change. Only from a confirm button; Rust touches only
   * the named path and refuses what the vault's identity rules would not survive.
   */
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const restoreDocument = useCallback(
    async (relativePath: string, source: string, others: number): Promise<boolean> => {
      if (!vaultPath) return false;
      setRestoreBusy(true);
      setRestoreError(null);
      setRestoreNotice(null);
      try {
        const result = await gitRestoreFile(vaultPath, relativePath, source);
        const path = result?.path ?? relativePath;
        const discard = source === "HEAD";
        const done = discard ? t("discardDone", { path }) : t("restoreDone", { path });
        const rest =
          others > 0
            ? ` ${discard ? t("discardConfirmOthers", { count: others }) : t("restoreDoneOthers", { count: others })}`
            : "";
        setRestoreNotice(`${done}${rest}`);
        if (discard) {
          // A discarded document leaves the pending list; keeping it chosen would point at nothing.
          setSelectedPath(null);
        } else {
          /*
           * Show the result, as after a commit: the uncommitted row with this document chosen.
           */
          setSelectionChoice({ kind: "pending" });
          setSelectedPath(path);
          setJumpHash(null);
          setFollowed(null);
        }
        await refresh();
        return true;
      } catch (err) {
        setRestoreError(`${gitErrorMessage(err, nativeErrors)} ${t("restoreFailedSafe")}`);
        return false;
      } finally {
        setRestoreBusy(false);
      }
    },
    [vaultPath, t, refresh, nativeErrors, setSelectionChoice, setSelectedPath, setJumpHash, setFollowed],
  );

  return { restoreBusy, restoreNotice, restoreError, restoreDocument };
}
