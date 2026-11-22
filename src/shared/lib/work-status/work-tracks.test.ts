import { describe, expect, it } from 'vitest';
import type { WorkStatusSnapshot, WorktreeRow } from './tauri-work-status';
import { DOZE_AFTER_MS, NO_SESSION_FLOOR, UNTOUCHED_AFTER_MS, branchTitle, buildWorkTracks, keepSessionIdentity, planRooms, stageOf } from './work-tracks';

function row(id: string, patch: Partial<WorktreeRow> = {}): WorktreeRow {
  return {
    id,
    path: `/repo/.claude/worktrees/${id}`,
    branch: `feat/${id}`,
    head: 'abc',
    mainCheckout: false,
    missing: false,
    standing: 'ahead',
    ahead: 2,
    lastCommitAt: 1_795_260_000,
    lastCommitAuthor: 'stark',
    lock: null,
    acpPid: null,
    agentProcesses: [],
    ...patch,
  };
}

const live = (pid: number, startedAt: number, lockedAt: number) => ({
  state: 'live' as const, tool: 'claudeCode' as const, agentId: `a${lockedAt}`, pid, sessionStartedAt: startedAt, lockedAt,
});

function snapshot(worktrees: WorktreeRow[]): WorkStatusSnapshot {
  return { status: 'ready', root: '/repo', repository: 'owner/repo', host: 'github.com', baseBranch: 'main', worktrees };
}

describe('branchTitle', () => {
  it.each([
    ['feat/library-first-run-stage', 'library first run stage'],
    ['integration/library-2026-11-21', 'library 2026 11 21'],
    ['work-status-slice1', 'work status slice1'],
    ['fix/a/b_c', 'a b c'],
  ])('reads %s aloud', (branch, title) => {
    expect(branchTitle(branch, '/repo/x')).toBe(title);
  });

  it('names a detached worktree after its folder', () => {
    expect(branchTitle(null, '/repo/.claude/worktrees/agent-a1b2')).toBe('agent a1b2');
  });
});

describe('buildWorkTracks', () => {
  it('shows a worktree Codex works in under a Codex session, with the main checkout it also works in', () => {
    const codex = { pid: 300, tool: 'codex' as const, startedAt: 3_000 };
    const tracks = buildWorkTracks(snapshot([
      row('main', { mainCheckout: true, standing: 'base', branch: 'main', agentProcesses: [codex] }),
      row('codex-wt', { agentProcesses: [codex] }),
      row('idle'),
    ]));
    expect(tracks.sessions).toHaveLength(1);
    expect(tracks.sessions[0]).toMatchObject({ tool: 'codex', startedAt: 3_000 });
    expect(tracks.sessions[0].tracks.map(track => track.key).sort()).toEqual(['codex-wt', 'main']);
    expect(tracks.sessions[0].tracks[0].holder).toEqual({ kind: 'process', tool: 'codex' });
    expect(tracks.unheld.map(track => track.key)).toEqual(['idle']);
  });

  it('keeps a lock an ended session left stuck while an agent runs a command in it', () => {
    const tracks = buildWorkTracks(snapshot([
      row('left', { lock: { ...live(100, 1_000, 10), state: 'stale' }, agentProcesses: [{ pid: 300, tool: 'codex', startedAt: 3_000 }] }),
    ]));
    expect(tracks.stuck.map(track => track.key)).toEqual(['left']);
    expect(tracks.sessions).toEqual([]);
  });

  it('orders a session seen only by its processes after a locking session, whoever started first', () => {
    const tracks = buildWorkTracks(snapshot([
      row('codex-wt', { agentProcesses: [{ pid: 300, tool: 'codex', startedAt: 1 }] }),
      row('locked', { lock: live(100, 1_000, 10) }),
    ]));
    expect(tracks.sessions.map(session => session.tool)).toEqual(['claudeCode', 'codex']);
    expect(tracks.sessions.map(session => session.ink)).toEqual([0, 1]);
  });

  it('counts a Claude Code session once when it both locks a worktree and runs commands in another', () => {
    const tracks = buildWorkTracks(snapshot([
      row('locked', { lock: live(100, 1_000, 10) }),
      row('commands', { agentProcesses: [{ pid: 100, tool: 'claudeCode', startedAt: 1_001 }] }),
    ]));
    expect(tracks.sessions.map(session => session.tracks.map(track => track.key).sort())).toEqual([['commands', 'locked']]);
  });

  it('groups locked rows under the session their pid and start name, oldest session first', () => {
    const tracks = buildWorkTracks(snapshot([
      row('main', { mainCheckout: true, standing: 'base', branch: 'main' }),
      row('late', { lock: live(200, 2_000, 30) }),
      row('first', { lock: live(100, 1_000, 20) }),
      row('second', { lock: live(100, 1_000, 10) }),
      row('reused-pid', { lock: live(100, 1_500, 40) }),
    ]));
    expect(tracks.sessions.map(session => session.tracks.map(track => track.key))).toEqual([['second', 'first'], ['reused-pid'], ['late']]);
    expect(tracks.sessions.map(session => session.ink)).toEqual([0, 1, 2]);
    expect(tracks.sessions.map(session => session.ordinal)).toEqual([1, 2, 3]);
    expect(tracks.worktreeCount).toBe(5);
  });

  it('raises a missing folder and an ended holder into Stuck and folds merged rows', () => {
    const tracks = buildWorkTracks(snapshot([
      row('gone', { missing: true, lock: live(1, 1, 1) }),
      row('ended', { lock: { ...live(9, 9, 9), state: 'stale' } }),
      row('merged', { standing: 'merged', ahead: 0 }),
      row('fresh', { standing: 'noCommits', ahead: 0 }),
    ]));
    expect(tracks.stuck.map(track => [track.key, stageOf(track)])).toEqual([['gone', 'worktree'], ['ended', 'commits']]);
    expect(tracks.merged.map(track => [track.key, stageOf(track)])).toEqual([['merged', 'main']]);
    expect(tracks.unheld.map(track => [track.key, stageOf(track)])).toEqual([['fresh', 'worktree']]);
    expect(tracks.sessions).toEqual([]);
  });

  it('counts an unparsed lock as held but places it with no session', () => {
    const tracks = buildWorkTracks(snapshot([
      row('by-hand', { lock: { state: 'unparsed', tool: 'unknown', agentId: null, pid: null, sessionStartedAt: null, lockedAt: 5 } }),
    ]));
    expect(tracks.unheld[0].holder).toEqual({ kind: 'locked', lockedAt: 5 });
  });

  it('keeps a merged worktree a live session still holds under that session', () => {
    const tracks = buildWorkTracks(snapshot([row('held-merged', { standing: 'merged', ahead: 0, lock: live(1, 1, 2) })]));
    expect(tracks.merged).toEqual([]);
    expect(tracks.sessions).toMatchObject([{ tracks: [{ key: 'held-merged', standing: 'merged' }] }]);
  });

  it('draws the main checkout only while an Atlas agent session works in it', () => {
    const main = { mainCheckout: true, standing: 'base' as const, branch: 'main', path: '/repo' };
    expect(buildWorkTracks(snapshot([row('main', main)])).sessions).toEqual([]);
    const tracks = buildWorkTracks(snapshot([row('main', { ...main, acpPid: 77 })]));
    expect(tracks.sessions).toMatchObject([{ tool: 'acp', tracks: [{ key: 'main', title: 'repo', running: true }] }]);
  });

  it('puts a worktree an Atlas agent session works in under that session', () => {
    const tracks = buildWorkTracks(snapshot([row('chat', { acpPid: 77 })]));
    expect(tracks.sessions).toMatchObject([{ key: 'acp:77', tool: 'acp', tracks: [{ key: 'chat', holder: { kind: 'acp' } }] }]);
  });

  it('numbers the sessions of each tool on their own, so two of one tool never share a name', () => {
    const tracks = buildWorkTracks(snapshot([
      row('code-late', { lock: live(200, 2_000, 30) }),
      row('chat', { acpPid: 77 }),
      row('code-first', { lock: live(100, 1_000, 20) }),
    ]));
    expect(tracks.sessions.map(session => [session.tool, session.ordinal])).toEqual([['claudeCode', 1], ['claudeCode', 2], ['acp', 1]]);
  });
});

describe('planRooms', () => {
  const NOW_MS = 1_795_300_000_000;
  const recent = Math.floor(NOW_MS / 1000) - 600;
  const working = (pid: number) => ({ agentProcesses: [{ pid, tool: 'claudeCode' as const, startedAt: 1_000 }] });
  const plan = (rows: WorktreeRow[], seen?: Map<string, number>) => planRooms(buildWorkTracks(snapshot(rows)), NOW_MS, seen);
  const keys = (rooms: { key: string }[]) => rooms.map(room => room.key);

  it('fills the front stage with what needs a person, then what runs, then what a session holds idle', () => {
    const rooms = plan([
      row('idle', { lock: live(100, 1_000, NOW_MS - 60_000), lastCommitAt: recent }),
      row('runs', { lock: live(100, 1_000, NOW_MS - 50_000), ...working(100) }),
      row('ended', { lock: { ...live(9, 9, 9), state: 'stale' } }),
      row('nobody', { lastCommitAt: recent }),
    ]);
    expect(keys(rooms.stage)).toEqual(['ended', 'runs', 'idle']);
    expect(rooms.stage.map(room => room.state.kind)).toEqual(['lockLeft', 'working', 'resting']);
    expect(rooms.floors.map(floor => [floor.key, keys(floor.rooms)])).toEqual([[NO_SESSION_FLOOR, ['nobody']]]);
  });

  it('keeps at most six rooms on the stage and counts the working rooms left on the floors', () => {
    const rows = Array.from({ length: 9 }, (_, index) => row(`w${index}`, { lock: live(100, 1_000, index + 1), ...working(100) }));
    const rooms = plan([...rows, row('idle', { lock: live(100, 1_000, 99) })]);
    expect(rooms.stage).toHaveLength(6);
    expect(rooms.workingBelow).toBe(3);
    expect(rooms.floors).toHaveLength(1);
    expect(rooms.floors[0]).toMatchObject({ total: 10, working: 9, attention: 0 });
    expect(keys(rooms.floors[0].rooms)).toEqual(['w6', 'w7', 'w8', 'idle']);
  });

  it('dozes a held worktree after five quiet minutes, counting the last time a read saw it work', () => {
    const quiet = NOW_MS - DOZE_AFTER_MS - 1_000;
    const held = row('held', { lock: live(100, 1_000, quiet), lastCommitAt: Math.floor(quiet / 1000) });
    expect(plan([held]).stage[0].state).toEqual({ kind: 'dozing', quietSinceMs: quiet });
    const seen = new Map([['held', NOW_MS - 60_000]]);
    expect(plan([held], seen).stage[0].state).toEqual({ kind: 'resting', quietSinceMs: NOW_MS - 60_000 });
  });

  it('names both tools when two work in one folder', () => {
    const rooms = plan([row('both', { lock: live(100, 1_000, 5), agentProcesses: [{ pid: 300, tool: 'codex', startedAt: 2 }] })]);
    expect(rooms.stage[0].state).toEqual({ kind: 'working', tools: ['claudeCode', 'codex'] });
  });

  it('shelves merged worktrees and ones nobody touched for a week, never a held one', () => {
    const old = Math.floor((NOW_MS - UNTOUCHED_AFTER_MS) / 1000) - 60;
    const rooms = plan([
      row('merged', { standing: 'merged', ahead: 0 }),
      row('held-merged', { standing: 'merged', ahead: 0, lock: live(1, 1, 2) }),
      row('dusty', { lastCommitAt: old }),
      row('held-dusty', { lastCommitAt: old, lock: live(1, 1, 3) }),
    ]);
    expect(keys(rooms.shelf.merged)).toEqual(['merged']);
    expect(keys(rooms.shelf.untouched)).toEqual(['dusty']);
    expect(rooms.stage.map(room => [room.key, room.state.kind, room.stage])).toEqual([['held-merged', 'merged', 'main'], ['held-dusty', 'dozing', 'commits']]);
  });

  it('puts a missing folder first even when a session holds it', () => {
    const rooms = plan([row('runs', working(100)), row('gone', { missing: true, lock: live(100, 1_000, 1), ...working(100) })]);
    expect(rooms.stage.map(room => [room.key, room.state.kind])).toEqual([['gone', 'missing'], ['runs', 'working']]);
  });
});

describe('keepSessionIdentity', () => {
  it('keeps a session its ink and number when an earlier session ends', () => {
    const first = buildWorkTracks(snapshot([
      row('a', { lock: live(1, 100, 1) }),
      row('b', { lock: live(2, 200, 2) }),
      row('c', { lock: live(3, 300, 3) }),
    ]));
    const before = keepSessionIdentity(first, new Map());
    expect(before.tracks.sessions.map(session => [session.ink, session.ordinal])).toEqual([[0, 1], [1, 2], [2, 3]]);
    const second = buildWorkTracks(snapshot([row('b', { lock: live(2, 200, 2) }), row('c', { lock: live(3, 300, 3) })]));
    const after = keepSessionIdentity(second, before.identities);
    expect(after.tracks.sessions.map(session => [session.ink, session.ordinal])).toEqual([[1, 2], [2, 3]]);
    const third = buildWorkTracks(snapshot([
      row('b', { lock: live(2, 200, 2) }), row('c', { lock: live(3, 300, 3) }), row('d', { lock: live(4, 400, 4) }),
    ]));
    expect(keepSessionIdentity(third, after.identities).tracks.sessions.at(-1)).toMatchObject({ ink: 0, ordinal: 1 });
  });
});
