'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { prepareCast, prepareTint } from '../model/cast-strip';
import { MORU_CELL_PX, moruCells, moruRow, moruRowSource } from '../model/moru-clock';
import type { MoruCharacter, RoomClip } from '../model/room-look';
import styles from './rooms.module.css';

/** The waiting row's closed-eye cell a dozing mini Moru holds. */
const DOZING_CELL = 9;

/**
 * Moru in a room: an existing native 128px row, enlarged by whole pixels on a large room and
 * halved on a mini one. A session's ink retints only the saturated indigo of the flippers, tail and
 * laptop through the board's filter; the silhouette and every other pixel stay as drawn. A live Moru's
 * strips are tinted once ahead (`prepareTint`) and then shown without the filter, so a step does not
 * run it again.
 *
 * A large room's Moru is `live`: the board's clock (`createMoruClock`) steps his row and swaps rows
 * on the neutral pose, so the element keeps what it draws and React only says which row to loop and
 * which to play once. A mini room's Moru holds his row's neutral pose.
 */
export function RoomMoru({ clip, character = 'grey', still, zoom, tint, phase = 0, dozing = false, live = false, once = null, slot = 'front', loops = null, talks = null }: {
  clip: RoomClip;
  /** Which Moru the room has; it changes the costume, never the row. */
  character?: MoruCharacter;
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
  /** The clips he walks through, one a loop, while his state lasts; none for one row. */
  loops?: readonly RoomClip[] | null;
  /** The talks the one behind a working pair starts now and then. */
  talks?: readonly RoomClip[] | null;
}) {
  // The cast clips he may play are dressed for him ahead, so each is ready on the neutral pose it starts from.
  const wanted = [clip, ...(loops ?? []), ...(talks ?? []), ...(once ?? '').split(' ').map(request => request.split('@')[0])].filter(Boolean).join(' ');
  const figureRef = useRef<HTMLSpanElement>(null);
  const [ink, setInk] = useState<string | null>(null);
  useEffect(() => {
    if (!live || !tint || !figureRef.current) return setInk(null);
    setInk(inkOf(figureRef.current, tint));
  }, [live, tint]);
  useEffect(() => {
    if (!live) return;
    let gone = false;
    void prepareCast(character, wanted.split(' ')).then(() => {
      if (!gone && ink) void prepareTint(wanted.split(' ').map(each => moruRowSource(each, character)), ink);
    });
    return () => { gone = true; };
  }, [live, character, wanted, ink]);
  const cells = moruCells(clip);
  const start = live && !still ? Math.floor(phase * cells) % cells : !live && dozing ? DOZING_CELL : 0;
  const row = !live && dozing ? 'waiting' : clip;
  // A live Moru's row and cell belong to the clock after the first paint; React draws only the first.
  const [first] = useState<CSSProperties>(() => ({
    backgroundImage: moruRow(row, character),
    backgroundSize: `${moruCells(row) * MORU_CELL_PX}px ${MORU_CELL_PX}px`,
    backgroundPositionX: `${-start * MORU_CELL_PX}px`,
  }));
  return (
    <span
      aria-hidden
      ref={figureRef}
      data-room-moru={clip}
      className={styles.moru}
      style={{ zoom, filter: tint ? `url(#${tint})` : undefined, display: 'inline-flex', width: MORU_CELL_PX }}
    >
      {live ? (
        <span
          className={styles.moruCells}
          data-moru-live
          data-moru-slot={slot}
          data-moru-clip={clip}
          data-moru-cast={character}
          data-moru-hold={still}
          data-moru-phase={start}
          data-moru-once={once ?? undefined}
          data-moru-loops={loops?.join(' ') || undefined}
          data-moru-talks={talks?.join(' ') || undefined}
          data-moru-ink={ink ?? undefined}
          data-moru-filter={tint ? `url(#${tint})` : undefined}
          style={first}
        />
      ) : (
        <span
          className={styles.moruCells}
          style={{
            backgroundImage: moruRow(row, character),
            backgroundSize: `${moruCells(row) * MORU_CELL_PX}px ${MORU_CELL_PX}px`,
            backgroundPositionX: `${-start * MORU_CELL_PX}px`,
          }}
        />
      )}
    </span>
  );
}

/** A tint filter's session ink as `r,g,b`: the colour its `--work-session-N` resolves to where this Moru stands. */
function inkOf(element: HTMLElement, tint: string): string | null {
  const ink = /-(\d+)$/.exec(tint)?.[1];
  const colour = ink ? getComputedStyle(element).getPropertyValue(`--work-session-${ink}`).trim() : '';
  if (!colour || typeof OffscreenCanvas === 'undefined') return null;
  const canvas = new OffscreenCanvas(1, 1), g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.fillStyle = colour;
  g.fillRect(0, 0, 1, 1);
  const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
  return `${r},${gr},${b}`;
}
