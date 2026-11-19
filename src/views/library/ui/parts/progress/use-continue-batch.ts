"use client";

import { useCallback, useMemo, useState } from "react";

import type { LibrarySourceRow } from "@/entities/docs-vault";
import { selectCompileTargets } from "@/features/library";

/** Sources one Continue press names on the coding-agent route. */
const CONTINUE_BATCH_SIZE = 10;

/**
 * What the band's Continue press needs from the request it starts. The band reads only this, so the
 * hook behind it can change without the band changing.
 */
export interface ContinueBatch {
  /** Sources the next press would name, in list order. */
  next: readonly LibrarySourceRow[];
  /** Paths the request in flight named; empty while none runs. */
  running: ReadonlySet<string>;
  /** Waiting sources outside the next press, or outside the request in flight while one runs. */
  rest: number;
  /** Sources the last finished request named that still have no wiki page. */
  returned: number;
  start: () => void;
}

const NONE: ReadonlySet<string> = new Set();

/**
 * Names the first waiting sources in list order and remembers them while the request runs. The
 * local model's own cap (`targets`) wins on its route.
 */
export function useContinueBatch({
  sources,
  localTargets,
  running,
  send,
}: {
  sources: readonly LibrarySourceRow[];
  /** The local route's capped targets, or null on the coding-agent route. */
  localTargets: readonly string[] | null;
  /** A compile request is in flight. */
  running: boolean;
  send: (batch: readonly LibrarySourceRow[]) => void;
}): ContinueBatch {
  const waiting = useMemo(() => selectCompileTargets(sources), [sources]);
  const next = useMemo(
    () =>
      localTargets
        ? waiting.filter((row) => localTargets.includes(row.path))
        : waiting.slice(0, CONTINUE_BATCH_SIZE),
    [localTargets, waiting],
  );
  const [requested, setRequested] = useState<ReadonlySet<string>>(NONE);
  const [sawRunning, setSawRunning] = useState(false);
  if (running && requested.size > 0 && !sawRunning) setSawRunning(true);
  const finished = sawRunning && !running;
  const returned = finished ? waiting.filter((row) => requested.has(row.path)).length : 0;
  const inFlight = running && requested.size > 0 ? requested : NONE;
  const rest = inFlight.size > 0
    ? waiting.filter((row) => !inFlight.has(row.path)).length
    : waiting.length - next.length;
  const start = useCallback(() => {
    setRequested(new Set(next.map((row) => row.path)));
    setSawRunning(false);
    send(next);
  }, [next, send]);
  return { next, running: inFlight, rest, returned, start };
}
