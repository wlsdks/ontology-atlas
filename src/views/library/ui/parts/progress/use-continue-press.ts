"use client";

import { useCallback, useMemo } from "react";

import type { LibrarySourceRow } from "@/entities/docs-vault";

import { useCompileBatch, type CompileBatchState } from "../../../lib/compile/use-compile-batch";
import type { ContinueBatch } from "./SourceProgressBand";

/**
 * The one Compile press every door shares: it names the next batch, marks it in flight and hands
 * exactly those sources to `send`, which builds and starts the request. A `send` that could not
 * start (it returns false) settles the batch at once, so its rows do not stay running.
 */
export function useContinuePress({
  sources,
  folderKey,
  size,
  running,
  send,
}: {
  sources: readonly LibrarySourceRow[];
  folderKey: string | null;
  size?: number;
  running: boolean;
  send: (batch: readonly LibrarySourceRow[]) => boolean;
}): { compileBatch: CompileBatchState; continueBatch: ContinueBatch; press: () => void } {
  const compileBatch = useCompileBatch({ sources, folderKey, size, running });
  const { begin, finish, targets, inFlight, rest, returned } = compileBatch;
  const press = useCallback(() => {
    const batch = begin();
    if (batch.length > 0 && !send(batch)) finish();
  }, [begin, finish, send]);
  const continueBatch = useMemo(
    () => ({ next: targets, running: inFlight, rest, returned, start: press }),
    [inFlight, press, rest, returned, targets],
  );
  return { compileBatch, continueBatch, press };
}
