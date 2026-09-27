"use client";

import { useEffect, useMemo, useState } from "react";

import { gitHistory, isGitBridgeAvailable } from "@/shared/lib/tauri-git";
import type { VaultDoc } from "@/entities/docs-vault";

import {
  countVaultPaths,
  replayVaultHistory,
  vaultHistoryPeak,
  weeklyVaultHistory,
  VAULT_HISTORY_RULES_VERSION,
  type VaultHistoryWeek,
  type VaultLayerCounts,
} from "./vault-history";

/**
 * Where the weekly counts come from: one Git read on demand, held while the screen is open and never written,
 * so the series stays derived. The arithmetic is `vault-history.ts`. States: `unavailable` (no Git bridge, the
 * web), `none` (no commits; distinct from a series of zeroes), `failed` (the bridge threw; distinct from `none`,
 * since an error and an absence must look different), and `ready` (weeks, each naming its commit).
 */
export type VaultHistoryState = {
  /**
   * What the folder holds now, counted from paths by the past's rule. Present in every status, because it needs no
   * history; only the time axis waits for Git.
   */
  present: VaultLayerCounts;
} & (
  | { status: "loading" | "unavailable" | "none" | "failed" }
  | {
      status: "ready";
      weeks: VaultHistoryWeek[];
      peak: number;
      /** Stamped so an old picture is never silently redrawn by new counting rules. */
      rulesVersion: number;
    }
);

/**
 * How far back to ask: a year of work still shows its shape, and every commit costs a row over IPC. The rewind is
 * exact for any window and simply starts later, so this trades reach for time, never accuracy.
 */
const HISTORY_COMMIT_LIMIT = 1500;

export function useVaultHistory(
  vaultPath: string | null,
  docs: readonly VaultDoc[] | undefined,
  /** Raw source files carry no `kind:` and are counted by path like everything else. */
  sourcePaths: readonly string[] | undefined,
): VaultHistoryState {
  // Only the fetched answer is state; bridge and folder availability are facts of this render.
  const reachable = Boolean(vaultPath) && isGitBridgeAvailable();
  const [fetched, setFetched] = useState<VaultHistoryState | null>(null);

  // The present is counted by the past's path rule, so the newest point and the week before it agree.
  const presentKey = [
    ...(docs ?? []).map((doc) => doc.path),
    ...(sourcePaths ?? []),
  ].sort().join("\n");


  // Counted once per path set (memoised on the joined paths the effect keys on), so the series' newest point and the
  // standalone stack share one count.
  const presentCounts = useMemo(
    () => countVaultPaths(presentKey ? presentKey.split("\n") : []),
    [presentKey],
  );

  useEffect(() => {
    if (!reachable || !vaultPath) return;
    let cancelled = false;
    void (async () => {
      const commits = await gitHistory(vaultPath, HISTORY_COMMIT_LIMIT).catch(
        () => "failed" as const,
      );
      if (cancelled) return;
      if (commits === "failed") {
        setFetched({ status: "failed", present: presentCounts });
        return;
      }
      if (!commits || commits.length === 0) {
        setFetched({ status: "none", present: presentCounts });
        return;
      }
      const present = presentCounts;
      const weeks = weeklyVaultHistory(replayVaultHistory(present, commits));
      // One week is a dot, not a shape; say "no history" rather than draw one column that reads as a trend.
      if (weeks.length < 2) {
        setFetched({ status: "none", present });
        return;
      }
      setFetched({
        status: "ready",
        present,
        weeks,
        peak: vaultHistoryPeak(weeks),
        rulesVersion: VAULT_HISTORY_RULES_VERSION,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [reachable, vaultPath, presentKey, presentCounts]);

  if (!isGitBridgeAvailable()) return { status: "unavailable", present: presentCounts };
  if (!vaultPath) return { status: "none", present: presentCounts };
  return fetched ?? { status: "loading", present: presentCounts };
}
