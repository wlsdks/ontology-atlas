import type { CSSProperties } from 'react';
import { cn } from '@/shared/lib/cn';
import type { SessionLineCopy } from './use-room-copy';
import styles from './rooms.module.css';

/**
 * One session on one line: its ink, its name (or its tool and number), the tool and number beside a
 * name in muted ink, its state in the state's tone and since when. Only the name gives way, so the
 * state is never cut. The name is the person's own text: drawn, never parsed or linked.
 */
export function SessionLineRow({ line, place, className }: { line: SessionLineCopy; place: 'screen' | 'panel'; className?: string }) {
  const ink = line.ink === null ? undefined : ({ '--line-ink': `var(--work-session-${line.ink + 1})` } as CSSProperties);
  return (
    <li className={cn(styles.sessionLine, className)} data-in={place} data-testid="work-session-line" data-state-tone={line.state?.tone} style={ink}>
      <i aria-hidden className={styles.sessionMark} />
      <span className={styles.sessionName} data-testid="work-session-line-name">{line.main}</span>
      {line.tag ? <span className={styles.sessionTag}>{line.tag}</span> : null}
      {line.state ? (
        <span className={cn(styles.sessionState, 'font-[var(--font-weight-emphasis)]')} data-tone={line.state.tone}>{line.state.text}</span>
      ) : null}
      {line.since ? <span className={styles.sessionSince} data-after-state={line.state !== null}>{line.since}</span> : null}
    </li>
  );
}
