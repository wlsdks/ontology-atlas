import { useCallback, useState } from "react";
import type { NativeErrorLookup } from "@/shared/lib/desktop-shell/native-error";
import { gitErrorMessage, gitFetch, gitPull, gitPushOnly, gitSetRemote } from "@/shared/lib/git/tauri-git";
import type { GitRemoteState, RemoteAction } from "../lib/remote-state";
import type { Translator } from "../lib/translator";

export function useGitRemote({
  vaultPath,
  t,
  refresh,
  nativeErrors,
  hasChanges,
  setConfirming,
  setPushOptIn,
  remoteState,
  currentBranch,
  headHash,
  upstream,
  setOriginJustSaved,
}: {
  vaultPath: string | null;
  t: Translator;
  refresh: () => Promise<void>;
  nativeErrors: NativeErrorLookup;
  hasChanges: boolean;
  setConfirming: (open: boolean) => void;
  setPushOptIn: (optIn: boolean) => void;
  remoteState: GitRemoteState;
  currentBranch: string;
  headHash: string | null;
  upstream: string | null;
  setOriginJustSaved: (saved: boolean) => void;
}) {
  /**
   * Turns a `git_fetch` code into the reader's language with `ahead`/`behind` filled in; any
   * other summary, which is git's own output, passes through.
   */
  const remoteSummary = useCallback(
    (summary: string, ahead: number | null, behind: number | null) => {
      if (summary === "remote-no-upstream") return t("summaryNoUpstream");
      if (summary === "remote-in-sync") return t("summaryInSync");
      if (summary === "remote-diverged")
        return t("summaryDiverged", { ahead: ahead ?? 0, behind: behind ?? 0 });
      return summary;
    },
    [t],
  );
  /** The remote input — opened only from the location line's button; it never sits there as a card. */
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteRunning, setRemoteRunning] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteNotice, setRemoteNotice] = useState<string | null>(null);
  /*
   * Fetch, Pull and Push, each only after an explicit click (trust charter); Push also sends
   * existing commits when there is nothing to record.
   */
  const [remoteBusy, setRemoteBusy] = useState<null | RemoteAction>(null);
  const [remoteActionNotice, setRemoteActionNotice] = useState<string | null>(null);
  const [remoteActionError, setRemoteActionError] = useState<string | null>(null);

  const runRemote = useCallback(
    async (kind: RemoteAction) => {
      if (!vaultPath) return;
      /* Changes already visible require the existing commit confirmation. */
      if (kind === "push" && hasChanges) {
        setPushOptIn(true);
        setConfirming(true);
        return;
      }
      setRemoteBusy(kind);
      setRemoteActionError(null);
      setRemoteActionNotice(null);
      let notice: string | null = null;
      let failure: string | null = null;
      try {
        if (kind === "fetch") {
          const r = await gitFetch(vaultPath);
          if (r) notice = t("remoteDoneFetch", { summary: remoteSummary(r.summary, r.ahead, r.behind) });
        } else if (kind === "pull") {
          const r = await gitPull(vaultPath);
          if (r) notice = t("remoteDonePull", { summary: r.summary });
        } else {
          /* The native push-only path cannot record changes that appeared after this read. */
          const firstSend = remoteState === "never-sent";
          if (!currentBranch || !headHash) throw "push-state-changed";
          const r = await gitPushOnly(vaultPath, currentBranch, headHash, upstream, firstSend);
          if (r?.pushed && !r.upstreamSet && r.message) failure = gitErrorMessage(r.message, nativeErrors);
          else if (r?.pushed)
            notice = firstSend
              ? t("remoteDoneFirstSend", { branch: currentBranch })
              : t("remoteDonePush");
          // The reason first, in the reader's language; the bare git command is the
          // fallback for a push failure Rust had no code for.
          else if (r?.message) failure = gitErrorMessage(r.message, nativeErrors);
          else if (r?.guidance) failure = r.guidance;
        }
        /* Announced after the re-read, so the notice never stands beside stale counts. */
        await refresh();
      } catch (err) {
        failure = gitErrorMessage(err, nativeErrors);
        // A stale branch or folder is actionable only after its status is read again.
        await refresh();
      } finally {
        setRemoteActionNotice(notice);
        setRemoteActionError(failure);
        setRemoteBusy(null);
      }
    },
    [vaultPath, refresh, t, nativeErrors, remoteSummary, hasChanges, setConfirming, setPushOptIn, remoteState, currentBranch, headHash, upstream],
  );

  /** Register a remote: stores the address and never sends; sending is its own press. */
  const submitRemote = useCallback(async () => {
    if (!vaultPath) return;
    setRemoteRunning(true);
    setRemoteError(null);
    setRemoteNotice(null);
    let saved = false;
    try {
      const result = await gitSetRemote(vaultPath, remoteUrl);
      if (result) {
        /*
         * With `origin` saved the form closes and the result speaks from the remote-action line,
         * beside the first send that is now the next step.
         */
        const savedNotice = result.replaced
          ? t("remoteReplaced", { previous: result.replaced })
          : t("remoteSaved");
        setRemoteUrl("");
        setRemoteOpen(false);
        setRemoteActionError(null);
        setRemoteActionNotice(savedNotice);
        setOriginJustSaved(true);
        saved = true;
      }
    } catch (err) {
      setRemoteError(gitErrorMessage(err, nativeErrors));
    } finally {
      // The press ends when git answers, not after the re-read below.
      setRemoteRunning(false);
    }
    if (!saved) return;
    await refresh();
    setOriginJustSaved(false);
  }, [vaultPath, remoteUrl, refresh, t, nativeErrors, setOriginJustSaved]);

  return {
    remoteOpen,
    setRemoteOpen,
    remoteUrl,
    setRemoteUrl,
    remoteRunning,
    remoteError,
    remoteNotice,
    remoteBusy,
    remoteActionNotice,
    remoteActionError,
    runRemote,
    submitRemote,
  };
}
