"use client";

import { useCallback, useMemo } from "react";

import type { LibrarySourceRow } from "@/entities/docs-vault";

import { useCompileBatch, type CompileBatchState } from "../../lib/compile/use-compile-batch";
import type { ContinueBatch } from "./continue-batch";

/**
 * The one Compile press every door shares: `press` picks the next batch, `pressFor` takes the
 * sources a door names; either marks them in flight and hands exactly those to `send`, which builds
 * and starts the request. A `send` that could not start (it returns false) drops the batch at once,
 * so its rows do not stay running.
 */
export function useContinuePress({
  sources,
  folderKey,
  size,
  running,
  shown,
  eligible,
  send,
}: {
  sources: readonly LibrarySourceRow[];
  folderKey: string | null;
  size?: number;
  running: boolean;
  /** Whether the band or the Compile popover draws the batch; while neither does, nothing is picked. */
  shown?: boolean;
  eligible?: (row: LibrarySourceRow) => boolean;
  send: (batch: readonly LibrarySourceRow[]) => boolean;
}): {
  compileBatch: CompileBatchState;
  continueBatch: ContinueBatch;
  press: () => void;
  pressFor: (rows: readonly LibrarySourceRow[]) => void;
} {
  const compileBatch = useCompileBatch({ sources, folderKey, size, running, shown, eligible });
  const { begin, finish, targets, inFlight, rest, returned } = compileBatch;
  const pressFor = useCallback(
    (rows?: readonly LibrarySourceRow[]) => {
      const batch = begin(rows);
      if (batch.length > 0 && !send(batch)) finish();
    },
    [begin, finish, send],
  );
  const press = useCallback(() => pressFor(), [pressFor]);
  const continueBatch = useMemo(
    () => ({ next: targets, running: inFlight, rest, returned, start: press }),
    [inFlight, press, rest, returned, targets],
  );
  return { compileBatch, continueBatch, press, pressFor };
}
