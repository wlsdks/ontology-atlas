import { describe, expect, it } from 'vitest';
import type { WorkStatusSnapshot, WorktreeRow } from './tauri-work-status';
import { branchTitle, buildWorkTracks, headlineOf } from './work-tracks';

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
    expect(tracks.counts).toEqual({ running: 4, stuck: 0, ready: 0 });
    expect(tracks.worktreeCount).toBe(5);
  });

  it('raises a missing folder and an ended holder into Stuck and folds merged rows', () => {
    const tracks = buildWorkTracks(snapshot([
      row('gone', { missing: true, lock: live(1, 1, 1) }),
      row('ended', { lock: { ...live(9, 9, 9), state: 'stale' } }),
      row('merged', { standing: 'merged', ahead: 0, lock: live(1, 1, 2) }),
      row('fresh', { standing: 'noCommits', ahead: 0 }),
    ]));
    expect(tracks.stuck.map(track => track.key)).toEqual(['gone', 'ended']);
    expect(tracks.merged.map(track => [track.key, track.station])).toEqual([['merged', 'main']]);
    expect(tracks.unheld.map(track => [track.key, track.station])).toEqual([['fresh', 'start']]);
    expect(tracks.sessions).toEqual([]);
    expect(headlineOf(tracks)).toEqual({ kind: 'stuck', count: 2 });
  });

  it('counts an unparsed lock as held but places it with no session', () => {
    const tracks = buildWorkTracks(snapshot([
      row('by-hand', { lock: { state: 'unparsed', tool: 'unknown', agentId: null, pid: null, sessionStartedAt: null, lockedAt: 5 } }),
    ]));
    expect(tracks.unheld[0].holder).toEqual({ kind: 'locked', lockedAt: 5 });
    expect(headlineOf(tracks)).toEqual({ kind: 'idle' });
  });

  it('puts a worktree an Atlas agent session works in under that session', () => {
    const tracks = buildWorkTracks(snapshot([row('chat', { acpPid: 77 })]));
    expect(tracks.sessions).toMatchObject([{ key: 'acp:77', tool: 'acp', tracks: [{ key: 'chat', holder: { kind: 'acp' } }] }]);
  });
});
