import { describe, expect, it } from 'vitest';
import type { WorkStatusSnapshot, WorktreeRow } from '@/shared/lib/work-status/tauri-work-status';
import { buildWorkTracks, planRooms, type RoomPlan } from '@/shared/lib/work-status/work-tracks';
import { ROOM_PROPS, cartLoad, moruPhase, retireeOf, roomIdentity, roomLook, roomOnce, withRetirees } from './room-look';

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
  it('plays the row of what Git and the locks show, and leaves a folder nobody held without Moru', () => {
    expect(roomLook({ kind: 'working', tools: ['codex'] })).toMatchObject({ running: true, cast: 'one', clip: 'desk-type', still: false });
    expect(roomLook({ kind: 'working', tools: ['claudeCode', 'codex'] })).toMatchObject({ cast: 'two', backClip: 'monitor-read' });
    expect(roomLook({ kind: 'resting', quietSinceMs: 0 })).toMatchObject({ running: false, still: true });
    expect(roomLook({ kind: 'dozing', quietSinceMs: 0 })).toMatchObject({ running: false, dozing: true, clip: 'nod-off', still: false });
    expect(roomLook({ kind: 'lockLeft', tool: 'claudeCode' })).toMatchObject({ clip: 'sigh', monitorOff: true, crate: 'taped' });
    expect(roomLook({ kind: 'missing' })).toMatchObject({ clip: 'sigh', crate: 'ghost' });
    expect(roomLook({ kind: 'merged' })).toMatchObject({ running: false, still: true });
    expect(roomLook({ kind: 'unheld', lastCommitAt: null }).cast).toBe('none');
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

  it('hands back a room that is not at work so the stage stays a whole grid while one retires', () => {
    const before = plan(['a', 'b', 'c', 'd'].map(working));
    const leaving = before.stage[1];
    const after = plan(['a', 'c', 'd'].map(working).concat(row('idle', { lock: { state: 'live', tool: 'claudeCode', agentId: 'a2', pid: 8, sessionStartedAt: 2, lockedAt: 2 } })));
    expect(after.stage.map(room => room.key)).toContain('idle');
    const shown = withRetirees(after, [retireeOf(leaving, null, 1)], 6);
    expect(shown.stage).toHaveLength(4);
    expect(shown.stage.map(room => room.key)).toContain(leaving.key);
    expect(shown.stage.map(room => room.key)).not.toContain('idle');
  });

  it('returns the plan untouched when nothing retires', () => {
    const current = plan([working('a')]);
    expect(withRetirees(current, [], 6)).toBe(current);
  });
});

describe('cartLoad', () => {
  it('carries one crate per commit up to six and counts the rest', () => {
    expect(cartLoad(4, false)).toEqual({ crates: 4, more: 0 });
    expect(cartLoad(9, false)).toEqual({ crates: 6, more: 3 });
    expect(cartLoad(0, false)).toEqual({ crates: 0, more: 0 });
    expect(cartLoad(0, true)).toEqual({ crates: 1, more: 0 });
  });
});

describe('moruPhase', () => {
  it('starts rooms at whole poses that differ between neighbours', () => {
    const phases = ['feat/a', 'feat/b', 'fix/c', 'refactor/d', 'docs/e'].map(moruPhase);
    for (const phase of phases) expect(Number.isInteger(phase * 24) && phase >= 0 && phase < 1).toBe(true);
    expect(new Set(phases).size).toBeGreaterThan(3);
    expect(moruPhase('feat/a')).toBe(phases[0]);
  });
});

describe('roomIdentity', () => {
  it('keeps a branch its own mirroring and prop, and spreads both across branches', () => {
    const branches = Array.from({ length: 60 }, (_, index) => `feat/branch-${index}`);
    const identities = branches.map(roomIdentity);
    expect(roomIdentity('feat/branch-7')).toEqual(identities[7]);
    const mirrored = identities.filter(identity => identity.mirrored).length;
    expect(mirrored).toBeGreaterThan(18);
    expect(mirrored).toBeLessThan(42);
    expect(new Set(identities.map(identity => identity.prop)).size).toBe(ROOM_PROPS);
  });
});

describe('roomOnce', () => {
  const working = { kind: 'working', tools: ['claudeCode'] } as const;
  const none = { merged: false, landed: false, entered: false };

  it('cheers only a merge it observed, sends a landed commit only from a working room, and settles into a new room', () => {
    expect(roomOnce({ kind: 'merged' }, { ...none, merged: true })).toBe('merge-cheer');
    expect(roomOnce({ kind: 'merged' }, none)).toBeNull();
    expect(roomOnce(working, { ...none, landed: true })).toBe('crate-send');
    expect(roomOnce({ kind: 'resting', quietSinceMs: null }, { ...none, landed: true })).toBeNull();
    expect(roomOnce(working, { ...none, entered: true })).toBe('settle-in');
    expect(roomOnce({ kind: 'unheld', lastCommitAt: null }, { ...none, entered: true })).toBeNull();
  });
});
