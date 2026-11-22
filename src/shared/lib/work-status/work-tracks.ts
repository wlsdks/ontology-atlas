import type { LockTool, WorkStatusSnapshot, WorktreeRow, WorktreeStanding } from './tauri-work-status';

/** Who holds a worktree, as far as Git and the pids its lock names can say. */
export type TrackHolder =
  | { kind: 'subagent'; tool: LockTool; agentId: string | null; lockedAt: number | null }
  | { kind: 'acp' }
  | { kind: 'locked'; lockedAt: number | null }
  | { kind: 'ended'; tool: LockTool }
  | { kind: 'none'; lastCommitAt: number | null; author: string | null };

/** Where the head dot sits on the shared ruler. Slice 1 knows only these three stations. */
export type TrackStation = 'start' | 'working' | 'main';

export type TrackPlace = 'stuck' | 'session' | 'unheld' | 'merged';

export interface Track {
  key: string;
  title: string;
  branch: string | null;
  path: string;
  standing: WorktreeStanding;
  ahead: number | null;
  missing: boolean;
  holder: TrackHolder;
  place: TrackPlace;
  station: TrackStation;
  sessionKey: string | null;
}

export type SessionTool = LockTool | 'acp';

export interface TrackSession {
  key: string;
  tool: SessionTool;
  startedAt: number | null;
  /** 1 for the tool's oldest live session, 2 for its next: what tells two sessions of one tool apart. */
  ordinal: number;
  /** Index into the session ink ramp, stable while the session lives. */
  ink: number;
  tracks: Track[];
}

export interface WorkTracks {
  stuck: Track[];
  sessions: TrackSession[];
  unheld: Track[];
  merged: Track[];
  counts: { running: number; stuck: number };
  worktreeCount: number;
}

export const SESSION_INK_COUNT = 5;

const CONVENTIONAL_PREFIX_SEPARATOR = '/';

/** The last folder of a path, on either separator: how a worktree or repository is named in a sentence. */
export function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** `feat/library-first-run-stage` → `library first run stage`: the branch read aloud. */
export function branchTitle(branch: string | null, path: string): string {
  const source = branch ?? folderName(path);
  const segments = source.split(CONVENTIONAL_PREFIX_SEPARATOR);
  const named = segments.length > 1 ? segments.slice(1).join(' ') : source;
  return named.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || source;
}

function holderOf(row: WorktreeRow): TrackHolder {
  const lock = row.lock;
  if (lock?.state === 'stale') return { kind: 'ended', tool: lock.tool };
  if (lock?.state === 'live') return { kind: 'subagent', tool: lock.tool, agentId: lock.agentId, lockedAt: lock.lockedAt };
  if (row.acpPid !== null) return { kind: 'acp' };
  if (lock?.state === 'unparsed') return { kind: 'locked', lockedAt: lock.lockedAt };
  return { kind: 'none', lastCommitAt: row.lastCommitAt, author: row.lastCommitAuthor };
}

function sessionKeyOf(row: WorktreeRow): string | null {
  const lock = row.lock;
  if (lock?.state === 'live' && lock.pid !== null) return `lock:${lock.tool}:${lock.pid}:${lock.sessionStartedAt ?? ''}`;
  if (row.acpPid !== null) return `acp:${row.acpPid}`;
  return null;
}

/** A live session keeps its rows under it even once merged: the session is still in that folder. */
function placeOf(row: WorktreeRow, holder: TrackHolder, sessionKey: string | null): TrackPlace {
  if (row.missing) return 'stuck';
  if (sessionKey) return 'session';
  if (row.standing === 'merged') return 'merged';
  if (holder.kind === 'ended') return 'stuck';
  return 'unheld';
}

/** A missing folder has no working tree to place on the ruler, so its head stays at the start. */
function stationOf(row: WorktreeRow): TrackStation {
  if (row.missing) return 'start';
  if (row.standing === 'merged') return 'main';
  if (row.standing === 'ahead') return 'working';
  return 'start';
}

function toTrack(row: WorktreeRow): Track {
  const holder = holderOf(row);
  const sessionKey = sessionKeyOf(row);
  return {
    key: row.id,
    title: row.mainCheckout ? folderName(row.path) : branchTitle(row.branch, row.path),
    branch: row.branch,
    path: row.path,
    standing: row.standing,
    ahead: row.ahead,
    missing: row.missing,
    holder,
    place: placeOf(row, holder, sessionKey),
    station: stationOf(row),
    sessionKey,
  };
}

const byLockTime = (a: Track, b: Track) => lockTime(a) - lockTime(b) || a.key.localeCompare(b.key);
const lockTime = (track: Track) => (track.holder.kind === 'subagent' ? track.holder.lockedAt ?? 0 : 0);
const byRecentCommit = (a: Track, b: Track) => commitTime(b) - commitTime(a) || a.key.localeCompare(b.key);
const commitTime = (track: Track) => (track.holder.kind === 'none' ? track.holder.lastCommitAt ?? 0 : 0);

/**
 * Groups rows the way the board draws them: stuck first, then each session with the worktrees it
 * holds, then worktrees nobody holds, then merged ones. The main checkout is the board's trunk, and a
 * row only while an Atlas agent session works in it. Sessions keep their order by start time, so
 * each keeps its ink while it lives.
 */
export function buildWorkTracks(snapshot: WorkStatusSnapshot): WorkTracks {
  const rows = snapshot.worktrees.filter(row => !row.mainCheckout || row.acpPid !== null);
  const tracks = rows.map(toTrack);
  const sessionsByKey = new Map<string, TrackSession>();
  rows.forEach((row, index) => {
    const track = tracks[index];
    if (track.place !== 'session' || !track.sessionKey) return;
    const existing = sessionsByKey.get(track.sessionKey);
    if (existing) existing.tracks.push(track);
    else sessionsByKey.set(track.sessionKey, {
      key: track.sessionKey,
      tool: row.lock?.state === 'live' ? row.lock.tool : 'acp',
      startedAt: row.lock?.state === 'live' ? row.lock.sessionStartedAt : null,
      ordinal: 0,
      ink: 0,
      tracks: [track],
    });
  });
  const sessionsPerTool = new Map<SessionTool, number>();
  const sessions = [...sessionsByKey.values()]
    .sort((a, b) => (a.startedAt ?? Number.MAX_SAFE_INTEGER) - (b.startedAt ?? Number.MAX_SAFE_INTEGER) || a.key.localeCompare(b.key))
    .map((session, index) => {
      const ordinal = (sessionsPerTool.get(session.tool) ?? 0) + 1;
      sessionsPerTool.set(session.tool, ordinal);
      return { ...session, ordinal, ink: index % SESSION_INK_COUNT, tracks: [...session.tracks].sort(byLockTime) };
    });
  const stuck = tracks.filter(track => track.place === 'stuck');
  return {
    stuck,
    sessions,
    unheld: tracks.filter(track => track.place === 'unheld').sort(byRecentCommit),
    merged: tracks.filter(track => track.place === 'merged'),
    counts: {
      running: sessions.reduce((sum, session) => sum + session.tracks.length, 0),
      stuck: stuck.length,
    },
    worktreeCount: snapshot.worktrees.length,
  };
}

/** The sentence the page leads with: what needs the reader first. */
export type WorkHeadline = { kind: 'stuck' | 'running'; count: number } | { kind: 'idle' };

export function headlineOf(tracks: WorkTracks): WorkHeadline {
  if (tracks.counts.stuck > 0) return { kind: 'stuck', count: tracks.counts.stuck };
  if (tracks.counts.running > 0) return { kind: 'running', count: tracks.counts.running };
  return { kind: 'idle' };
}
