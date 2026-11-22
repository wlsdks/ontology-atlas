'use client';

import { BrandWaitingMark } from '@/shared/ui/marks/brand-waiting-mark';
import type { RoomClip } from '../model/room-look';
import styles from './rooms.module.css';

/**
 * Moru in a room: an existing native 128px row, enlarged by whole pixels on a large room and
 * halved on a mini one. A session's ink retints only the saturated indigo of the flippers, tail and
 * laptop through the board's filter; the silhouette and every other pixel stay as drawn.
 */
export function RoomMoru({ clip, still, zoom, tint, dozing = false }: {
  clip: RoomClip;
  still: boolean;
  /** 1, 2 or 3 on a large room (128 × zoom px), 0.5 on a mini room. */
  zoom: number;
  /** The board's tint filter id for the room's session ink, or none for an untinted Moru. */
  tint: string | null;
  dozing?: boolean;
}) {
  return (
    <span
      aria-hidden
      data-room-moru={clip}
      className={dozing ? styles.dozing : undefined}
      style={{ zoom, filter: tint ? `url(#${tint})` : undefined, display: 'inline-flex' }}
    >
      <BrandWaitingMark active held={still} scale={2} motion={clip} />
    </span>
  );
}
