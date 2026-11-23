import { MOTION } from './tokens';

/** A pixel clip's cell time: the catalogue's play pace, six expressive beats per 24 cells. */
export const PIXEL_BEAT_MS = (MOTION.expressive.duration * 1000 * 6) / 24;
/** The longest the beat sleeps while nothing on screen would change. */
const QUIET_BEATS = Math.round(1000 / PIXEL_BEAT_MS);

/**
 * Called on its beat with the time since its last call; returns how many beats until it next needs
 * one (1 to step every beat).
 */
type Listener = (now: number, elapsedMs: number) => number;
interface Entry { listener: Listener; left: number; since: number }

const entries = new Set<Entry>();
let timer = 0;
/** When the timer was set, and for how many beats at which pace. */
let sleptAt = 0;
let sleeping = 0;
let sleepPace = 1;

/** A window that is not the key window runs every pixel clip at half the rate. */
const pace = () => (typeof document !== 'undefined' && document.hasFocus?.() === false ? 2 : 1);

/** Counts the beats slept so far against every listener. */
function settle(beats: number) {
  for (const entry of entries) {
    entry.left -= beats;
    entry.since += beats * PIXEL_BEAT_MS * sleepPace;
  }
}

function run() {
  timer = 0;
  settle(sleeping);
  const now = performance.now();
  for (const entry of [...entries]) {
    if (entry.left > 0 || !entries.has(entry)) continue;
    entry.left = Math.max(1, Math.round(entry.listener(now, entry.since)));
    entry.since = 0;
  }
  schedule();
}

function schedule() {
  if (timer) window.clearTimeout(timer);
  timer = 0;
  if (entries.size === 0) return;
  sleeping = Math.min(QUIET_BEATS, ...[...entries].map(entry => Math.max(1, entry.left)));
  sleepPace = pace();
  sleptAt = performance.now();
  timer = window.setTimeout(run, sleeping * PIXEL_BEAT_MS * sleepPace);
}

/** Wakes the beat to plan again: a listener came, or the window's focus and so its pace changed. */
function replan() {
  if (!timer) return schedule();
  settle(Math.min(sleeping, Math.floor((performance.now() - sleptAt) / (PIXEL_BEAT_MS * sleepPace))));
  schedule();
}

/**
 * One timer for every pixel clip on the page: the rooms' Moru and the lobby step on the same beat,
 * so each step is one frame of the page instead of one per clock. It sleeps as long as every
 * listener allows, up to a second, and runs while anything listens.
 */
export function onPixelBeat(listener: Listener): () => void {
  const entry: Entry = { listener, left: 1, since: 0 };
  if (entries.size === 0) {
    window.addEventListener('focus', replan);
    window.addEventListener('blur', replan);
  }
  if (timer) settle(Math.min(sleeping, Math.floor((performance.now() - sleptAt) / (PIXEL_BEAT_MS * sleepPace))));
  entries.add(entry);
  if (timer) {
    // The beats already slept are counted; the timer starts over from here.
    sleeping = 0;
    schedule();
  } else schedule();
  return () => {
    entries.delete(entry);
    if (entries.size === 0) {
      window.clearTimeout(timer);
      timer = 0;
      window.removeEventListener('focus', replan);
      window.removeEventListener('blur', replan);
    }
  };
}
