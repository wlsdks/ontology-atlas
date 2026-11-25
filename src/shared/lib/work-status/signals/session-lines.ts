import type { AgentSessionRow, AgentSessionState } from '../tauri-work-status';
import type { RoomEntry, SessionTool, TrackSession } from '../work-tracks';
import { sessionNameOf } from './session-name';

/** Lines a room shows on the screen before `sessionLine.more`. */
export const SESSION_LINES_SHOWN = 3;
/** Lines a room's panel lists at most. */
export const SESSION_LINES_LISTED = 20;

/**
 * What one session line says: its own state from the session list; `workingHere` for a session
 * the list places in another folder that runs commands in this one; `null` when no list speaks for
 * it (the list is off or unreadable, or the tool has none).
 */
export type SessionLineState = AgentSessionState | 'workingHere' | null;

/** Since when a session has said what it says now, as this screen saw it. */
export interface StateSince {
  state: AgentSessionState;
  /** Milliseconds since the epoch; `null` when the session's start is unknown. */
  sinceMs: number | null;
  /** The state was already so when this screen first saw the session, so `sinceMs` is its start. */
  sinceStart: boolean;
}

export interface SessionLine {
  key: string;
  pid: number | null;
  tool: SessionTool;
  /** The session's number among its tool's sessions: `{tool} {number}`; `null` when Atlas holds no session for it. */
  ordinal: number | null;
  ink: number | null;
  /** The name the session's tool gives it; `null` reads `{tool} {number}` alone. */
  name: string | null;
  state: SessionLineState;
  since: StateSince | null;
}

const LINE_ORDER: readonly SessionLineState[] = ['waitingApproval', 'waitingAnswer', 'failed', 'working', 'replied', 'workingHere', null];

const byNeed = (a: SessionLine, b: SessionLine) =>
  LINE_ORDER.indexOf(a.state) - LINE_ORDER.indexOf(b.state) || (a.ordinal ?? Number.MAX_SAFE_INTEGER) - (b.ordinal ?? Number.MAX_SAFE_INTEGER) || a.key.localeCompare(b.key);

/** What the screen needs beyond the room to name its sessions. */
export interface SessionLineContext {
  /** Every live session by the pid of its program. */
  sessionsByPid: ReadonlyMap<number, TrackSession>;
  /** The folder the session list places each listed pid in. */
  listedIn: ReadonlyMap<number, string>;
  since: ReadonlyMap<number, StateSince>;
}

/** The folder the session list places each pid in, for `SessionLineContext.listedIn`. O(rows). */
export function listedFolders(rows: readonly AgentSessionRow[]): Map<number, string> {
  return new Map(rows.map(row => [row.pid, row.worktreeId]));
}

/** Every live session by the pid of its program, for `SessionLineContext.sessionsByPid`. */
export function sessionsByPidOf(sessions: readonly TrackSession[]): Map<number, TrackSession> {
  const byPid = new Map<number, TrackSession>();
  for (const session of sessions) if (session.pid !== null) byPid.set(session.pid, session);
  return byPid;
}

/**
 * One line per session at work in a room, waiting first, then failed, working and replied, then
 * sessions only running commands here, then those no list speaks for. A session speaks only for a
 * folder its program is seen in, as the room's state does. O(sessions log sessions).
 */
export function sessionLinesOf(room: RoomEntry, context: SessionLineContext): SessionLine[] {
  const lines: SessionLine[] = [];
  const said = new Set<number>();
  if (room.track.running) {
    for (const row of room.track.sessionsSaid) {
      said.add(row.pid);
      const session = context.sessionsByPid.get(row.pid);
      lines.push({
        key: session?.key ?? `pid:${row.pid}`,
        pid: row.pid,
        tool: session?.tool ?? 'claudeCode',
        ordinal: session?.ordinal ?? null,
        ink: session?.ink ?? null,
        name: sessionNameOf(row.name),
        state: row.state,
        since: context.since.get(row.pid) ?? null,
      });
    }
  }
  const atWork = [room.session, ...room.guests].filter((session): session is TrackSession => session !== null);
  for (const session of atWork) {
    if (session.pid !== null && said.has(session.pid)) continue;
    const listedElsewhere = session.pid !== null && context.listedIn.has(session.pid);
    lines.push({
      key: session.key,
      pid: session.pid,
      tool: session.tool,
      ordinal: session.ordinal,
      ink: session.ink,
      name: null,
      state: room.track.running && listedElsewhere ? 'workingHere' : null,
      since: null,
    });
  }
  return lines.sort(byNeed);
}

/** The lines a room shows on the screen, and how many more `sessionLine.more` counts. */
export function shownSessionLines(lines: readonly SessionLine[], limit: number = SESSION_LINES_SHOWN): { lines: SessionLine[]; more: number } {
  return { lines: lines.slice(0, limit), more: Math.max(0, lines.length - limit) };
}

/** What a room's bezel calls its sessions: the one session's line, or how many there are. */
export type BezelSessions = { kind: 'none' } | { kind: 'one'; line: SessionLine } | { kind: 'count'; count: number };

export function bezelSessionsOf(lines: readonly SessionLine[]): BezelSessions {
  if (lines.length === 0) return { kind: 'none' };
  return lines.length === 1 ? { kind: 'one', line: lines[0] } : { kind: 'count', count: lines.length };
}

/**
 * Since when each listed session has said what it says now. A session first seen takes its start;
 * a state that changes takes the read that saw it change. A pid no longer listed is dropped. The
 * previous map comes back when nothing changed. O(rows).
 */
export function rememberStateSince(
  previous: ReadonlyMap<number, StateSince>,
  rows: readonly AgentSessionRow[],
  readAtMs: number,
  startedAtMsOf: (pid: number) => number | null,
): ReadonlyMap<number, StateSince> {
  const next = new Map<number, StateSince>();
  let changed = rows.length !== previous.size;
  for (const row of rows) {
    const kept = previous.get(row.pid);
    if (kept && kept.state === row.state) {
      next.set(row.pid, kept);
      continue;
    }
    changed = true;
    next.set(row.pid, kept ? { state: row.state, sinceMs: readAtMs, sinceStart: false } : { state: row.state, sinceMs: startedAtMsOf(row.pid), sinceStart: true });
  }
  return changed ? next : previous;
}
