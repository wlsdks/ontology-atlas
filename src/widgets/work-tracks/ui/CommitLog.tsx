import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { cn } from '@/shared/lib/cn';
import { MOTION } from '@/shared/motion';
import { SwapText } from './SwapText';
import type { ScreenCommit } from './use-room-copy';
import styles from './rooms.module.css';

/** How long a row takes to move one place down, and a new or old row to fade: `--motion-slow`. */
const SLIDE_MS = MOTION.slow.duration * 1000;
const SLIDE_EASE = `cubic-bezier(${MOTION.slow.ease.join(', ')})`;

interface Row {
  commit: ScreenCommit;
  /** Pushed past the last place by a newer commit: it fades where it moves, then goes. */
  leaving: boolean;
}

/**
 * The newest commits, newest on top. A row keeps its element while newer commits push it down, so
 * a commit that lands slides the list one row by `transform` while the new subject fades in at the
 * top and the row pushed past the last place fades out; only transform and opacity change. With
 * reduced motion the rows swap in place.
 */
export function CommitLog({ commits, rows, className }: { commits: readonly ScreenCommit[]; rows: number; className?: string }) {
  const [drawn, setDrawn] = useState<{ source: readonly ScreenCommit[]; rows: Row[] }>({ source: commits, rows: commits.map(commit => ({ commit, leaving: false })) });
  if (drawn.source !== commits && JSON.stringify(drawn.source) !== JSON.stringify(commits)) {
    const kept = new Set(commits.map(commit => commit.key));
    const leaving = drawn.rows.filter(row => !row.leaving && !kept.has(row.commit.key)).map(row => ({ ...row, leaving: true }));
    setDrawn({ source: commits, rows: [...commits.map(commit => ({ commit, leaving: false })), ...leaving] });
  }
  const leavingCount = drawn.rows.filter(row => row.leaving).length;
  useEffect(() => {
    if (leavingCount === 0) return;
    const timer = window.setTimeout(() => setDrawn(state => ({ ...state, rows: state.rows.filter(row => !row.leaving) })), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [leavingCount, drawn.source]);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  // A row new to a list already on screen fades in where it lands, the top.
  const enter = useCallback((element: HTMLDivElement | null) => {
    if (!element || !mounted.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SLIDE_MS, easing: SLIDE_EASE });
  }, []);
  return (
    <div className={cn(styles.log, className)} style={{ ['--rows' as string]: rows } as CSSProperties} data-testid="work-room-log">
      {drawn.rows.map((row, index) => {
        const place = row.leaving ? rows : index;
        return (
          <div
            key={row.commit.key}
            ref={enter}
            data-commit={row.commit.key}
            data-leaving={row.leaving || undefined}
            data-newest={place === 0 || undefined}
            className={cn(styles.commitRow, 'text-body leading-body')}
            style={{ ['--i' as string]: place } as CSSProperties}
          >
            <span className="min-w-0 truncate">{row.commit.subject}</span>
            {row.commit.ago ? <span className={cn(styles.commitAgo, 'text-label leading-label')}><SwapText value={row.commit.ago} /></span> : null}
          </div>
        );
      })}
    </div>
  );
}
