import type { AgentTool, LockTool, WorkStatusSnapshot, WorktreeRow, WorktreeStanding } from './tauri-work-status';

/** Who holds a worktree, as far as Git, the pids its lock names and the agent programs running in it can say. */
export type TrackHolder =
  | { kind: 'subagent'; tool: LockTool; agentId: string | null; lockedAt: number | null }
  | { kind: 'acp' }
  | { kind: 'process'; tool: AgentTool }
  | { kind: 'locked'; lockedAt: number | null }
  | { kind: 'ended'; tool: LockTool }
  | { kind: 'none'; lastCommitAt: number | null; author: string | null };

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
  sessionKey: string | null;
  /** An agent program, a command it runs, or an Atlas agent session is at work in the folder now. */
  running: boolean;
  /** Every agent tool seen at work in the folder, the lock's first; two means their changes can mix. */
  tools: SessionTool[];
  /** Seconds since the epoch. */
  lastCommitAt: number | null;
  /** Milliseconds since the epoch: when a live or unreadable lock was taken. */
  lockedAt: number | null;
}

export type SessionTool = LockTool | AgentTool | 'acp';

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
  worktreeCount: number;
}

export const SESSION_INK_COUNT = 5;

const CONVENTIONAL_PREFIX_SEPARATOR = '/';
const PROCESS_SESSION_PREFIX = 'process:';

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
  const process = row.agentProcesses[0];
  if (process) return { kind: 'process', tool: process.tool };
  if (lock?.state === 'unparsed') return { kind: 'locked', lockedAt: lock.lockedAt };
  return { kind: 'none', lastCommitAt: row.lastCommitAt, author: row.lastCommitAuthor };
}

function lockSessionKey(row: WorktreeRow): string | null {
  const lock = row.lock;
  return lock?.state === 'live' && lock.pid !== null ? `lock:${lock.tool}:${lock.pid}:${lock.sessionStartedAt ?? ''}` : null;
}

/** A process an agent locked worktrees from joins that lock's session, so one program is one session. */
function sessionKeyOf(row: WorktreeRow, lockKeysByPid: ReadonlyMap<number, string>): string | null {
  const lockKey = lockSessionKey(row);
  if (lockKey) return lockKey;
  // A lock an ended session left stays stuck whoever runs a command there.
  if (row.lock?.state === 'stale') return null;
  if (row.acpPid !== null) return `acp:${row.acpPid}`;
  const process = row.agentProcesses[0];
  if (!process) return null;
  return lockKeysByPid.get(process.pid) ?? `${PROCESS_SESSION_PREFIX}${process.tool}:${process.pid}:${process.startedAt ?? ''}`;
}

/** A live session keeps its rows under it even once merged: the session is still in that folder. */
function placeOf(row: WorktreeRow, holder: TrackHolder, sessionKey: string | null): TrackPlace {
  if (row.missing) return 'stuck';
  if (sessionKey) return 'session';
  if (row.standing === 'merged') return 'merged';
  if (holder.kind === 'ended') return 'stuck';
  return 'unheld';
}

function toolsOf(row: WorktreeRow): SessionTool[] {
  const tools: SessionTool[] = [];
  if (row.lock?.state === 'live') tools.push(row.lock.tool);
  if (row.acpPid !== null) tools.push('acp');
  for (const process of row.agentProcesses) tools.push(process.tool);
  return [...new Set(tools)];
}

function toTrack(row: WorktreeRow, lockKeysByPid: ReadonlyMap<number, string>): Track {
  const holder = holderOf(row);
  const sessionKey = sessionKeyOf(row, lockKeysByPid);
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
    sessionKey,
    running: !row.missing && (row.acpPid !== null || row.agentProcesses.length > 0),
    tools: toolsOf(row),
    lastCommitAt: row.lastCommitAt,
    lockedAt: row.lock && row.lock.state !== 'stale' ? row.lock.lockedAt : null,
  };
}

const byLockTime = (a: Track, b: Track) => lockTime(a) - lockTime(b) || a.key.localeCompare(b.key);
const lockTime = (track: Track) => (track.holder.kind === 'subagent' ? track.holder.lockedAt ?? 0 : 0);
const byRecentCommit = (a: Track, b: Track) => commitTime(b) - commitTime(a) || a.key.localeCompare(b.key);
const commitTime = (track: Track) => track.lastCommitAt ?? 0;

/**
 * Groups rows the way the board draws them: stuck first, then each session with the worktrees it
 * holds, then worktrees nobody holds, then merged ones. The main checkout is the board's trunk, and a
 * row only while an agent works in it. Sessions keep their order by start time, so each keeps its
 * ink while it lives.
 */
export function buildWorkTracks(snapshot: WorkStatusSnapshot): WorkTracks {
  const rows = snapshot.worktrees.filter(row => !row.mainCheckout || row.acpPid !== null || row.agentProcesses.length > 0);
  const lockKeysByPid = new Map<number, string>();
  for (const row of rows) {
    const key = lockSessionKey(row);
    if (key && row.lock?.pid != null) lockKeysByPid.set(row.lock.pid, key);
  }
  const tracks = rows.map(row => toTrack(row, lockKeysByPid));
  const sessionsByKey = new Map<string, TrackSession>();
  rows.forEach((row, index) => {
    const track = tracks[index];
    if (track.place !== 'session' || !track.sessionKey) return;
    const existing = sessionsByKey.get(track.sessionKey);
    if (existing) existing.tracks.push(track);
    else sessionsByKey.set(track.sessionKey, {
      key: track.sessionKey,
      ...sessionOrigin(row),
      ordinal: 0,
      ink: 0,
      tracks: [track],
    });
  });
  const sessionsPerTool = new Map<SessionTool, number>();
  // Sessions seen only by their processes come and go with commands, so they sort after the
  // others and never shift a held session's ink.
  const sessions = [...sessionsByKey.values()]
    .sort((a, b) => Number(isProcessOnly(a)) - Number(isProcessOnly(b))
      || (a.startedAt ?? Number.MAX_SAFE_INTEGER) - (b.startedAt ?? Number.MAX_SAFE_INTEGER)
      || a.key.localeCompare(b.key))
    .map((session, index) => {
      const ordinal = (sessionsPerTool.get(session.tool) ?? 0) + 1;
      sessionsPerTool.set(session.tool, ordinal);
      return { ...session, ordinal, ink: index % SESSION_INK_COUNT, tracks: [...session.tracks].sort(byLockTime) };
    });
  return {
    stuck: tracks.filter(track => track.place === 'stuck'),
    sessions,
    unheld: tracks.filter(track => track.place === 'unheld').sort(byRecentCommit),
    merged: tracks.filter(track => track.place === 'merged'),
    worktreeCount: snapshot.worktrees.length,
  };
}

const isProcessOnly = (session: TrackSession) => session.key.startsWith(PROCESS_SESSION_PREFIX);

function sessionOrigin(row: WorktreeRow): { tool: SessionTool; startedAt: number | null } {
  if (row.lock?.state === 'live') return { tool: row.lock.tool, startedAt: row.lock.sessionStartedAt };
  if (row.acpPid !== null) return { tool: 'acp', startedAt: null };
  const process = row.agentProcesses[0];
  return process ? { tool: process.tool, startedAt: process.startedAt } : { tool: 'acp', startedAt: null };
}

/**
 * What a room shows for one worktree, from what Atlas reads today. A kind a later slice reads
 * (an approval, a pre-push run, CI) joins this union, and every exhaustive switch over it fails to
 * compile until it is drawn.
 */
export type RoomState =
  | { kind: 'working'; tools: readonly SessionTool[] }
  | { kind: 'resting'; quietSinceMs: number | null }
  | { kind: 'dozing'; quietSinceMs: number }
  | { kind: 'merged' }
  | { kind: 'locked' }
  | { kind: 'lockLeft'; tool: LockTool }
  | { kind: 'missing' }
  | { kind: 'unheld'; lastCommitAt: number | null };

export type RoomStateKind = RoomState['kind'];

/** Front-stage priority: what needs a person, then what runs, then what a session holds idle. */
export type RoomTier = 'attention' | 'working' | 'held' | 'unheld';

/** How far a worktree's work has come, as far as Git says today. */
export type RoomStage = 'worktree' | 'commits' | 'main';

export interface RoomEntry {
  key: string;
  track: Track;
  state: RoomState;
  tier: RoomTier;
  stage: RoomStage;
  session: TrackSession | null;
}

export interface RoomFloor {
  /** The session's key, or `none` for worktrees no live session holds. */
  key: string;
  session: TrackSession | null;
  rooms: RoomEntry[];
  /** Every worktree of the floor's session, its rooms on the front stage included. */
  total: number;
  working: number;
  attention: number;
}

export interface RoomPlan {
  stage: RoomEntry[];
  floors: RoomFloor[];
  /** Working rooms that did not fit on the front stage. */
  workingBelow: number;
  shelf: { merged: Track[]; untouched: Track[] };
  worktreeCount: number;
}

export const STAGE_ROOM_LIMIT = 6;
/** A held worktree with nothing seen at work for this long dozes. */
export const DOZE_AFTER_MS = 5 * 60_000;
/** A worktree no session holds and nobody committed to for this long goes onto the shelf. */
export const UNTOUCHED_AFTER_MS = 7 * 24 * 60 * 60_000;
export const NO_SESSION_FLOOR = 'none';

const TIER_ORDER: Record<RoomTier, number> = { attention: 0, working: 1, held: 2, unheld: 3 };

/**
 * The last sign of work in a held worktree: its lock, its last commit, or the last read that saw
 * something running in it.
 */
function quietSince(track: Track, seenRunningAt: ReadonlyMap<string, number>): number | null {
  const signs = [track.lockedAt, track.lastCommitAt === null ? null : track.lastCommitAt * 1000, seenRunningAt.get(track.key) ?? null]
    .filter((sign): sign is number => sign !== null);
  return signs.length > 0 ? Math.max(...signs) : null;
}

export function roomStateOf(track: Track, nowMs: number, seenRunningAt: ReadonlyMap<string, number> = new Map()): RoomState {
  if (track.missing) return { kind: 'missing' };
  if (track.holder.kind === 'ended') return { kind: 'lockLeft', tool: track.holder.tool };
  if (track.running) return { kind: 'working', tools: track.tools };
  if (track.place !== 'session' && track.holder.kind !== 'locked') return { kind: 'unheld', lastCommitAt: track.lastCommitAt };
  if (track.standing === 'merged') return { kind: 'merged' };
  if (track.holder.kind === 'locked') return { kind: 'locked' };
  const since = quietSince(track, seenRunningAt);
  return since !== null && nowMs - since >= DOZE_AFTER_MS ? { kind: 'dozing', quietSinceMs: since } : { kind: 'resting', quietSinceMs: since };
}

export function tierOf(state: RoomState): RoomTier {
  switch (state.kind) {
    case 'missing':
    case 'lockLeft':
      return 'attention';
    case 'working':
      return 'working';
    case 'resting':
    case 'dozing':
    case 'merged':
    case 'locked':
      return 'held';
    case 'unheld':
      return 'unheld';
  }
}

export function stageOf(track: Track): RoomStage {
  if (track.missing) return 'worktree';
  if (track.standing === 'merged') return 'main';
  return track.standing === 'ahead' ? 'commits' : 'worktree';
}

/**
 * Sorts every worktree into the building: at most six rooms on the front stage (what needs a
 * person, then what runs, then what a session holds idle), one floor per session for the rest
 * plus one for worktrees no session holds, and the shelf for merged and long-untouched ones.
 * Within a tier, rooms keep the order the tracks already have: stuck as Git lists them, sessions
 * by start, a session's worktrees by lock time.
 */
export function planRooms(
  tracks: WorkTracks,
  nowMs: number,
  seenRunningAt: ReadonlyMap<string, number> = new Map(),
  /** How many large rooms the front stage has room for; never more than six. */
  stageLimit: number = STAGE_ROOM_LIMIT,
): RoomPlan {
  const entry = (track: Track, session: TrackSession | null): RoomEntry => {
    const state = roomStateOf(track, nowMs, seenRunningAt);
    return { key: track.key, track, state, tier: tierOf(state), stage: stageOf(track), session };
  };
  const untouched = (track: Track) =>
    track.lastCommitAt !== null && nowMs - track.lastCommitAt * 1000 >= UNTOUCHED_AFTER_MS && track.holder.kind === 'none';
  const loose = [...tracks.stuck, ...tracks.unheld.filter(track => !untouched(track))].map(track => entry(track, null));
  const held = tracks.sessions.flatMap(session => session.tracks.map(track => entry(track, session)));
  const all = [...loose, ...held];
  const order = new Map(all.map((room, index) => [room.key, index]));
  const sessionOrder = new Map(tracks.sessions.map((session, index) => [session.key, index]));
  const sourceOrder = (room: RoomEntry) =>
    (room.session ? (sessionOrder.get(room.session.key) ?? 0) * 10_000 : -10_000) + (order.get(room.key) ?? 0);
  const byTier = (a: RoomEntry, b: RoomEntry) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || sourceOrder(a) - sourceOrder(b);

  const stage = all.filter(room => room.tier !== 'unheld').sort(byTier).slice(0, Math.min(stageLimit, STAGE_ROOM_LIMIT));
  const onStage = new Set(stage.map(room => room.key));
  const floorOf = (key: string, session: TrackSession | null, members: RoomEntry[]): RoomFloor => ({
    key,
    session,
    rooms: members.filter(room => !onStage.has(room.key)).sort(byTier),
    total: members.length,
    working: members.filter(room => room.tier === 'working').length,
    attention: members.filter(room => room.tier === 'attention').length,
  });
  const floors = [
    ...tracks.sessions.map(session => floorOf(session.key, session, held.filter(room => room.session === session))),
    floorOf(NO_SESSION_FLOOR, null, loose),
  ].filter(floor => floor.rooms.length > 0);

  return {
    stage,
    floors,
    workingBelow: floors.reduce((sum, floor) => sum + floor.rooms.filter(room => room.tier === 'working').length, 0),
    shelf: {
      merged: [...tracks.merged].sort((a, b) => (b.lastCommitAt ?? 0) - (a.lastCommitAt ?? 0)),
      untouched: tracks.unheld.filter(untouched),
    },
    worktreeCount: tracks.worktreeCount,
  };
}
