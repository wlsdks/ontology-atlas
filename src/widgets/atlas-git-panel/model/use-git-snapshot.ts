import { useCallback, useMemo, useState } from "react";
import type { NativeErrorLookup } from "@/shared/lib/native-error";
import { gitErrorMessage, gitSnapshot, type GitSnapshotResult } from "@/shared/lib/tauri-git";
import type { GitRemoteState } from "../lib/remote-state";
import type { FollowedStep, WorkbenchSelection } from "./use-workbench-selection";

export function useGitSnapshot({
  vaultPath,
  remoteState,
  refresh,
  nativeErrors,
  setSelectionChoice,
  setSelectedPath,
  setFollowed,
}: {
  vaultPath: string | null;
  remoteState: GitRemoteState;
  refresh: () => Promise<void>;
  nativeErrors: NativeErrorLookup;
  setSelectionChoice: (next: WorkbenchSelection | null) => void;
  setSelectedPath: (path: string | null) => void;
  setFollowed: (next: FollowedStep | null) => void;
}) {
  const [confirming, setConfirmingState] = useState(false);
  const [pushOptIn, setPushOptIn] = useState(false);
  /*
   * The send opt-in belongs to one opened confirm: every close resets it, or a cancelled Push
   * would turn the next plain commit into commit-and-push.
   */
  const setConfirming = useCallback((open: boolean) => {
    setConfirmingState(open);
    if (!open) setPushOptIn(false);
  }, []);
  const [snapshotting, setSnapshotting] = useState(false);
  const [snapshotResult, setSnapshotResult] = useState<GitSnapshotResult | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  /** A save that was asked to send and did not: git's reason, in the reader's language. */
  const snapshotPushFailure = useMemo(() => {
    const push = snapshotResult?.push;
    if (!push || push.pushed) return null;
    return push.message ? gitErrorMessage(push.message, nativeErrors) : push.guidance;
  }, [snapshotResult, nativeErrors]);

  /**
   * A commit subject the user wrote, so history can say why; an empty string means the
   * automatic subject, as `git_snapshot(message: Option<String>)` expects.
   */
  const [snapshotMessage, setSnapshotMessage] = useState("");

  const confirmSnapshot = useCallback(async () => {
    if (!vaultPath) return;
    setSnapshotting(true);
    setSnapshotError(null);
    try {
      const trimmed = snapshotMessage.trim();
      const result = await gitSnapshot(vaultPath, {
        push: pushOptIn,
        // Ticked on a branch `origin` has never seen, the send is its first: the hint beside
        // the tick says so, and it records where this branch goes from now on.
        ...(pushOptIn && remoteState === "never-sent" ? { setUpstream: true } : {}),
        ...(trimmed ? { message: trimmed } : {}),
      });
      setSnapshotResult(result);
      setConfirming(false);
      setSnapshotMessage("");
      /*
       * After a commit the default selection shows its result: the remaining changes, else the
       * new commit.
       */
      setSelectionChoice(null);
      setSelectedPath(null);
      setFollowed(null);
      await refresh();
    } catch (err) {
      setSnapshotError(gitErrorMessage(err, nativeErrors));
    } finally {
      setSnapshotting(false);
    }
  }, [
    vaultPath,
    pushOptIn,
    remoteState,
    snapshotMessage,
    refresh,
    nativeErrors,
    setConfirming,
    setSelectionChoice,
    setSelectedPath,
    setFollowed,
  ]);

  return {
    confirming,
    setConfirming,
    pushOptIn,
    setPushOptIn,
    snapshotting,
    snapshotResult,
    snapshotError,
    snapshotPushFailure,
    snapshotMessage,
    setSnapshotMessage,
    confirmSnapshot,
  };
}
