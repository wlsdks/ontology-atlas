import type { TrackStation } from '@/shared/lib/work-status/work-tracks';

/**
 * A point on the route: a fraction of its own ground's track. This Mac's track runs from the label
 * column to the push seam, the server's from the seam to the main rail, so the seam can move when
 * the server ground widens without any station changing its fraction.
 */
export interface RulerPoint {
  side: 'mac' | 'server';
  x: number;
}

export const RULER = [
  { id: 'working', side: 'mac', x: 0.27 },
  { id: 'checks', side: 'mac', x: 0.54 },
  { id: 'prePush', side: 'mac', x: 0.81 },
  { id: 'pr', side: 'server', x: 0.2 },
  { id: 'ci', side: 'server', x: 0.47 },
  { id: 'ready', side: 'server', x: 0.74 },
  { id: 'main', side: 'server', x: 1 },
] as const satisfies readonly (RulerPoint & { id: string })[];

export const MAIN: RulerPoint = RULER[RULER.length - 1];
export const TRUNK: RulerPoint = { side: 'mac', x: 0.022 };

const HEAD: Record<TrackStation, RulerPoint> = {
  start: { side: 'mac', x: 0.11 },
  working: RULER[0],
  main: MAIN,
};

export function headPoint(station: TrackStation): RulerPoint {
  return HEAD[station];
}

const MAC_TRACK_W = '(100cqw - var(--work-label-w) - var(--work-server-w))';
const SERVER_TRACK_W = '(var(--work-server-w) - var(--work-track-end))';

/** The push seam as a CSS length from the board's left edge; the board is the `cqw` container. */
export const SEAM_LEFT = 'calc(100cqw - var(--work-server-w))';

/** A ruler point as a CSS length from the board's left edge. */
export function trackLeft(point: RulerPoint): string {
  return point.side === 'mac'
    ? `calc(var(--work-label-w) + ${MAC_TRACK_W} * ${point.x})`
    : `calc(100cqw - var(--work-server-w) + ${SERVER_TRACK_W} * ${point.x})`;
}

/** The distance between two ruler points, for a line that starts at one and ends at the other. */
export function trackSpan(from: RulerPoint, to: RulerPoint): string {
  return `calc(${trackLeft(to)} - ${trackLeft(from)})`;
}
