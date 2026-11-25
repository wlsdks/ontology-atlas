import { useEffect, useRef, useState } from 'react';
import { NO_PRESSURE, nextPressure, type LoadPressure } from '@/shared/lib/work-status/signals/load';
import { readLoad, setLoadRead, type LoadRead } from '@/shared/lib/work-status/tauri-work-status';

/** One sample in this long while the screen is visible and load is on, counted from the last answer. */
export const LOAD_SAMPLE_MS = 5000;

/**
 * `failed`: the last sample failed, so no number stands and the header warns of nothing.
 * `unsupported`: this system has no load read, and nothing says so.
 */
export type LoadStatus = 'off' | 'pending' | 'read' | 'failed' | 'unsupported';

export interface WorktreeLoadState {
  status: LoadStatus;
  /** The last good sample; `null` unless `status` is `read`. */
  sample: LoadRead | null;
  pressure: LoadPressure;
}

/** Null answers in a row, each after telling Rust "on" again, before the screen says nothing. */
const NULLS_BEFORE_UNSUPPORTED = 3;

const NOT_ASKED: WorktreeLoadState & { root: string | null } = { root: null, status: 'pending', sample: null, pressure: NO_PRESSURE };
const OFF: WorktreeLoadState = { status: 'off', sample: null, pressure: NO_PRESSURE };
const PENDING: WorktreeLoadState = { status: 'pending', sample: null, pressure: NO_PRESSURE };
const NO_PIDS: readonly number[] = [];

/**
 * Memory, CPU and GPU use for each room, each session in `sessionPids` and this Mac, sampled while
 * the screen is visible and load is on; one sample at a time, the next five seconds after the last
 * answer. Hidden, closed or switched off, Rust is told and drops its previous sample, so the first
 * sample after carries no CPU figure. An answer that lands after that is dropped. A new set of
 * pids rides the next ask and starts no sample of its own.
 */
export function useWorktreeLoad(root: string | null, enabled: boolean, sessionPids: readonly number[] = NO_PIDS): WorktreeLoadState {
  const [state, setState] = useState(NOT_ASKED);
  const pids = useRef(sessionPids);
  useEffect(() => {
    pids.current = sessionPids;
  }, [sessionPids]);

  useEffect(() => {
    if (!enabled) void setLoadRead(false).catch(() => undefined);
  }, [enabled]);

  useEffect(() => {
    if (!root || !enabled) return;
    let cancelled = false;
    /** Starting or sampling: two samples never run together. */
    let busy = false;
    /** Rust last heard "on" from this screen; hiding tells it "off". */
    let toldOn = false;
    let nullsInARow = 0;
    let timer: number | undefined;
    const visible = () => document.visibilityState === 'visible';

    const sample = async () => {
      timer = undefined;
      if (!visible() || cancelled) return;
      if (!toldOn) {
        // Rust refuses a sample while it holds "off", so it hears "on" first.
        toldOn = true;
        await setLoadRead(true).catch(() => undefined);
        if (!visible() || cancelled) return;
      }
      const answer = await readLoad(root, pids.current).catch(() => undefined);
      if (cancelled) return;
      if (answer === null) {
        // Off or busy in Rust answers null too; only a run of nulls means this system has none.
        nullsInARow += 1;
        if (nullsInARow >= NULLS_BEFORE_UNSUPPORTED) {
          setState({ root, status: 'unsupported', sample: null, pressure: NO_PRESSURE });
          return;
        }
        toldOn = false;
        if (visible()) timer = window.setTimeout(() => void run(sample), LOAD_SAMPLE_MS);
        return;
      }
      nullsInARow = 0;
      const read: LoadRead = answer ?? { status: 'failed', worktrees: {}, outside: [], sessions: {}, mac: null };
      setState(current => {
        const pressure = nextPressure(current.root === root ? current.pressure : NO_PRESSURE, read);
        return read.status === 'read'
          ? { root, status: 'read', sample: read, pressure }
          : { root, status: 'failed', sample: null, pressure };
      });
      if (visible()) timer = window.setTimeout(() => void run(sample), LOAD_SAMPLE_MS);
    };

    const run = async (step: () => Promise<void>) => {
      if (busy) return;
      busy = true;
      try {
        await step();
      } finally {
        busy = false;
      }
    };

    const onVisibility = () => {
      if (!visible()) {
        window.clearTimeout(timer);
        timer = undefined;
        toldOn = false;
        void setLoadRead(false).catch(() => undefined);
      } else if (timer === undefined) {
        void run(sample);
      }
    };

    if (visible()) void run(sample);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      void setLoadRead(false).catch(() => undefined);
      setState(NOT_ASKED);
    };
  }, [root, enabled]);

  if (!enabled) return OFF;
  return state.root === root && root !== null ? state : PENDING;
}
