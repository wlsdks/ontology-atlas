import { MOTION } from './tokens';

/** A pixel clip's cell time: the catalogue's play pace, six expressive beats per 24 cells. */
export const PIXEL_BEAT_MS = (MOTION.expressive.duration * 1000 * 6) / 24;

type Listener = (now: number) => void;
const listeners = new Set<Listener>();
let timer = 0;

/**
 * One timer for every pixel clip on the page: the rooms' Moru and the lobby step on the same beat,
 * so each step is one frame of the page instead of one per clock. Runs while anything listens.
 */
export function onPixelBeat(listener: Listener): () => void {
  listeners.add(listener);
  if (!timer) {
    timer = window.setInterval(() => {
      const now = performance.now();
      for (const each of [...listeners]) each(now);
    }, PIXEL_BEAT_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      window.clearInterval(timer);
      timer = 0;
    }
  };
}
