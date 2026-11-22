'use client';

import { useState, type CSSProperties } from 'react';
import { MORU_CELL_PX, moruCells, moruRow } from '../model/moru-clock';
import type { RoomClip } from '../model/room-look';
import styles from './rooms.module.css';

/** The waiting row's closed-eye cell a dozing mini Moru holds. */
const DOZING_CELL = 9;

/**
 * Moru in a room: an existing native 128px row, enlarged by whole pixels on a large room and
 * halved on a mini one. A session's ink retints only the saturated indigo of the flippers, tail and
 * laptop through the board's filter; the silhouette and every other pixel stay as drawn.
 *
 * A large room's Moru is `live`: the board's clock (`createMoruClock`) steps his row and swaps rows
 * on the neutral pose, so the element keeps what it draws and React only says which row to loop and
 * which to play once. A mini room's Moru holds his row's neutral pose.
 */
export function RoomMoru({ clip, still, zoom, tint, phase = 0, dozing = false, live = false, once = null, slot = 'front' }: {
  clip: RoomClip;
  still: boolean;
  /** 1, 2 or 3 on a large room (128 × zoom px), as the scene's `var(--u)` so it glides with it; 0.5 on a mini room. */
  zoom: number | string;
  /** The board's tint filter id for the room's session ink, or none for an untinted Moru. */
  tint: string | null;
  /** Where in his loop this Moru starts, from 0 to 1, so neighbouring rooms move out of step. */
  phase?: number;
  dozing?: boolean;
  live?: boolean;
  /** A row to play once, `clip@token`; a new token plays it again. */
  once?: string | null;
  /** Which Moru of the room this is, so each remembers the rows he has played. */
  slot?: 'front' | 'back';
}) {
  const cells = moruCells(clip);
  const start = live && !still ? Math.floor(phase * cells) % cells : !live && dozing ? DOZING_CELL : 0;
  const row = !live && dozing ? 'waiting' : clip;
  // A live Moru's row and cell belong to the clock after the first paint; React draws only the first.
  const [first] = useState<CSSProperties>(() => ({
    backgroundImage: moruRow(row),
    backgroundSize: `${moruCells(row) * MORU_CELL_PX}px ${MORU_CELL_PX}px`,
    backgroundPositionX: `${-start * MORU_CELL_PX}px`,
  }));
  return (
    <span
      aria-hidden
      data-room-moru={clip}
      className={styles.moru}
      style={{ zoom, filter: tint ? `url(#${tint})` : undefined, display: 'inline-flex' }}
    >
      {live ? (
        <span
          className={styles.moruCells}
          data-moru-live
          data-moru-slot={slot}
          data-moru-clip={clip}
          data-moru-hold={still}
          data-moru-phase={start}
          data-moru-once={once ?? undefined}
          style={first}
        />
      ) : (
        <span
          className={styles.moruCells}
          style={{
            backgroundImage: moruRow(row),
            backgroundSize: `${moruCells(row) * MORU_CELL_PX}px ${MORU_CELL_PX}px`,
            backgroundPositionX: `${-start * MORU_CELL_PX}px`,
          }}
        />
      )}
    </span>
  );
}
