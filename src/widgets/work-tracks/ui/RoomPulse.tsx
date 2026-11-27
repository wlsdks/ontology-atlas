'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { MOTION_EASE } from '@/shared/motion';
import { SPARK_ROUND_MS, sparkRuns, type SparkEdge } from '../model/room-spark';
import styles from './rooms.module.css';

const EASE_CSS = `cubic-bezier(${MOTION_EASE.join(', ')})`;
const EDGES: readonly SparkEdge[] = ['top', 'right', 'bottom', 'left'];
/** How far into the pulse the light inside the frame is brightest. */
const FLARE_PEAK_AT = 0.15;

/**
 * A room's pulse for each counted change that arrives while it is drawn, never for the count it was
 * drawn with. Each change mounts its own pulse, which plays once and then holds nothing running.
 */
export function RoomPulse({ flash }: { flash: number }) {
  const [drawnWith] = useState(flash);
  return flash > drawnWith ? <PulseOnce key={flash} /> : null;
}

/**
 * The light inside the frame flares and settles by opacity while one spark runs once round the
 * frame by `transform` (`sparkRuns`). The frame's size is read once, as the pulse starts. Reduced
 * motion plays neither: the room's light stays raised for the minute the change is new instead.
 */
function PulseOnce() {
  const flare = useRef<HTMLElement>(null);
  const spark = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const frame = spark.current;
    if (!frame || !flare.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const top = frame.querySelector<HTMLElement>('[data-edge="top"]');
    const played = [
      flare.current.animate(
        [{ opacity: 0, easing: EASE_CSS }, { opacity: 1, offset: FLARE_PEAK_AT, easing: EASE_CSS }, { opacity: 0 }],
        { duration: SPARK_ROUND_MS },
      ),
    ];
    for (const run of sparkRuns(frame.offsetWidth, frame.offsetHeight, top?.offsetWidth ?? 0)) {
      const edge = frame.querySelector<HTMLElement>(`[data-edge="${run.edge}"]`);
      if (edge) played.push(edge.animate([{ transform: run.from }, { transform: run.to }], { duration: run.durationMs, delay: run.delayMs, easing: 'linear' }));
    }
    return () => played.forEach(animation => animation.cancel());
  }, []);
  return (
    <>
      <i ref={flare} aria-hidden className={styles.flare} />
      <i ref={spark} aria-hidden className={styles.spark} data-testid="work-room-flash">
        {EDGES.map(edge => <i key={edge} data-edge={edge} />)}
      </i>
    </>
  );
}
