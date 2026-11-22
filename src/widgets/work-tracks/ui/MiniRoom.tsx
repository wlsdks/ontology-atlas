'use client';

import type { RoomEntry } from '@/shared/lib/work-status/work-tracks';
import { cn } from '@/shared/lib/cn';
import { STAGE_AT, roomLook, type MoruCharacter } from '../model/room-look';
import { BranchName } from './BranchName';
import { CommitLog } from './CommitLog';
import { RoomMoru } from './RoomMoru';
import { SwapText } from './SwapText';
import { SCREEN_COMMITS, type StatusTone, type useRoomCopy } from './use-room-copy';
import styles from './rooms.module.css';

type RoomCopy = ReturnType<typeof useRoomCopy>;

const TONE: Record<StatusTone, string> = {
  ink: styles.inkText,
  warning: 'text-[color:var(--color-status-warning)]',
  success: 'text-[color:var(--color-success-text-a94)]',
  plain: 'text-[color:var(--color-text-secondary)]',
};

/**
 * A worktree on the lower floor: its own corner of floor where a small Moru, or its crate, stands in
 * the room's light; then the branch, the status and the newest commit subject with its time. With the
 * floor to itself (`data-spread` on its face) it spreads the newest commits and what is not
 * committed into columns. The small Moru holds his clip's still pose: a floor of forty rooms would
 * otherwise step forty sprites every frame.
 */
export function MiniRoom({ room, copy, tint, showOwner, character }: { room: RoomEntry; copy: RoomCopy; tint: string | null; showOwner: boolean; character: MoruCharacter }) {
  const look = roomLook(room.state);
  const status = copy.status(room);
  const subject = copy.newestSubject(room.track);
  const commits = copy.screenCommits(room.track);
  const files = copy.uncommitted(room.track);
  // A mini Moru holds his pose, so a sigh would not show: a lock left behind or a folder gone keeps its crate.
  const crateOnly = look.cast === 'none' || look.monitorOff;
  return (
    <div className={styles.mini} data-lit={look.running}>
      <i aria-hidden className={styles.miniBar} />
      <div className={styles.niche}>
        {crateOnly ? (
          <i className={styles.crate} data-kind={look.crate} />
        ) : (
          <span className={styles.miniActor}>
            <RoomMoru key={look.clip} clip={look.clip} character={character} still zoom={0.5} tint={tint} dozing={look.dozing} />
          </span>
        )}
        {look.dozing ? <span aria-hidden className={cn(styles.miniZ, 'text-label font-mono font-[var(--font-weight-strong)]')}>z<br />&nbsp;z</span> : null}
      </div>
      <div className={styles.miniText}>
        <BranchName branch={room.track.branch ?? room.track.title} className="text-body leading-body font-mono font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]" />
        <span className="text-body leading-body text-[color:var(--color-text-tertiary)]">
          <SwapText value={status.lead} ink={cn('font-[var(--font-weight-emphasis)]', TONE[status.tone])} />
          {status.rest ? <> · {status.rest}</> : null}
          {showOwner ? <span className={styles.ownerText}> · {copy.owner(room)}</span> : null}
        </span>
        {subject ? (
          <span className={cn(styles.miniSubject, 'text-label leading-label')}>
            <SwapText value={subject.ago ? `${subject.subject} · ${subject.ago}` : subject.subject} />
          </span>
        ) : null}
      </div>
      <div className={styles.miniCols}>
        {commits.length > 0 ? <CommitLog commits={commits} rows={SCREEN_COMMITS} /> : <span className="flex-1" />}
        {files ? (
          <span className={cn(styles.miniFacts, 'text-label leading-label')}>
            <SwapText value={files.text} />
            {files.file ? <><span className="flex-none">&nbsp;·&nbsp;</span><SwapText value={files.file} className="font-mono text-[color:var(--color-text-secondary)]" /></> : null}
          </span>
        ) : null}
      </div>
      <div className={styles.miniTrack} data-arrived={room.stage === 'main'}>
        <i className={styles.miniFill} style={{ transform: `scaleX(${STAGE_AT[room.stage]})` }} />
      </div>
    </div>
  );
}
