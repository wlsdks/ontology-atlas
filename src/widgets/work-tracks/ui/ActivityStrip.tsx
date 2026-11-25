'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { MOTION } from '@/shared/motion';
import type { ScreenBeat, ScreenTick } from './use-room-copy';
import styles from './rooms.module.css';

const PULSE_MS = MOTION.choreography.duration * 1000;
const PULSE_EASE = `cubic-bezier(${MOTION.choreography.ease.join(', ')})`;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Keys new to the line, or whose age fell instead of growing with the clock. */
function arrived<T extends { key: string; age: number }>(before: ReadonlyMap<string, number>, items: readonly T[]): T[] {
  return items.filter(item => {
    const was = before.get(item.key);
    return was === undefined || item.age < was;
  });
}

/**
 * The last hour on one line, now at the right end: above it a mark for each uncommitted file where
 * it was last written and for each commit where it landed; under it a tick for each ten-second step
 * that had a counted file change, taller for more changes. A mark or tick that arrives after the
 * first draw rises once in its place, which is the only motion here that no clock drives.
 */
export function ActivityStrip({ beats, ticks, label }: { beats: readonly ScreenBeat[]; ticks: readonly ScreenTick[]; label: string }) {
  const t = useTranslations('workStatus');
  const line = useRef<HTMLSpanElement>(null);
  const seen = useRef<{ beats: Map<string, number>; ticks: Map<string, number> } | null>(null);
  useEffect(() => {
    const before = seen.current;
    seen.current = { beats: new Map(beats.map(beat => [beat.key, beat.age])), ticks: new Map(ticks.map(tick => [tick.key, tick.age])) };
    if (before === null || reducedMotion()) return;
    const find = (attribute: string, key: string) => line.current?.querySelector<HTMLElement>(`[${attribute}="${CSS.escape(key)}"]`);
    for (const beat of arrived(before.beats, beats)) {
      find('data-beat', beat.key)?.animate([{ scale: '3 2.4', opacity: 1 }, { scale: '1 1' }], { duration: PULSE_MS, easing: PULSE_EASE });
    }
    for (const tick of arrived(before.ticks, ticks)) {
      find('data-tick', tick.key)?.animate([{ scale: '1 0' }, { scale: '1 1' }], { duration: PULSE_MS, easing: PULSE_EASE });
    }
  }, [beats, ticks]);
  return (
    <span className={styles.strip} role="img" aria-label={label} data-testid="work-room-activity">
      <span aria-hidden className="flex-none">{t('monitor.lastHour')}</span>
      <span ref={line} aria-hidden className={styles.stripLine}>
        {beats.map(beat => (
          <i key={beat.key} data-beat={beat.key} data-kind={beat.kind} className={styles.beat} style={{ '--age': beat.age } as CSSProperties} />
        ))}
        {ticks.map(tick => (
          <i key={tick.key} data-tick={tick.key} data-height={tick.height} className={styles.tick} style={{ '--age': tick.age } as CSSProperties} />
        ))}
      </span>
    </span>
  );
}
