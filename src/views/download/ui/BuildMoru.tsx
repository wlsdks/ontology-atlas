'use client';

import { useState } from 'react';

import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { CELEBRATION_MOTIONS, PLAY_ROW_FRAMES, type CelebrationMotion, type PlayMotion, type WorkMotion } from '@/shared/ui/marks/moru-rows';

export type BuildLoop = WorkMotion | PlayMotion | 'tail-wag';
export type BuildGesture = CelebrationMotion;
type Row = BuildLoop | BuildGesture;

/** Every row this section plays, fetched once the section is first seen so a swap never blinks. */
const BUILD_ROWS: readonly Row[] = ['tail-wag', 'folder-open', 'read', 'think', 'follow-link', 'pondering', 'search', 'compare', 'flipper-groove', ...CELEBRATION_MOTIONS];
const rowSrc = (row: Row) => withBasePath(`/brand/mascot-${row}-row-128.png`);
const paceOf = (row: Row) => (row in PLAY_ROW_FRAMES || row === 'tail-wag' ? 'play' : 'work');
const framesOf = (row: Row) => (PLAY_ROW_FRAMES as Record<string, number>)[row] ?? 24;
const EMOTE: Record<BuildGesture, 'spark' | 'note' | 'heart'> = { clap: 'spark', hop: 'note', success: 'heart' };

interface Layer {
  id: string;
  row: Row;
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
 * back. Every row starts on the shared neutral pose and each swap cross-fades the two cells, so a
 * reaction starts at once without a single-frame jump.
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
  const wanted: Layer = gestureLive ? { id: `gesture:${gesture.at}`, row: gesture.motion } : { id: `loop:${loop}`, row: loop };

  const [layers, setLayers] = useState<Layer[]>([wanted]);
  if (layers[layers.length - 1].id !== wanted.id) setLayers([...layers.slice(-1), wanted]);

  return (
    <span aria-hidden className="build-moru relative inline-flex size-32 shrink-0">
      {layers.map((layer, index) => {
        const leaving = index < layers.length - 1;
        return (
          <span
            key={layer.id}
            data-build-moru-layer={leaving ? 'out' : 'in'}
            className="build-moru-layer atlas-waiting-mark-2x absolute left-0 top-0 inline-flex"
            onTransitionEnd={(event) => {
              if (leaving && event.propertyName === 'opacity') setLayers((current) => current.filter((item) => item.id !== layer.id));
            }}
          >
            <span
              data-testid={leaving ? undefined : 'build-moru'}
              data-moru-motion={layer.row}
              data-waiting-motion={play}
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
      {gestureLive ? (
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
