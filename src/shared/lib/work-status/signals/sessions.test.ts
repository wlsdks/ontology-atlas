import { describe, expect, it } from 'vitest';
import type { AgentSessionRow, WorkStatusSnapshot, WorktreeRow } from '../tauri-work-status';
import { buildWorkTracks, planRooms, type WorkTracks } from '../work-tracks';
import { strongestState, withAgentSessions } from './sessions';

const NOW_MS = 1_795_300_000_000;

function row(id: string, pids: number[] = [], patch: Partial<WorktreeRow> = {}): WorktreeRow {
  return {
    id,
    path: `/repo/.claude/worktrees/${id}`,
    branch: `feat/${id}`,
    head: 'abc',
    mainCheckout: false,
    missing: false,
    standing: 'ahead',
    ahead: 2,
    lastCommitAt: NOW_MS / 1000 - 600,
    lastCommitAuthor: 'stark',
    lock: null,
    acpPid: null,
    agentProcesses: pids.map(pid => ({ pid, tool: 'claudeCode' as const, startedAt: pid })),
    ...patch,
  };
}

function tracksOf(worktrees: WorktreeRow[]): WorkTracks {
  const snapshot: WorkStatusSnapshot = { status: 'ready', root: '/repo', repository: 'owner/repo', host: 'github.com', baseBranch: 'main', worktrees };
  return buildWorkTracks(snapshot);
}

const said = (worktreeId: string, pid: number, state: AgentSessionRow['state']): AgentSessionRow => ({ worktreeId, pid, state });
const stateOf = (tracks: WorkTracks, key: string) =>
  [...planRooms(tracks, NOW_MS).stage, ...planRooms(tracks, NOW_MS).floors.flatMap(floor => floor.rooms)].find(room => room.key === key)?.state;

describe('strongestState', () => {
  it('lets a wait speak over work, and work over a finished reply', () => {
    expect(strongestState([])).toBeNull();
    expect(strongestState(['replied', 'working'])).toBe('working');
    expect(strongestState(['working', 'waitingAnswer', 'replied'])).toBe('waitingAnswer');
    expect(strongestState(['waitingAnswer', 'waitingApproval'])).toBe('waitingApproval');
    expect(strongestState(['failed', 'working'])).toBe('failed');
  });
});

describe('withAgentSessions', () => {
  it('gives each room what the session standing in it says', () => {
    const tracks = withAgentSessions(tracksOf([row('asks', [1]), row('answers', [2]), row('done', [3]), row('busy', [4]), row('broke', [5]), row('silent', [6])]), [
      said('asks', 1, 'waitingApproval'),
      said('answers', 2, 'waitingAnswer'),
      said('done', 3, 'replied'),
      said('busy', 4, 'working'),
      said('broke', 5, 'failed'),
    ]);
    expect(stateOf(tracks, 'asks')).toEqual({ kind: 'waiting', on: 'approval' });
    expect(stateOf(tracks, 'answers')).toEqual({ kind: 'waiting', on: 'answer' });
    expect(stateOf(tracks, 'done')).toEqual({ kind: 'replied' });
    expect(stateOf(tracks, 'busy')).toMatchObject({ kind: 'working' });
    expect(stateOf(tracks, 'broke')).toEqual({ kind: 'sessionFailed' });
    // A session the list says nothing of keeps the words it had.
    expect(stateOf(tracks, 'silent')).toMatchObject({ kind: 'working' });
  });

  it('keeps a room at work while another tool works beside a session that has replied', () => {
    const shared = row('shared', [1], { agentProcesses: [{ pid: 1, tool: 'claudeCode', startedAt: 1 }, { pid: 9, tool: 'codex', startedAt: 9 }] });
    expect(stateOf(withAgentSessions(tracksOf([shared]), [said('shared', 1, 'replied')]), 'shared')).toMatchObject({ kind: 'working' });
  });

  it('changes no room whose program is not seen in the folder', () => {
    const tracks = withAgentSessions(tracksOf([row('empty')]), [said('empty', 1, 'waitingApproval')]);
    expect(stateOf(tracks, 'empty')).toMatchObject({ kind: 'unheld' });
  });

  it('returns the same tracks when no state changed, and the same track where its state did not', () => {
    const tracks = tracksOf([row('a', [1]), row('b', [2])]);
    expect(withAgentSessions(tracks, [])).toBe(tracks);
    const once = withAgentSessions(tracks, [said('a', 1, 'waitingAnswer')]);
    const twice = withAgentSessions(once, [said('a', 1, 'waitingAnswer')]);
    expect(twice).toBe(once);
    const moved = withAgentSessions(once, [said('a', 1, 'working')]);
    const track = (from: WorkTracks, key: string) => from.sessions.flatMap(session => session.tracks).find(each => each.key === key);
    expect(track(moved, 'b')).toBe(track(once, 'b'));
    expect(track(moved, 'a')?.agentState).toBe('working');
  });
});

describe('planRooms with waiting sessions', () => {
  it('admits a waiting room before running work, in its own place, and counts it on its floor', () => {
    const rows = Array.from({ length: 8 }, (_, index) => row(`w${index}`, [100 + index]));
    const plain = planRooms(tracksOf(rows), NOW_MS);
    expect(plain.stage.map(room => room.key)).not.toContain('w7');
    const tracks = withAgentSessions(tracksOf(rows), [said('w7', 107, 'waitingApproval')]);
    const plan = planRooms(tracks, NOW_MS);
    expect(plan.stage).toHaveLength(6);
    expect(plan.stage.at(-1)).toMatchObject({ key: 'w7', tier: 'attention', state: { kind: 'waiting', on: 'approval' } });
    const floor = plan.floors.find(each => each.session?.tracks.some(track => track.key === 'w7'));
    expect(floor).toMatchObject({ waiting: 1, attention: 0 });
  });

  it('says a session waits even where an ended session left its lock, and admits it to the stage', () => {
    const lockLeft = { state: 'stale' as const, tool: 'claudeCode' as const, agentId: 'a1', pid: 900, sessionStartedAt: 1, lockedAt: 10 };
    const rows = [...Array.from({ length: 7 }, (_, index) => row(`w${index}`, [100 + index])), row('left', [200], { lock: lockLeft })];
    expect(stateOf(tracksOf(rows), 'left')).toMatchObject({ kind: 'lockLeft' });

    const plan = planRooms(withAgentSessions(tracksOf(rows), [said('left', 200, 'waitingAnswer')]), NOW_MS);
    expect(plan.stage.find(room => room.key === 'left')).toMatchObject({ state: { kind: 'waiting', on: 'answer' } });
  });

  it('holds a replied room as idle: it fills a row, never before running work', () => {
    const tracks = withAgentSessions(tracksOf([row('done', [1]), row('runs', [2])]), [said('done', 1, 'replied')]);
    const plan = planRooms(tracks, NOW_MS);
    expect(plan.stage.map(room => [room.key, room.tier])).toEqual([['done', 'held'], ['runs', 'working']]);
  });
});
