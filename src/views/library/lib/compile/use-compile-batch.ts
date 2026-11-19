import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { sourceNeedsCompile, type LibrarySourceRow } from "@/entities/docs-vault";
import { COMPILE_BATCH_SIZE, selectCompileBatch } from "@/features/library";

/**
 * The bounded Continue request and what came back from it. Which sources an earlier request named
 * and left without a page is session-only memory: it lives in this module, per folder, survives the
 * Library remounting, and is gone on reload. Nothing here is written to the vault or sent anywhere;
 * `begin` only returns the sources for the caller's brief.
 */

interface BatchSession {
  /** Paths the running request named, in the order sent; empty when none runs. */
  inFlight: readonly string[];
  /** True once the turn was seen running, so its end, not its start, settles the request. */
  started: boolean;
  /** Paths the last finished request named. */
  last: readonly string[];
  /** Paths earlier requests named that may still wait; they go after every other waiting source. */
  returned: ReadonlySet<string>;
}

const EMPTY_SESSION: BatchSession = { inFlight: [], started: false, last: [], returned: new Set() };
const sessions = new Map<string, BatchSession>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readSession(key: string): BatchSession {
  return sessions.get(key) ?? EMPTY_SESSION;
}

function writeSession(key: string, next: BatchSession): void {
  sessions.set(key, next);
  for (const listener of listeners) listener();
}

/** A press whose turn never ran sent nothing: its sources wait where they were. */
function abandon(key: string): void {
  const session = readSession(key);
  if (session.inFlight.length === 0 || session.started) return;
  writeSession(key, { ...session, inFlight: [], started: false });
}

function settle(key: string, sources: readonly LibrarySourceRow[]): void {
  const session = readSession(key);
  if (session.inFlight.length === 0) return;
  const waiting = new Set(sources.filter(sourceNeedsCompile).map((row) => row.path));
  // Earlier returns that since got a page drop out; this request's paths all join, because its
  // last pages may still be on their way through the folder watch.
  const returned = new Set([...session.returned].filter((path) => waiting.has(path)));
  for (const path of session.inFlight) returned.add(path);
  writeSession(key, { inFlight: [], started: false, last: session.inFlight, returned });
}

export interface UseCompileBatchArgs {
  /** The Library's rows in list order (`model.sources`). */
  sources: readonly LibrarySourceRow[];
  /** The open folder; each folder has its own returned set. Null shares one unnamed set. */
  folderKey: string | null;
  /** Sources per request: `COMPILE_BATCH_SIZE`, or the local runner's `COMPILE_SOURCES_PER_TURN`. */
  size?: number;
  /**
   * True while a Compile turn runs. Its fall back to false, after `begin`, settles the request:
   * the sources it named that still wait become returned, whether the turn completed or was stopped.
   */
  running: boolean;
}

export interface CompileBatchState {
  /** The sources the next press names. While a request runs, its sources are not among them. */
  targets: readonly LibrarySourceRow[];
  /** Waiting sources after the request: after `inFlight` while one runs, else after `targets`. */
  rest: number;
  /** Paths the running request named; empty when none runs. Their rows show the running glyph. */
  inFlight: ReadonlySet<string>;
  /** Sources the last finished request named that still wait, now last in the order; 0 while running. */
  returned: number;
  /** Call on press: marks `targets` in flight and returns them, for `buildCompileBrief({ sources })`. */
  begin: () => readonly LibrarySourceRow[];
  /**
   * For a press whose turn never started (the agent refused or threw): drops the request without
   * marking anything returned. A turn that did run is settled by `running` falling, not by this.
   */
  finish: () => void;
}

export function useCompileBatch({
  sources,
  folderKey,
  size = COMPILE_BATCH_SIZE,
  running,
}: UseCompileBatchArgs): CompileBatchState {
  const key = folderKey ?? "";
  const session = useSyncExternalStore(subscribe, () => readSession(key), () => EMPTY_SESSION);

  const inFlight = useMemo(() => new Set(session.inFlight), [session.inFlight]);
  const { batch, returned } = useMemo(() => {
    // A running request's sources are neither named again nor counted in what waits after it.
    const open = inFlight.size === 0 ? sources : sources.filter((row) => !inFlight.has(row.path));
    const last = new Set(session.last);
    let back = 0;
    for (const row of open) if (last.has(row.path) && sourceNeedsCompile(row)) back += 1;
    return { batch: selectCompileBatch(open, { size, returned: session.returned }), returned: back };
  }, [sources, size, session.returned, session.last, inFlight]);

  useEffect(() => {
    if (session.inFlight.length === 0) return;
    if (running && !session.started) writeSession(key, { ...session, started: true });
    else if (!running && session.started) settle(key, sources);
  }, [key, running, session, sources]);

  const begin = useCallback((): readonly LibrarySourceRow[] => {
    const targets = batch.targets;
    if (targets.length > 0) {
      writeSession(key, { ...readSession(key), inFlight: targets.map((row) => row.path), started: running });
    }
    return targets;
  }, [batch.targets, key, running]);

  const finish = useCallback(() => abandon(key), [key]);

  return {
    targets: batch.targets,
    rest: inFlight.size > 0 ? batch.targets.length + batch.rest : batch.rest,
    inFlight,
    returned: inFlight.size > 0 ? 0 : returned,
    begin,
    finish,
  };
}
