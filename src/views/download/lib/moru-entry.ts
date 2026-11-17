import companion from '@/shared/ui/marks/moru-companion.json';
import reactions from '@/shared/ui/marks/moru-reactions.json';

/**
 * The 64px rows `pnpm brand:sprites` writes to `public/brand/` (24 cells each), drawn for that size
 * rather than reduced from the 128px cell; each starts and ends on the shared neutral pose.
 */
export const ENTRY_ROWS = {
  wave: '/brand/mascot-greeting-row.png',
  blink: '/brand/mascot-waiting-row.png',
  dance: '/brand/mascot-success-row.png',
} as const;
export type EntryRow = keyof typeof ENTRY_ROWS;
export const ENTRY_CELL = 64;

/** One row and the catalogue timing of its clip, one duration per cell. */
export interface EntryClip {
  row: EntryRow;
  durations: number[];
}

/**
 * One wave to say hello, then the blink over and over: its eyes close for under a second between
 * long rests, so a reaction never waits long for the neutral pose.
 */
export const ENTRY_IDLE: readonly EntryClip[] = [
  { row: 'wave', durations: companion.clips.wave.durationsMs },
  { row: 'blink', durations: companion.clips.blink.durationsMs },
];
const LOOP = 1;
/** The dance answers at once: its catalogue rests (0.8s before, 1.2s after) shrink as `clipTimeline` does. */
export const ENTRY_REACTION: EntryClip = {
  row: 'dance',
  durations: reactions.clips.dance.durationsMs.map((ms, i, all) => (i === 0 ? 120 : i === all.length - 1 ? 240 : ms)),
};

/** A row and the cell in it. */
export interface EntryPose {
  row: EntryRow;
  cell: number;
}
export const ENTRY_NEUTRAL: EntryPose = { row: 'blink', cell: 0 };

export interface EntryState {
  /** Index into `ENTRY_IDLE` (0, the greeting, plays once), or -1 while the reaction plays. */
  idle: number;
  elapsed: number;
  /** A hover or focus asked for the reaction; it starts on the next neutral pose. */
  wants: boolean;
}

export const ENTRY_START: EntryState = { idle: 0, elapsed: 0, wants: false };

const clipOf = (state: EntryState) => (state.idle < 0 ? ENTRY_REACTION : ENTRY_IDLE[state.idle]);

function cellAt(line: EntryClip, elapsed: number): { index: number; done: boolean } {
  let at = elapsed;
  for (let i = 0; i < line.durations.length; i += 1) {
    if (at < line.durations[i]) return { index: i, done: false };
    at -= line.durations[i];
  }
  return { index: line.durations.length - 1, done: true };
}

/** Asks for the reaction unless it is already playing: a pass is never cut short to restart it. */
export function requestReaction(state: EntryState): EntryState {
  return state.idle < 0 ? state : { ...state, wants: true };
}

/**
 * Advances the tiny Moru by `dtMs`. The reaction begins only on a neutral cell (a clip's first or
 * last), so the switch never jumps a pose; afterwards Moru goes back to blinking.
 */
export function stepEntry(state: EntryState, dtMs: number): { state: EntryState; pose: EntryPose } {
  let next = { ...state, elapsed: state.elapsed + Math.max(0, dtMs) };
  let line = clipOf(next);
  let cell = cellAt(line, next.elapsed);
  if (next.wants && next.idle >= 0 && (cell.index === 0 || cell.index === line.durations.length - 1)) {
    next = { idle: -1, elapsed: 0, wants: false };
    line = ENTRY_REACTION;
    cell = cellAt(line, 0);
  } else if (cell.done) {
    const overshoot = next.elapsed - line.durations.reduce((a, b) => a + b, 0);
    next = next.wants
      ? { idle: -1, elapsed: overshoot, wants: false }
      : { idle: LOOP, elapsed: overshoot, wants: false };
    line = clipOf(next);
    cell = cellAt(line, next.elapsed);
  }
  return { state: next, pose: { row: line.row, cell: cell.index } };
}
