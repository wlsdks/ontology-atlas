import { useCallback, useState } from "react";
import type { NativeErrorLookup } from "@/shared/lib/native-error";
import { gitErrorMessage, gitInit } from "@/shared/lib/tauri-git";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";

/** The setup's terminal escape; git vocabulary appears only here. */
const INIT_CLI_COMMAND = "git init";

export function useGitInit({
  vaultPath,
  refresh,
  nativeErrors,
}: {
  vaultPath: string | null;
  refresh: () => Promise<void>;
  nativeErrors: NativeErrorLookup;
}) {
  const [initRunning, setInitRunning] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  /** A copy reports success and failure (`useCopyFeedback`), since clipboard access can be denied silently. */
  const { state: initCopyState, copy: copyInitCommandText } = useCopyFeedback();
  const copyInitCommand = useCallback(
    () => void copyInitCommandText(INIT_CLI_COMMAND),
    [copyInitCommandText],
  );

  /**
   * Start recording, only from a button's onClick, never from mount, focus or refresh (trust
   * charter). Init does not chain into a commit.
   */
  const startTracking = useCallback(async () => {
    if (!vaultPath) return;
    setInitRunning(true);
    setInitError(null);
    try {
      await gitInit(vaultPath);
      await refresh();
    } catch (err) {
      setInitError(gitErrorMessage(err, nativeErrors));
    } finally {
      setInitRunning(false);
    }
  }, [vaultPath, refresh, nativeErrors]);

  return { initRunning, initError, initCopyState, copyInitCommand, startTracking };
}
