'use client';

import type { RoomEntry } from '@/shared/lib/work-status/work-tracks';
import { cn } from '@/shared/lib/cn';
import { roomLook } from '../model/room-look';
import { RoomMoru } from './RoomMoru';
import { SwapText } from './SwapText';
import type { StatusTone, useRoomCopy } from './use-room-copy';
import styles from './rooms.module.css';

type RoomCopy = ReturnType<typeof useRoomCopy>;

const TONE: Record<StatusTone, string> = {
  ink: styles.inkText,
  warning: 'text-[color:var(--color-status-warning)]',
  success: 'text-[color:var(--color-success-text-a94)]',
  plain: 'text-[color:var(--color-text-secondary)]',
};

/** A worktree on a session's floor: a small Moru, the branch and one status line; a merged one shows its crate in main. */
export function MiniRoom({ room, copy, tint, showOwner }: { room: RoomEntry; copy: RoomCopy; tint: string | null; showOwner: boolean }) {
  const look = roomLook(room.state);
  const status = copy.status(room);
  return (
    <div className={styles.mini} data-lit={look.running}>
      <i className={styles.miniLamp} />
      {look.cast === 'none' ? (
        <i className={styles.miniCrateBig} data-kind={look.crate} />
      ) : (
        <span className={styles.miniActor}>
          <RoomMoru key={`${look.clip}:${look.still}`} clip={look.clip} still={look.still} zoom={0.5} tint={tint} dozing={look.dozing} />
        </span>
      )}
      {look.dozing ? <span aria-hidden className={cn(styles.miniZ, 'text-label font-mono font-[var(--font-weight-strong)]')}>z<br />&nbsp;z</span> : null}
      <div className={styles.miniText}>
        <span className="text-body leading-body font-mono font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]" title={room.track.branch ?? room.track.path}>
          {room.track.branch ?? room.track.title}
        </span>
        <span className="text-body leading-body text-[color:var(--color-text-tertiary)]">
          <SwapText value={status.lead} ink={cn('font-[var(--font-weight-emphasis)]', TONE[status.tone])} />
          {status.rest ? <> · {status.rest}</> : null}
        </span>
        {showOwner ? (
          <span className={cn(styles.ownerText, 'text-label leading-label')}>{copy.owner(room)}</span>
        ) : null}
      </div>
      {room.stage !== 'main' ? <i aria-hidden className={styles.miniBar} /> : null}
      {room.stage === 'main' ? (
        <div className={styles.miniFloor} data-arrived>
          <i className={styles.miniRail}><i style={{ transform: 'scaleX(1)' }} /></i>
          <span className={styles.miniCarriage} style={{ transform: 'translateX(100%)' }}><i className={styles.miniCrate} /></span>
          <i className={styles.miniHatch}><i /></i>
        </div>
      ) : null}
    </div>
  );
}
