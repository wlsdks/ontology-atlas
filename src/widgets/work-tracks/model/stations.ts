import type { TrackStation } from '@/shared/lib/work-status/work-tracks';

/**
 * The shared ruler, as fractions of the track area right of the label column. This Mac's stations
 * sit left of the push seam and the server's right of it; slice 1 places heads only on `start`,
 * `working` and `main`, and draws the rest so a row's path reads before its later stations exist.
 */
export const RULER = [
  { id: 'working', x: 0.13, side: 'mac' },
  { id: 'checks', x: 0.27, side: 'mac' },
  { id: 'prePush', x: 0.41, side: 'mac' },
  { id: 'pr', x: 0.6, side: 'server' },
  { id: 'ci', x: 0.73, side: 'server' },
  { id: 'ready', x: 0.86, side: 'server' },
  { id: 'main', x: 0.975, side: 'server' },
] as const;

export const SEAM_X = 0.505;
export const TRUNK_X = 0.012;

const HEAD_X: Record<TrackStation, number> = {
  start: 0.055,
  working: 0.13,
  main: 0.975,
};

export function headX(station: TrackStation): number {
  return HEAD_X[station];
}

/** A point on the track area as a CSS length inside a full-width row of the board. */
export function trackLeft(x: number): string {
  return `calc(var(--work-label-w) + (100% - var(--work-label-w) - var(--work-track-end)) * ${x})`;
}

/** The distance between two ruler points, for a line that starts at one and ends at the other. */
export function trackSpan(from: number, to: number): string {
  return `calc((100% - var(--work-label-w) - var(--work-track-end)) * ${to - from})`;
}
