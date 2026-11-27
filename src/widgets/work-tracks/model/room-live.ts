import { pulseFactsOf, type PulseFacts } from '@/shared/lib/work-status/signals/pulse';
import { sessionLinesOf, shownSessionLines, type SessionLine, type SessionLineContext } from '@/shared/lib/work-status/signals/session-lines';
import type { FlashMark } from '@/shared/lib/work-status/signals/pulse';
import type { LoadRead, WorktreeLoad, WorktreePulse } from '@/shared/lib/work-status/tauri-work-status';
import type { RoomEntry } from '@/shared/lib/work-status/work-tracks';
import { SCREEN_ROW_H } from './building-layout';

/** How a live read stands: `unsupported` is a system without it, and nothing says so. */
export type LiveReadStatus = 'off' | 'pending' | 'read' | 'failed' | 'unsupported';

/** What the page reads beside Git for every room: session lines, the file-change pulse and load. */
export interface BuildingLive {
  sessions: SessionLineContext;
  /** Each listed session's own name, by the pid of its program; empty while names are off. */
  namesByPid: ReadonlyMap<number, string>;
  pulse: {
    status: LiveReadStatus;
    worktrees: ReadonlyMap<string, WorktreePulse>;
    flashes: ReadonlyMap<string, FlashMark>;
    /** The clock the pulse's "just now" and "last minute" are said against. */
    nowMs: number;
  };
  load: {
    status: LiveReadStatus;
    /** The last good sample; `null` unless `status` is `read`. */
    sample: LoadRead | null;
  };
}

/** What one room draws from the live reads; plain data, so a room compares it to skip a draw. */
export interface RoomLive {
  /** Every session at work in the room, waiting first. */
  lines: SessionLine[];
  pulseStatus: LiveReadStatus;
  /** `null` until the pulse answers for this room. */
  pulse: PulseFacts | null;
  /** Rises when the room's light flashes for a new counted change (`nextFlashes`): it flashes once for each rise. */
  flash: number;
  loadStatus: LiveReadStatus;
  /** `undefined` when the sample holds nothing for this room. */
  load: WorktreeLoad | undefined;
}

export const NO_LIVE: BuildingLive = {
  sessions: { sessionsByPid: new Map(), listedIn: new Map(), since: new Map() },
  namesByPid: new Map(),
  pulse: { status: 'unsupported', worktrees: new Map(), flashes: new Map(), nowMs: 0 },
  load: { status: 'unsupported', sample: null },
};

/** O(sessions log sessions + steps) for the one room. */
export function roomLiveOf(room: RoomEntry, live: BuildingLive): RoomLive {
  const pulse = live.pulse.worktrees.get(room.key);
  return {
    lines: sessionLinesOf(room, live.sessions),
    pulseStatus: live.pulse.status,
    pulse: pulse && live.pulse.status === 'read' ? pulseFactsOf(pulse, live.pulse.nowMs) : null,
    flash: live.pulse.status === 'read' ? live.pulse.flashes.get(room.key)?.count ?? 0 : 0,
    loadStatus: live.load.status,
    load: live.load.sample?.worktrees[room.key],
  };
}

/** A session line on a room's screen is this tall: a caption's height, under the commit rows' own. */
export const SESSION_LINE_H = 20;

/** The session lines a stage room's screen lists under its branch: none for one session, whose name the bezel carries. */
export function screenSessionLines(lines: readonly SessionLine[]): { lines: SessionLine[]; more: number } {
  return lines.length < 2 ? { lines: [], more: 0 } : shownSessionLines(lines);
}

/** The screen rows its lists keep once the session lines (and their "more" line) take their height. */
export function listRowsBeside(rows: number, sessionLineCount: number): number {
  return Math.max(0, rows - Math.ceil((sessionLineCount * SESSION_LINE_H) / SCREEN_ROW_H));
}
