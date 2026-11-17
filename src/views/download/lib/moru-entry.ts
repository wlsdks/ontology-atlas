import companion from '@/shared/ui/marks/moru-companion.json';

/** One companion clip as absolute sheet cells; every one starts and ends on the neutral pose. */
export interface EntryClip {
  frames: number[];
  durations: number[];
}

function clip(id: keyof typeof companion.clips): EntryClip {
  const source = companion.clips[id];
  return { frames: source.durationsMs.map((_, i) => source.firstFrame + i), durations: source.durationsMs };
}

/**
 * One wave to say hello, then the blink over and over: its eyes close for under a second between
 * long rests, so a reaction never waits long for the neutral pose.
 */
export const ENTRY_IDLE: readonly EntryClip[] = [clip('wave'), clip('blink')];
const LOOP = 1;
const hop = clip('hop');
/** The hop answers at once: its catalogue rests (1s before, 1.1s after) shrink as `clipTimeline` does. */
export const ENTRY_REACTION: EntryClip = {
  frames: hop.frames,
  durations: hop.durations.map((ms, i, all) => (i === 0 ? 120 : i === all.length - 1 ? 240 : ms)),
};
export const ENTRY_NEUTRAL_FRAME = ENTRY_IDLE[LOOP].frames[0];

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
export function stepEntry(state: EntryState, dtMs: number): { state: EntryState; frame: number } {
  let next = { ...state, elapsed: state.elapsed + Math.max(0, dtMs) };
  let line = clipOf(next);
  let cell = cellAt(line, next.elapsed);
  if (next.wants && next.idle >= 0 && (cell.index === 0 || cell.index === line.frames.length - 1)) {
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
  return { state: next, frame: line.frames[cell.index] };
}
