'use client';

import { BrandWaitingMark } from '@/shared/ui/marks/moru/brand-waiting-mark';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { cn } from '@/shared/lib/cn';
import { MORU_CELLS } from '../model/moru-clock';
import type { RoomClip } from '../model/room-look';
import styles from './rooms.module.css';

/**
 * Moru in a room: an existing native 128px row, enlarged by whole pixels on a large room and
 * halved on a mini one. A session's ink retints only the saturated indigo of the flippers, tail and
 * laptop through the board's filter; the silhouette and every other pixel stay as drawn. A looping
 * Moru is a row of cells the board's clock steps; a clap plays once on its own.
 */
export function RoomMoru({ clip, still, zoom, tint, phase = 0, dozing = false }: {
  clip: RoomClip;
  still: boolean;
  /** 1, 2 or 3 on a large room (128 × zoom px), as the scene's `var(--u)` so it glides with it; 0.5 on a mini room. */
  zoom: number | string;
  /** The board's tint filter id for the room's session ink, or none for an untinted Moru. */
  tint: string | null;
  /** Where in its loop this Moru starts, from 0 to 1, so neighbouring rooms move out of step. */
  phase?: number;
  dozing?: boolean;
}) {
  return (
    <span
      aria-hidden
      data-room-moru={clip}
      className={cn(styles.moru, dozing && styles.dozing)}
      style={{ zoom, filter: tint ? `url(#${tint})` : undefined, display: 'inline-flex' }}
    >
      {clip === 'clap' && !still ? (
        <BrandWaitingMark active scale={2} motion="clap" />
      ) : (
        <span
          // A Moru that stops looping is a new cell, so no stepped position outlives the loop.
          key={still ? 'still' : 'loop'}
          className={styles.moruCells}
          data-moru-loop={still ? undefined : Math.floor(phase * MORU_CELLS) % MORU_CELLS}
          style={{ backgroundImage: `url(${withBasePath(`/brand/mascot-${clip}-row-128.png`)})` }}
        />
      )}
    </span>
  );
}
