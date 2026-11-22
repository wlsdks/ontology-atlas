"use client";

import { useEffect, useMemo, useState } from "react";
import { gitCommitDiff } from "@/shared/lib/git/tauri-git";
import { parseUnifiedDiff, type AtlasGitDiffFile } from "@/shared/lib/git/atlas-git-record";

/**
 * Reads one commit's patch. `diff` stays `null` while reading, so a caller can tell "not read yet"
 * from "read and empty"; the patch is parsed once, as the reader's fallback when the whole
 * document cannot be read at this commit (the web, a stub, a refused `git show`).
 */
export function useCommitDiff(
  vaultPath: string | null,
  hash: string,
): { diff: string | null; tooLarge: boolean; perFile: AtlasGitDiffFile[] } {
  const [diff, setDiff] = useState<string | null>(null);
  const [tooLarge, setTooLarge] = useState(false);

  // The parent keys the detail by vault, hash and concept count, so a new step starts with fresh
  // state and needs no effect reset.
  useEffect(() => {
    if (!vaultPath) return;
    let cancelled = false;
    void gitCommitDiff(vaultPath, hash)
      .then((result) => {
        if (cancelled) return;
        setDiff(result?.diff ?? "");
        setTooLarge(result?.tooLarge ?? false);
      })
      .catch(() => {
        if (!cancelled) setDiff("");
      });
    return () => {
      cancelled = true;
    };
  }, [vaultPath, hash]);

  const perFile = useMemo(() => parseUnifiedDiff(diff ?? ""), [diff]);
  return { diff, tooLarge, perFile };
}
