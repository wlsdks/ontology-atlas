'use client';

import type { RoomEntry } from '@/shared/lib/work-status/work-tracks';
import { cn } from '@/shared/lib/cn';
import { STAGE_AT, roomLook } from '../model/room-look';
import type { RoomLive } from '../model/room-live';
import { BranchName } from './BranchName';
import { CommitLog } from './CommitLog';
import { RoomComplete } from './RoomComplete';
import { RoomPulse } from './RoomPulse';
import { SwapText } from './SwapText';
import type { StatusTone, useRoomCopy } from './use-room-copy';
import styles from './rooms.module.css';

type RoomCopy = ReturnType<typeof useRoomCopy>;

/** Commit rows a spread mini room lists in its height. */
const MINI_LOG_ROWS = 3;

const TONE: Record<StatusTone, string> = {
  ink: styles.inkText,
  warning: 'text-[color:var(--color-status-warning)]',
  success: 'text-[color:var(--color-success-text-a94)]',
  plain: 'text-[color:var(--color-text-secondary)]',
};

/**
 * A worktree on the lower floor: the branch, the status and the newest commit subject with its time,
 * beside a corner where its crate stands on the room's rail when the crate says something (taped,
 * dashed or dusty). With the floor to itself (`data-spread` on its face) it spreads the newest
 * commits and what is not committed into columns.
 */
export function MiniRoom({ room, live, copy, showOwner, retiring }: { room: RoomEntry; live: RoomLive; copy: RoomCopy; showOwner: boolean; retiring: boolean }) {
  const look = roomLook(room.state);
  const status = copy.status(room, live);
  const owner = copy.owner(room, live.lines);
  const subject = copy.newestSubject(room.track);
  const commits = copy.screenCommits(room.track);
  const files = copy.uncommitted(room.track);
  return (
    <div className={styles.mini} data-lit={look.running}>
      <i aria-hidden className={styles.miniBar} />
      {look.crate === 'plain' ? null : (
        <div className={styles.niche}>
          <i className={styles.crate} data-kind={look.crate} />
        </div>
      )}
      <div className={styles.miniText}>
        <BranchName branch={room.track.branch ?? room.track.title} className="text-body leading-body font-mono font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]" />
        <span className="text-body leading-body text-[color:var(--color-text-tertiary)]" data-testid="work-room-status">
          {/* The room's light while a counted file change is under a minute old. */}
          {live.pulse?.changedJustNow ? <i aria-hidden className={styles.miniLight} data-testid="work-room-light" /> : null}
          <SwapText value={status.lead} ink={cn('font-[var(--font-weight-emphasis)]', TONE[status.tone])} />
          {status.rest ? <> · {status.rest}</> : null}
          {showOwner ? (
            <span className={styles.ownerText} data-testid="work-room-who">
              {' · '}{owner.main}
              {owner.tag ? <span className="font-normal text-[color:var(--color-text-quaternary)]">{` ${owner.tag}`}</span> : null}
            </span>
          ) : null}
        </span>
        {subject ? (
          <span className={cn(styles.miniSubject, 'text-label leading-label')}>
            <SwapText value={subject.ago ? `${subject.subject} · ${subject.ago}` : subject.subject} />
          </span>
        ) : null}
      </div>
      <div className={styles.miniCols}>
        {commits.length > 0 ? <CommitLog commits={commits.slice(0, MINI_LOG_ROWS)} rows={MINI_LOG_ROWS} /> : null}
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
      <RoomPulse flash={live.flash} />
      {retiring ? <RoomComplete /> : null}
    </div>
  );
}
