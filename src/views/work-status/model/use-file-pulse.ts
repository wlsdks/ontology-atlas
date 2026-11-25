import { useEffect, useRef, useState } from 'react';
import { nextFlashes, type FlashMark } from '@/shared/lib/work-status/signals/pulse';
import { pauseFilePulse, readFilePulse, setFilePulseRead, type WorktreePulse } from '@/shared/lib/work-status/tauri-work-status';

/** How often the visible screen asks; Rust answers from memory, so every notice in between arrives in one answer. */
export const PULSE_ASK_MS = 2000;

/** `off`: the person stopped the pulse. `unsupported`: this system has none, and nothing says so. */
export type FilePulseStatus = 'off' | 'pending' | 'read' | 'unsupported';

export interface FilePulseState {
  status: FilePulseStatus;
  worktrees: ReadonlyMap<string, WorktreePulse>;
  /** Each room's light: its `count` rises once per answer that carries a new counted change. */
  flashes: ReadonlyMap<string, FlashMark>;
}

const NO_PULSES: ReadonlyMap<string, WorktreePulse> = new Map();
const NO_FLASHES: ReadonlyMap<string, FlashMark> = new Map();
const NOT_ASKED: FilePulseState & { root: string | null } = { root: null, status: 'pending', worktrees: NO_PULSES, flashes: NO_FLASHES };
const OFF: FilePulseState = { status: 'off', worktrees: NO_PULSES, flashes: NO_FLASHES };
const PENDING: FilePulseState = { status: 'pending', worktrees: NO_PULSES, flashes: NO_FLASHES };

const samePulse = (a: WorktreePulse, b: WorktreePulse) =>
  a.watched === b.watched
  && a.lastChangeAtMs === b.lastChangeAtMs
  && a.steps.length === b.steps.length
  && a.steps.every((step, index) => step.atMs === b.steps[index].atMs && step.count === b.steps[index].count);

/** The answer as a map, or the map already held when no room's pulse changed. O(rooms * steps). */
function pulsesOf(held: ReadonlyMap<string, WorktreePulse>, answer: Record<string, WorktreePulse>): ReadonlyMap<string, WorktreePulse> {
  const entries = Object.entries(answer);
  const same = entries.length === held.size && entries.every(([key, pulse]) => {
    const kept = held.get(key);
    return kept !== undefined && samePulse(kept, pulse);
  });
  return same ? held : new Map(entries);
}

/**
 * The counted file changes of the worktrees drawn as rooms, asked every two seconds while the
 * screen is visible and the pulse is on. Hidden or closed, Rust is told to end its watcher and
 * keeps the counts; switched off, Rust drops them too, and so does this screen. An answer that
 * lands after either is dropped.
 */
export function useFilePulse(root: string | null, worktreeIds: readonly string[], enabled: boolean): FilePulseState {
  const [state, setState] = useState(NOT_ASKED);
  const wanted = useRef(worktreeIds);
  useEffect(() => {
    wanted.current = worktreeIds;
  }, [worktreeIds]);

  useEffect(() => {
    if (!enabled) void setFilePulseRead(false).catch(() => undefined);
  }, [enabled]);

  useEffect(() => {
    if (!root || !enabled) return;
    let cancelled = false;
    let asking = false;
    let timer: number | undefined;
    const visible = () => document.visibilityState === 'visible';

    const ask = async () => {
      timer = undefined;
      if (!visible()) return;
      asking = true;
      const answer = await readFilePulse(root, wanted.current).catch(() => undefined);
      asking = false;
      if (cancelled) return;
      if (answer === null) {
        setState({ root, status: 'unsupported', worktrees: NO_PULSES, flashes: NO_FLASHES });
        return;
      }
      if (answer) {
        const answeredAtMs = Date.now();
        setState(current => {
          const held = current.root === root ? current : NOT_ASKED;
          const worktrees = pulsesOf(held.worktrees, answer.worktrees);
          const flashes = nextFlashes(held.flashes, answer, answeredAtMs);
          return held.status === 'read' && worktrees === held.worktrees && flashes === held.flashes
            ? current
            : { root, status: 'read', worktrees, flashes };
        });
      }
      if (visible()) timer = window.setTimeout(() => void ask(), PULSE_ASK_MS);
    };

    const onVisibility = () => {
      if (!visible()) {
        window.clearTimeout(timer);
        timer = undefined;
        void pauseFilePulse().catch(() => undefined);
      } else if (timer === undefined && !asking) {
        void ask();
      }
    };

    void setFilePulseRead(true)
      .catch(() => undefined)
      .then(() => {
        if (!cancelled && timer === undefined && !asking) void ask();
      });
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      void pauseFilePulse().catch(() => undefined);
      setState(NOT_ASKED);
    };
  }, [root, enabled]);

  if (!enabled) return OFF;
  return state.root === root && root !== null ? state : PENDING;
}
