import { describe, expect, it } from 'vitest';
import type { WorkStatusSnapshot, WorktreeRow } from '@/shared/lib/work-status/tauri-work-status';
import { buildWorkTracks, planRooms, type RoomPlan } from '@/shared/lib/work-status/work-tracks';
import { retireeOf, roomLook, withRetirees } from './room-look';

const NOW_MS = 1_795_260_000_000;

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
    lastCommitAt: NOW_MS / 1000 - 600,
    lastCommitAuthor: 'stark',
    lock: null,
    acpPid: null,
    agentProcesses: [],
    ...patch,
  };
}

const working = (id: string) => row(id, { agentProcesses: [{ pid: 7, tool: 'codex', startedAt: NOW_MS / 1000 - 3600 }] });

function plan(worktrees: WorktreeRow[]): RoomPlan {
  const snapshot: WorkStatusSnapshot = { status: 'ready', root: '/repo', repository: 'owner/repo', host: 'github.com', baseBranch: 'main', worktrees };
  return planRooms(buildWorkTracks(snapshot), NOW_MS);
}

describe('roomLook', () => {
  it('lights only a room where something runs and leaves the empty rooms without Moru', () => {
    expect(roomLook({ kind: 'working', tools: ['codex'] })).toMatchObject({ running: true, cast: 'one', clip: 'code' });
    expect(roomLook({ kind: 'working', tools: ['claudeCode', 'codex'] }).cast).toBe('two');
    expect(roomLook({ kind: 'dozing', quietSinceMs: 0 })).toMatchObject({ running: false, dozing: true, still: true });
    expect(roomLook({ kind: 'lockLeft', tool: 'claudeCode' })).toMatchObject({ cast: 'none', monitorOff: true, crate: 'taped' });
    expect(roomLook({ kind: 'missing' })).toMatchObject({ cast: 'none', crate: 'ghost' });
    expect(roomLook({ kind: 'merged' })).toMatchObject({ running: false, clip: 'clap', still: false });
  });
});

describe('withRetirees', () => {
  it('keeps a merged stage room in its slot and hands the stage overflow back to its floor', () => {
    const before = plan(['a', 'b', 'c', 'd', 'e', 'f'].map(working));
    const leaving = before.stage[2];
    const after = plan(['a', 'b', 'd', 'e', 'f', 'g'].map(working));
    const shown = withRetirees(after, [retireeOf(leaving, null, 2)], 6);
    expect(shown.stage.map(room => room.key)).toEqual([...before.stage.slice(0, 2), leaving, ...after.stage.slice(2, 5)].map(room => room.key));
    expect(shown.stage[2]).toMatchObject({ state: { kind: 'merged' }, stage: 'main' });
    expect(shown.floors.flatMap(floor => floor.rooms).map(room => room.key)).toContain(after.stage[5].key);
  });

  it('returns the plan untouched when nothing retires', () => {
    const current = plan([working('a')]);
    expect(withRetirees(current, [], 6)).toBe(current);
  });
});
