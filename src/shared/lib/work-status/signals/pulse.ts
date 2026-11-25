import type { FilePulseRead, WorktreePulse } from '../tauri-work-status';

/** Rust counts changes in steps of this length; a tick on the last-hour line is one step. */
export const PULSE_STEP_MS = 10_000;
export const PULSE_HOUR_MS = 60 * 60_000;
/** A change this recent is "just now": the bezel says so and the wall facts count it. */
export const PULSE_RECENT_MS = 60_000;
/** A room's light flashes at most once in this long, however often changes arrive. */
export const FLASH_MIN_GAP_MS = 2000;

/** A tick's height on the last-hour line: 1 change, 2 to 5, 6 or more. */
export type TickHeight = 1 | 2 | 3;

export interface PulseTick {
  atMs: number;
  height: TickHeight;
}

export function tickHeightOf(count: number): TickHeight {
  if (count >= 6) return 3;
  return count >= 2 ? 2 : 1;
}

/** What a room says of its counted file changes at `nowMs`. */
export interface PulseFacts {
  watched: boolean;
  lastChangeAtMs: number | null;
  /** The last change is under a minute old: `monitor.lastChangeNow`. */
  changedJustNow: boolean;
  /** `pulse.lastMinute`: changes in steps that end within the last minute. */
  lastMinute: number;
  /** `pulse.lastHour`. */
  lastHour: number;
  ticks: PulseTick[];
}

/** O(steps). A step counts for a window while any part of it lies inside. */
export function pulseFactsOf(pulse: WorktreePulse, nowMs: number): PulseFacts {
  const inHour = pulse.steps.filter(step => step.count > 0 && step.atMs + PULSE_STEP_MS > nowMs - PULSE_HOUR_MS);
  const sum = (steps: typeof inHour) => steps.reduce((total, step) => total + step.count, 0);
  return {
    watched: pulse.watched,
    lastChangeAtMs: pulse.lastChangeAtMs,
    changedJustNow: pulse.lastChangeAtMs !== null && nowMs - pulse.lastChangeAtMs < PULSE_RECENT_MS,
    lastMinute: sum(inHour.filter(step => step.atMs + PULSE_STEP_MS > nowMs - PULSE_RECENT_MS)),
    lastHour: sum(inHour),
    ticks: inHour.map(step => ({ atMs: step.atMs, height: tickHeightOf(step.count) })),
  };
}

/** `pulse.noAgent`: files change in a room where Atlas sees no agent program at work. */
export function changesWithoutAgent(facts: PulseFacts, running: boolean): boolean {
  return !running && facts.changedJustNow;
}

/** One room's light: `count` rises once per answer that carries a new counted change. */
export interface FlashMark {
  count: number;
  lastChangeAtMs: number | null;
  flashedAtMs: number | null;
}

/**
 * Each room's flash after one answer. The first answer that carries a room only sets where it
 * stands, so changes from before the screen opened or the room appeared never flash. A room flashes
 * when its last change is newer than the answer before said, and no sooner than two seconds after
 * its last flash. The previous map comes back when no mark moved. O(rooms).
 */
export function nextFlashes(previous: ReadonlyMap<string, FlashMark>, answer: FilePulseRead, answeredAtMs: number): ReadonlyMap<string, FlashMark> {
  const next = new Map<string, FlashMark>();
  let changed = Object.keys(answer.worktrees).length !== previous.size;
  for (const [key, pulse] of Object.entries(answer.worktrees)) {
    const mark = previous.get(key);
    if (!mark) {
      changed = true;
      next.set(key, { count: 0, lastChangeAtMs: pulse.lastChangeAtMs, flashedAtMs: null });
      continue;
    }
    const newer = pulse.lastChangeAtMs !== null && (mark.lastChangeAtMs === null || pulse.lastChangeAtMs > mark.lastChangeAtMs);
    const rested = mark.flashedAtMs === null || answeredAtMs - mark.flashedAtMs >= FLASH_MIN_GAP_MS;
    // A change held back by the gap keeps the old mark, so the first answer after the gap flashes for it.
    if (newer && rested) {
      changed = true;
      next.set(key, { count: mark.count + 1, lastChangeAtMs: pulse.lastChangeAtMs, flashedAtMs: answeredAtMs });
    } else {
      next.set(key, mark);
    }
  }
  return changed ? next : previous;
}

/**
 * The last sign of work in each worktree: the later of a running program seen by a read and a
 * counted change. A counted change keeps a held room from dozing; it promotes no room.
 */
export function withChangeSigns(seenRunningAt: ReadonlyMap<string, number>, pulses: ReadonlyMap<string, WorktreePulse>): ReadonlyMap<string, number> {
  let merged: Map<string, number> | null = null;
  for (const [key, pulse] of pulses) {
    if (pulse.lastChangeAtMs === null || pulse.lastChangeAtMs <= (seenRunningAt.get(key) ?? -Infinity)) continue;
    merged ??= new Map(seenRunningAt);
    merged.set(key, pulse.lastChangeAtMs);
  }
  return merged ?? seenRunningAt;
}
