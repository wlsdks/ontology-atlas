import type { AgentSessionRow, AgentSessionState } from '../tauri-work-status';
import type { Track, WorkTracks } from '../work-tracks';

/** Weakest first: of the sessions standing in one folder, the room's own state is the strongest's. */
const BY_STRENGTH: readonly AgentSessionState[] = ['replied', 'working', 'failed', 'waitingAnswer', 'waitingApproval'];

/** What a folder's room says for the sessions standing in it; `null` with none. */
export function strongestState(states: readonly AgentSessionState[]): AgentSessionState | null {
  return states.reduce<AgentSessionState | null>(
    (strongest, state) => (strongest === null || BY_STRENGTH.indexOf(state) > BY_STRENGTH.indexOf(strongest) ? state : strongest),
    null,
  );
}

const sameRows = (a: readonly AgentSessionRow[], b: readonly AgentSessionRow[]) =>
  a.length === b.length && a.every((row, index) => row.pid === b[index].pid && row.state === b[index].state && (row.name ?? null) === (b[index].name ?? null));

/**
 * The tracks with what each folder's Claude Code sessions say of themselves: every session's own
 * row, and the strongest state for the room. A track whose sessions did not change keeps its
 * object, so a read that changes nothing redraws nothing. O(rows + tracks).
 */
export function withAgentSessions(tracks: WorkTracks, rows: readonly AgentSessionRow[]): WorkTracks {
  const rowsByWorktree = new Map<string, AgentSessionRow[]>();
  for (const row of rows) {
    const standing = rowsByWorktree.get(row.worktreeId);
    if (standing) standing.push(row);
    else rowsByWorktree.set(row.worktreeId, [row]);
  }
  let changed = false;
  const join = (track: Track): Track => {
    const said = rowsByWorktree.get(track.key) ?? [];
    if (sameRows(said, track.sessionsSaid)) return track;
    changed = true;
    return { ...track, agentState: strongestState(said.map(row => row.state)), sessionsSaid: said };
  };
  const joined = {
    ...tracks,
    stuck: tracks.stuck.map(join),
    sessions: tracks.sessions.map(session => ({ ...session, tracks: session.tracks.map(join) })),
    unheld: tracks.unheld.map(join),
    merged: tracks.merged.map(join),
  };
  return changed ? joined : tracks;
}
