'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { MOTION } from '@/shared/motion';
import type { ScreenBeat } from './use-room-copy';
import styles from './rooms.module.css';

const PULSE_MS = MOTION.choreography.duration * 1000;
const PULSE_EASE = `cubic-bezier(${MOTION.choreography.ease.join(', ')})`;

/**
 * The last hour on one line, now at the right end: a mark for each uncommitted file where it was
 * last written and for each commit where it landed. A mark keeps its element, so a file written
 * again slides to the right end; a change that arrives after the first draw rises once in its
 * place, which is the only motion here that no clock drives.
 */
export function ActivityStrip({ beats }: { beats: readonly ScreenBeat[] }) {
  const t = useTranslations('workStatus');
  const line = useRef<HTMLSpanElement>(null);
  const seen = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    const before = seen.current;
    seen.current = new Map(beats.map(beat => [beat.key, beat.age]));
    if (before === null || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const beat of beats) {
      const was = before.get(beat.key);
      // New to the line, or written again: its age fell instead of growing with the clock.
      if (was !== undefined && beat.age >= was) continue;
      const mark = line.current?.querySelector<HTMLElement>(`[data-beat="${CSS.escape(beat.key)}"]`);
      mark?.animate([{ scale: '3 2.4', opacity: 1 }, { scale: '1 1' }], { duration: PULSE_MS, easing: PULSE_EASE });
    }
  }, [beats]);
  return (
    <span className={styles.strip} role="img" aria-label={t('monitor.lastHourChanges', { count: beats.length })} data-testid="work-room-activity">
      <span aria-hidden className="flex-none">{t('monitor.lastHour')}</span>
      <span ref={line} aria-hidden className={styles.stripLine}>
        {beats.map(beat => (
          <i key={beat.key} data-beat={beat.key} data-kind={beat.kind} className={styles.beat} style={{ '--age': beat.age } as CSSProperties} />
        ))}
      </span>
    </span>
  );
}
