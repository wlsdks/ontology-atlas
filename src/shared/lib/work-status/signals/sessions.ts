import type { AgentSessionRow, AgentSessionState } from '../tauri-work-status';
import type { Track, WorkTracks } from '../work-tracks';

/** Weakest first: of the sessions standing in one folder, the room says what the strongest says. */
const BY_STRENGTH: readonly AgentSessionState[] = ['replied', 'working', 'failed', 'waitingAnswer', 'waitingApproval'];

/** What a folder's room says for the sessions standing in it; `null` with none. */
export function strongestState(states: readonly AgentSessionState[]): AgentSessionState | null {
  return states.reduce<AgentSessionState | null>(
    (strongest, state) => (strongest === null || BY_STRENGTH.indexOf(state) > BY_STRENGTH.indexOf(strongest) ? state : strongest),
    null,
  );
}

/**
 * The tracks with what each folder's Claude Code sessions say of themselves. A track whose state
 * did not change keeps its object, so a read that changes nothing redraws nothing. O(rows + tracks).
 */
export function withAgentSessions(tracks: WorkTracks, rows: readonly AgentSessionRow[]): WorkTracks {
  const statesByWorktree = new Map<string, AgentSessionState[]>();
  for (const row of rows) statesByWorktree.set(row.worktreeId, [...(statesByWorktree.get(row.worktreeId) ?? []), row.state]);
  let changed = false;
  const join = (track: Track): Track => {
    const state = strongestState(statesByWorktree.get(track.key) ?? []);
    if (state === track.agentState) return track;
    changed = true;
    return { ...track, agentState: state };
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
