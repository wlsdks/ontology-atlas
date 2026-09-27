'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { useFrameMeter } from '@/shared/lib/appearance-preferences';

/**
 * On-screen readout of delivered frames: the real `requestAnimationFrame` interval, so stutter
 * shows whatever caused it. It does not measure time spent in our code; a rAF interval is the
 * display refresh, not app cost. It pairs fps with the worst gap of the last second because
 * stutter lives in the tail, and when off nothing runs.
 */

/** Readout refresh (ms); a setState per frame would make the meter the load. */
const REPORT_MS = 250;
/** Window for the worst gap (ms), about how long the eye remembers a stutter. */
const WORST_WINDOW_MS = 1000;
/** A dropped frame is a gap above twice one 60 Hz frame. */
const JANK_MS = 34;

interface Sample {
  fps: number;
  worst: number;
  jank: number;
}

/**
 * Does not mount the measuring half while off, so re-enabling never shows the previous
 * session's numbers as current.
 */
export function FrameMeter({ className }: { className?: string }) {
  const enabled = useFrameMeter();
  if (!enabled) return null;
  return <FrameMeterLive className={className} />;
}

function FrameMeterLive({ className }: { className?: string }) {
  /* The numbers sit inside catalogue messages: word order is the language's. */
  const t = useTranslations('nav.settingsMenu');
  const [sample, setSample] = useState<Sample | null>(null);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let reportedAt = last;
    const gaps: Array<[number, number]> = [];

    const tick = (now: number) => {
      const gap = now - last;
      last = now;
      gaps.push([now, gap]);
      while (gaps.length > 0 && now - gaps[0][0] > WORST_WINDOW_MS) gaps.shift();

      if (now - reportedAt >= REPORT_MS && gaps.length > 1) {
        reportedAt = now;
        let worst = 0;
        let jank = 0;
        let total = 0;
        for (const [, g] of gaps) {
          if (g > worst) worst = g;
          if (g > JANK_MS) jank += 1;
          total += g;
        }
        const fps = total > 0 ? Math.round((gaps.length / total) * 1000) : 0;
        setSample({ fps, worst: Math.round(worst), jank });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // No gap exists before the second sample; draw nothing rather than 0 fps.
  if (sample === null) return null;

  // The numbers carry the state and colour only reinforces it (WCAG 1.4.1).
  const bad = sample.worst >= 100 || sample.jank >= 3;
  const warn = !bad && (sample.worst >= JANK_MS * 2 || sample.jank >= 1);
  // Declared tokens only: a `var()` on an undeclared token fails silently
  // (`undeclared-token-ref` contract test).
  const tone = bad
    ? 'text-[color:var(--color-status-danger)]'
    : warn
      ? 'text-[color:var(--color-status-warning)]'
      : 'text-[color:var(--color-text-tertiary)]';

  return (
    <div
      className={className}
      // A diagnostic must not block the map or swallow clicks.
      style={{ pointerEvents: 'none' }}
      // A number changing every 250 ms would only interrupt a screen reader.
      aria-hidden="true"
    >
      <div className="flex items-center gap-2 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2 py-1 font-mono text-label tabular-nums">
        <span className={tone}>{t('frameMeterFps', { fps: sample.fps })}</span>
        <span className="text-[color:var(--color-divider)]">·</span>
        <span className={tone}>{t('frameMeterWorst', { ms: sample.worst })}</span>
        {sample.jank > 0 ? (
          <>
            <span className="text-[color:var(--color-divider)]">·</span>
            <span className={tone}>{t('frameMeterDropped', { count: sample.jank })}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
