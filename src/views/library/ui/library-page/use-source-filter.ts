import { useCallback, useEffect, useMemo, useState } from "react";

import type { LibrarySourceRow } from "@/entities/docs-vault";
import { writeLibraryIndexCollapsed } from "@/shared/lib/preferences/library-preferences";

import type { useLibraryIndexColumn } from "./use-library-index-column";

type SourceState = LibrarySourceRow["state"];

/**
 * The one source state the band's presses narrow the Sources list to. The press belongs to a folder:
 * switching folders drops it, and a state with no source left in it drops it too, so the list is
 * never filtered to nothing.
 */
export function useSourceFilter({
  sources,
  vaultScope,
  indexColumn,
  listening,
}: {
  sources: readonly LibrarySourceRow[];
  vaultScope: string;
  indexColumn: ReturnType<typeof useLibraryIndexColumn>;
  /** True while the band is on screen, the only place its Escape is meant for. */
  listening: boolean;
}) {
  const [pick, setPick] = useState<{ scope: string; state: SourceState } | null>(null);
  const { autoFolded, setAutoFolded, autoFoldDeclinedRef, indexCollapsed } = indexColumn;

  const state = useMemo(() => {
    if (!pick || pick.scope !== vaultScope) return null;
    return sources.some((row) => row.state === pick.state) ? pick.state : null;
  }, [pick, sources, vaultScope]);

  const clear = useCallback(() => setPick(null), []);
  /** A filter on a folded list changes nothing anyone can see, so every narrowing opens the list. */
  const unfold = useCallback(() => {
    if (!indexCollapsed) return;
    if (autoFolded) autoFoldDeclinedRef.current = true;
    setAutoFolded(false);
    writeLibraryIndexCollapsed(false);
  }, [autoFoldDeclinedRef, autoFolded, indexCollapsed, setAutoFolded]);
  const press = useCallback(
    (next: SourceState) => {
      if (state === next) {
        setPick(null);
        return;
      }
      setPick({ scope: vaultScope, state: next });
      unfold();
    },
    [state, unfold, vaultScope],
  );

  useEffect(() => {
    if (state === null || !listening) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      setPick(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, state]);

  return { state, press, clear, unfold };
}
