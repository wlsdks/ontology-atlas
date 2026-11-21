'use client';

import { useState } from 'react';

import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { CELEBRATION_MOTIONS, PLAY_ROW_FRAMES, type CelebrationMotion, type PlayMotion, type WorkMotion } from '@/shared/ui/marks/moru/moru-rows';

export type BuildLoop = WorkMotion | PlayMotion | 'tail-wag';
/** A finishing gesture, or Moru's puzzled tilt at a tap that did not fit. */
export type BuildGesture = CelebrationMotion | 'uncertain';
type Row = BuildLoop | BuildGesture;

/** Every row this section plays, fetched once the section is first seen so a swap never blinks. */
const BUILD_ROWS: readonly Row[] = ['tail-wag', 'read', 'think', 'follow-link', 'pondering', 'search', 'compare', 'flipper-groove', 'uncertain', ...CELEBRATION_MOTIONS];
const rowSrc = (row: Row) => withBasePath(`/brand/mascot-${row}-row-128.png`);
const paceOf = (row: Row) => (row in PLAY_ROW_FRAMES || row === 'tail-wag' || row === 'uncertain' ? 'play' : 'work');
const framesOf = (row: Row) => (PLAY_ROW_FRAMES as Record<string, number>)[row] ?? 24;
const EMOTE: Record<BuildGesture, 'spark' | 'note' | 'heart' | null> = { clap: 'spark', hop: 'note', success: 'heart', uncertain: null };

/** Swaps faster than a fade can stack cells; the oldest, nearly gone, is dropped past this. */
const MAX_LAYERS = 3;

interface Layer {
  /** What the layer plays: the loop's name or the gesture's moment. */
  id: string;
  row: Row;
  /** A fresh mount per swap, so a row that comes back starts on its first pose. */
  mount: number;
}

/** Held so the decoded rows stay cached: a row decoded on its first paint stalls that frame. */
const warmRows: HTMLImageElement[] = [];

export function preloadBuildRows() {
  if (warmRows.length > 0) return;
  for (const row of BUILD_ROWS) {
    const image = new Image();
    image.src = rowSrc(row);
    image.decode().catch(() => undefined);
    warmRows.push(image);
  }
}

/**
 * Moru beside the stage. A loop plays for the phase; a gesture plays one pass over it and hands
 * back. Every row starts on the shared neutral pose; on each swap the new cell fades in while the
 * old ones fade out from where they are and are removed when their fade ends.
 */
export function BuildMoru({
  loop,
  gesture,
  play,
}: {
  loop: BuildLoop;
  /** `at` tells two equal gestures apart. */
  gesture: { motion: BuildGesture; at: number } | null;
  play: 'running' | 'paused' | 'still';
}) {
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const gestureLive = gesture !== null && gesture.at !== finishedAt && play !== 'still';
  const wanted = gestureLive ? { id: `gesture:${gesture.at}`, row: gesture.motion } : { id: `loop:${loop}`, row: loop };

  const [layers, setLayers] = useState<Layer[]>([{ ...wanted, mount: 0 }]);
  const top = layers[layers.length - 1];
  if (top.id !== wanted.id) setLayers([...layers.slice(1 - MAX_LAYERS), { ...wanted, mount: top.mount + 1 }]);

  return (
    <span aria-hidden className="build-moru relative inline-flex size-32 shrink-0">
      {layers.map((layer, index) => {
        const leaving = index < layers.length - 1;
        return (
          <span
            key={layer.mount}
            data-build-moru-layer={leaving ? 'out' : 'in'}
            className="build-moru-layer atlas-waiting-mark-2x absolute left-0 top-0 inline-flex"
            onTransitionEnd={(event) => {
              if (leaving && event.target === event.currentTarget && event.propertyName === 'opacity') {
                setLayers((current) => current.filter((item) => item.mount !== layer.mount));
              }
            }}
          >
            <span
              data-testid={leaving ? undefined : 'build-moru'}
              data-moru-motion={layer.row}
              data-waiting-motion={leaving && play === 'running' ? 'paused' : play}
              data-moru-pace={paceOf(layer.row)}
              data-moru-frames={framesOf(layer.row) === 24 ? undefined : framesOf(layer.row)}
              className="atlas-waiting-mark pointer-events-none inline-block size-16"
              style={{ backgroundImage: `url(${rowSrc(layer.row)})` }}
              onAnimationIteration={() => {
                if (gesture && layer.id === `gesture:${gesture.at}`) setFinishedAt(gesture.at);
              }}
            />
          </span>
        );
      })}
      {gestureLive && EMOTE[gesture.motion] ? (
        // eslint-disable-next-line @next/next/no-img-element -- Moru's own wordless emote, a 24px pixel SVG
        <img
          key={gesture.at}
          src={withBasePath(`/brand/moru-emote-${EMOTE[gesture.motion]}.svg`)}
          alt=""
          width={24}
          height={24}
          draggable={false}
          className="build-moru-emote pointer-events-none absolute right-1 top-0"
          style={{ imageRendering: 'pixelated' }}
        />
      ) : null}
    </span>
  );
}
