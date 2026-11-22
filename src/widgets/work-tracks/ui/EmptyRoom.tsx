'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { RoomMoru } from './RoomMoru';
import styles from './rooms.module.css';

/** The room is 720px wide at most, under the 760px a three-times Moru needs. */
const EMPTY_UNIT = 2;

/**
 * The building before any worktree: one room for the base branch with Moru at rest, its belt
 * running straight into the `main` hatch, and the words under it.
 */
export function EmptyRoom({ branch, title, body, children }: { branch: string; title: ReactNode; body: string; children?: ReactNode }) {
  const t = useTranslations('workStatus');
  return (
    <div data-testid="work-empty-room" className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-10 py-8">
      <div className="flex w-full max-w-[45rem] flex-col items-center text-center">
        <div className={cn(styles.large, styles.notched, 'relative h-[21.25rem] w-full overflow-hidden bg-[color:var(--work-room-pit)]')} style={{ ['--ink' as string]: 'var(--work-session-1)', containerType: 'size' }}>
          <div className={styles.scene} style={{ ['--u' as string]: EMPTY_UNIT, ['--ax' as string]: '50%' }} data-lit={false}>
            <i className={styles.wainscot} />
            <i className={styles.floor} />
            <div className={cn(styles.sign, styles.notched, 'text-body leading-body font-mono font-[var(--font-weight-strong)]')}>{branch}</div>
            <i className={styles.lamp}><i className={styles.lampShade} /></i>
            <i className={styles.shadow} />
            <span className={styles.actor}><RoomMoru clip="waiting" still zoom={EMPTY_UNIT} tint={null} /></span>
          </div>
          <div className={styles.belt}>
            <div className={styles.track}>
              <div className={styles.rail} />
              <span className={cn(styles.station, styles.stationMain, 'text-label leading-label font-mono font-[var(--font-weight-strong)]')} style={{ left: '100%' }}>
                {t('ruler.main')}
              </span>
              <i className={styles.hatch}><i className={styles.hatchOpen} /><i className={styles.hatchLight} /></i>
            </div>
          </div>
        </div>
        <h2 className="mt-7 text-title leading-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{title}</h2>
        <p className="mt-1.5 text-body leading-body text-[color:var(--color-text-tertiary)]">{body}</p>
        {children ? <div className="mt-8 w-full">{children}</div> : null}
      </div>
    </div>
  );
}
