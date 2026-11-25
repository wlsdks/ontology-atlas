import { describe, expect, it } from 'vitest';
import type { AgentSessionRow, WorkStatusSnapshot, WorktreeRow } from '../tauri-work-status';
import { buildWorkTracks, planRooms, type RoomEntry, type WorkTracks } from '../work-tracks';
import { isWaitingBlock, sessionBoardOf } from './session-board';
import { listedFolders, sessionsByPidOf } from './session-lines';
import { withAgentSessions } from './sessions';

const NOW_MS = 1_795_300_000_000;
const NOW_S = NOW_MS / 1000;

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
    lastCommitAt: NOW_S - 600,
    lastCommitAuthor: 'stark',
    lock: null,
    acpPid: null,
    agentProcesses: [],
    ...patch,
  };
}

const claude = (pid: number) => ({ pid, tool: 'claudeCode' as const, startedAt: NOW_S - 3600 + pid });
const lockBy = (pid: number) => ({ state: 'live' as const, tool: 'claudeCode' as const, agentId: null, pid, sessionStartedAt: NOW_S - 7200, lockedAt: NOW_MS - 60_000 });
const said = (worktreeId: string, pid: number, state: AgentSessionRow['state'], name?: string): AgentSessionRow => ({ worktreeId, pid, state, name });

function boardOf(worktrees: WorktreeRow[], rows: AgentSessionRow[] = []) {
  const snapshot: WorkStatusSnapshot = { status: 'ready', root: '/repo', repository: 'owner/repo', host: 'github.com', baseBranch: 'main', worktrees };
  const tracks: WorkTracks = withAgentSessions(buildWorkTracks(snapshot), rows);
  const plan = planRooms(tracks, NOW_MS);
  const rooms: RoomEntry[] = [...plan.stage, ...plan.floors.flatMap(floor => floor.rooms)];
  return sessionBoardOf(rooms, tracks.sessions, { sessionsByPid: sessionsByPidOf(tracks.sessions), listedIn: listedFolders(rows), since: new Map() });
}

describe('sessionBoardOf', () => {
  it('draws each session once from what the rooms already hold, and counts the folders no session works in', () => {
    const board = boardOf([
      row('main', { mainCheckout: true, branch: 'main', standing: 'base', ahead: 0, agentProcesses: [claude(1), claude(2)] }),
      row('w1', { lock: lockBy(3), agentProcesses: [{ pid: 9, tool: 'codex', startedAt: NOW_S - 100 }] }),
      ...['w2', 'w3', 'w4', 'w5'].map(id => row(id, { lock: lockBy(3) })),
      row('atlas', { acpPid: 7 }),
      row('left', { lock: { ...lockBy(4), state: 'stale' } }),
      row('nobody'),
    ], [said('main', 1, 'working', 'release check'), said('main', 2, 'waitingAnswer')]);

    expect(board.blocks.map(block => block.line.tool)).toHaveLength(5);
    expect(new Set(board.blocks.map(block => block.key)).size).toBe(5);
    expect(board.withoutSession).toBe(2);

    const inMain = board.blocks.filter(block => block.folders.some(folder => folder.room.key === 'main'));
    expect(inMain.map(block => block.line.state)).toEqual(['working', 'waitingAnswer']);
    // The two in the main checkout name each other, so neither shows that folder as its own.
    for (const block of inMain) expect(block.folders[0].others).toHaveLength(1);
    expect(inMain[0].line.name).toBe('release check');

    const holder = board.blocks.find(block => block.folders.length === 5)!;
    expect(holder.folders.map(folder => folder.room.key)).toEqual(['w1', 'w2', 'w3', 'w4', 'w5']);
    expect(holder.folders[0].others.map(other => other.tool)).toEqual(['codex']);
    expect(holder.folders.slice(1).every(folder => folder.others.length === 0)).toBe(true);
    const codex = board.blocks.find(block => block.line.tool === 'codex')!;
    expect(codex.folders.map(folder => folder.room.key)).toEqual(['w1']);
    expect(board.blocks.find(block => block.line.tool === 'acp')!.folders.map(folder => folder.room.key)).toEqual(['atlas']);
  });

  it('keeps blocks in session order when a wait moves from one session to another', () => {
    const worktrees = [row('a', { agentProcesses: [claude(1)] }), row('b', { agentProcesses: [claude(2)] })];
    const first = boardOf(worktrees, [said('a', 1, 'working'), said('b', 2, 'waitingApproval')]);
    const then = boardOf(worktrees, [said('a', 1, 'waitingApproval'), said('b', 2, 'working')]);
    expect(first.blocks.map(block => block.key)).toEqual(then.blocks.map(block => block.key));
    expect(first.blocks.map(isWaitingBlock)).toEqual([false, true]);
    expect(then.blocks.map(isWaitingBlock)).toEqual([true, false]);
  });

  it('puts the folder the list places a session in before folders it only runs commands in', () => {
    const board = boardOf(
      [row('elsewhere', { agentProcesses: [claude(1)] }), row('home', { agentProcesses: [claude(1)] })],
      [said('home', 1, 'working')],
    );
    expect(board.blocks).toHaveLength(1);
    const [block] = board.blocks;
    expect(block.line.state).toBe('working');
    expect(block.folders.map(folder => folder.room.key)).toEqual(['home', 'elsewhere']);
  });

  it('keeps every block when the session list says nothing, with no state and the program seen', () => {
    const board = boardOf([row('a', { agentProcesses: [claude(1)] }), row('b', { agentProcesses: [claude(2)] })]);
    expect(board.blocks.map(block => [block.line.state, block.running])).toEqual([[null, true], [null, true]]);
  });

  it('has no block when no session works in any folder', () => {
    const board = boardOf([row('quiet'), row('left', { lock: { ...lockBy(4), state: 'stale' } })]);
    expect(board.blocks).toEqual([]);
    expect(board.withoutSession).toBe(2);
  });
});
