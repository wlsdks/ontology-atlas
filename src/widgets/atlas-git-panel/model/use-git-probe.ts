import { useCallback, useEffect, useEffectEvent } from "react";
import { useArrivalMemory } from "@/shared/lib/route-arrival-memory";
import { gitProbe } from "@/shared/lib/tauri-git";

export function useGitProbe(vaultPath: string | null) {
  /*
   * Whether git is installed, `null` until known; `git_probe` only tests for an executable, so
   * calling it automatically keeps the charter. Remembered like the workspace read, so a machine
   * without git does not swap screens on every arrival; unkeyed, since it is a fact about the computer.
   */
  const [gitInstalled, setGitInstalled] = useArrivalMemory<boolean | null>(
    "atlas-git-installed",
    null,
  );
  const probeGit = useCallback(async () => {
    try {
      const probe = await gitProbe();
      // No bridge (`null`) means the web path, which is not this state's call to make.
      setGitInstalled(probe === null ? null : probe.installed);
    } catch {
      /*
       * A failed probe does not mean absent: `null` keeps the normal path instead of claiming
       * git is missing, and the catch prevents an unhandled rejection.
       */
      setGitInstalled(null);
    }
  }, [setGitInstalled]);
  const applyInitialProbe = useEffectEvent((probe: Awaited<ReturnType<typeof gitProbe>>) => {
    setGitInstalled(probe === null ? null : probe.installed);
  });
  const reportInitialProbeFailure = useEffectEvent(() => {
    setGitInstalled(null);
  });
  /*
   * Only after a folder is chosen: without one no IPC is needed, and invoking git without the
   * command line tools makes macOS open its install dialog unasked.
   */
  useEffect(() => {
    if (!vaultPath) return;
    let cancelled = false;
    void gitProbe()
      .then((probe) => {
        if (!cancelled) applyInitialProbe(probe);
      })
      .catch(() => {
        if (!cancelled) reportInitialProbeFailure();
      });
    return () => {
      cancelled = true;
    };
  }, [vaultPath]);
  return { gitInstalled, probeGit };
}
