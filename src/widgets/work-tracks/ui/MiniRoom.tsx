'use client';

import type { RoomEntry } from '@/shared/lib/work-status/work-tracks';
import { cn } from '@/shared/lib/cn';
import { roomLook, type MoruCharacter } from '../model/room-look';
import { BranchName } from './BranchName';
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

/**
 * A worktree on a session's floor: a small Moru, the branch and one status line; a merged one shows its crate in main.
 * The small Moru holds his clip's still pose: a floor of forty rooms would otherwise step forty sprites every frame.
 */
export function MiniRoom({ room, copy, tint, showOwner, character }: { room: RoomEntry; copy: RoomCopy; tint: string | null; showOwner: boolean; character: MoruCharacter }) {
  const look = roomLook(room.state);
  const status = copy.status(room);
  // A mini Moru holds his pose, so a sigh would not show: a lock left behind or a folder gone keeps its crate.
  const crateOnly = look.cast === 'none' || look.monitorOff;
  return (
    <div className={styles.mini} data-lit={look.running}>
      <i className={styles.miniLamp} />
      {crateOnly ? (
        <i className={styles.miniCrateBig} data-kind={look.crate} />
      ) : (
        <span className={styles.miniActor}>
          <RoomMoru key={look.clip} clip={look.clip} character={character} still zoom={0.5} tint={tint} dozing={look.dozing} />
        </span>
      )}
      {look.dozing ? <span aria-hidden className={cn(styles.miniZ, 'text-label font-mono font-[var(--font-weight-strong)]')}>z<br />&nbsp;z</span> : null}
      <div className={styles.miniText}>
        <BranchName branch={room.track.branch ?? room.track.title} className="text-body leading-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]" />
        <span className="text-body leading-body text-[color:var(--color-text-tertiary)]">
          <SwapText value={status.lead} ink={cn('font-[var(--font-weight-emphasis)]', TONE[status.tone])} />
          {status.rest ? <> · {status.rest}</> : null}
        </span>
        {showOwner ? (
          <span className={cn(styles.ownerText, 'text-label leading-label')}>{copy.owner(room)}</span>
        ) : null}
      </div>
      <i aria-hidden className={styles.miniBar} />
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
