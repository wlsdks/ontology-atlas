import { describe, expect, it } from 'vitest';
import type { SessionLine } from '@/shared/lib/work-status/signals/session-lines';
import type { WorkStatusSnapshot, WorktreeRow } from '@/shared/lib/work-status/tauri-work-status';
import { buildWorkTracks, planRooms, type RoomEntry } from '@/shared/lib/work-status/work-tracks';
import { NO_LIVE, listRowsBeside, roomLiveOf, screenSessionLines, type BuildingLive } from './room-live';

const NOW_MS = 1_795_260_000_000;

function room(): RoomEntry {
  const worktree: WorktreeRow = {
    id: 'a', path: '/repo/a', branch: 'feat/a', head: 'abc', mainCheckout: false, missing: false, standing: 'ahead', ahead: 1,
    lastCommitAt: NOW_MS / 1000 - 60, lastCommitAuthor: 'stark', lock: null, acpPid: null,
    agentProcesses: [{ pid: 7, tool: 'claudeCode', startedAt: NOW_MS / 1000 - 600 }],
  };
  const snapshot: WorkStatusSnapshot = { status: 'ready', root: '/repo', repository: 'repo', host: 'github.com', baseBranch: 'main', worktrees: [worktree] };
  return planRooms(buildWorkTracks(snapshot), NOW_MS).stage[0];
}

const line = (key: string): SessionLine => ({ key, pid: null, tool: 'claudeCode', ordinal: 1, ink: 0, name: null, state: 'working', since: null });

describe('screenSessionLines', () => {
  it('lists no line on the screen for one session, whose name the bezel carries', () => {
    expect(screenSessionLines([line('a')])).toEqual({ lines: [], more: 0 });
  });

  it('lists three lines and counts the rest for seven sessions', () => {
    const shown = screenSessionLines(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(line));
    expect(shown.lines.map(each => each.key)).toEqual(['a', 'b', 'c']);
    expect(shown.more).toBe(4);
  });
});

describe('listRowsBeside', () => {
  it('gives the session lines the rows they take and never fewer than none to the lists', () => {
    expect(listRowsBeside(8, 0)).toBe(8);
    expect(listRowsBeside(8, 3)).toBe(5);
    expect(listRowsBeside(3, 4)).toBe(0);
  });
});

describe('roomLiveOf', () => {
  it('flashes and counts only from a pulse that was read', () => {
    const pulse = { watched: true, lastChangeAtMs: NOW_MS - 5000, steps: [{ atMs: NOW_MS - 10_000, count: 3 }] };
    const read: BuildingLive = {
      ...NO_LIVE,
      pulse: { status: 'read', worktrees: new Map([['a', pulse]]), flashes: new Map([['a', { count: 2, lastChangeAtMs: pulse.lastChangeAtMs, flashedAtMs: NOW_MS }]]), nowMs: NOW_MS },
    };
    expect(roomLiveOf(room(), read)).toMatchObject({ flash: 2, pulse: { changedJustNow: true, lastMinute: 3 } });
    const off: BuildingLive = { ...read, pulse: { ...read.pulse, status: 'off' } };
    expect(roomLiveOf(room(), off)).toMatchObject({ flash: 0, pulse: null, pulseStatus: 'off' });
  });
});
