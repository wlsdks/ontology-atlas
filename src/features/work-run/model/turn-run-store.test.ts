import { afterEach, describe, expect, it, vi } from 'vitest';

import { workRuns } from './work-run-store';
import type { TurnRun } from './turn-run';

const FOLDER = 'local:launch';
const ROOT = '/Users/probe/launch';
const OWNER = `${ROOT}:claude-acp`;
const begin = () => workRuns.beginTurn({
  folder: FOLDER, folderName: 'launch', owner: OWNER, runtimeId: 'claude-acp', agent: 'Claude Agent', door: 'compile', request: '', startedAt: 1_000,
});
const turn = (id: number) => {
  const entry = workRuns.read().runs.get(`turn:${id}`);
  return entry?.kind === 'turn' ? entry.run : (null as unknown as TurnRun);
};
const write = (path: string, status = 'completed') => ({ id: path, toolKind: 'edit', status, title: `Write ${path}`, rawInput: { file_path: `${ROOT}/${path}` } });
const asking = (target: string) => ({ kind: 'writing', label: null, target, asking: true, request: { action: 'edit' as const, target } });

afterEach(() => workRuns.reset());

describe('a Library turn that may write, held by the app session', () => {
  it('counts each file once as it is written, and ends naming what it wrote', () => {
    const id = begin();
    workRuns.observeTurnTool(id, write('wiki/a.md'), ROOT);
    workRuns.observeTurnTool(id, write('wiki/a.md'), ROOT);
    workRuns.observeTurnTool(id, write('wiki/b.md', 'in_progress'), ROOT);
    expect(turn(id).written).toEqual(['wiki/a.md']);
    workRuns.finishTurn(id, { outcome: 'completed', events: [write('wiki/a.md'), write('wiki/b.md')], vaultRoot: ROOT }, 2_000);
    expect(turn(id)).toMatchObject({ phase: 'written', written: ['wiki/a.md', 'wiki/b.md'], card: 'open', unseen: true });
  });

  it('marks a run tool or a write outside the folder as beyond what Atlas can see', () => {
    const id = begin();
    workRuns.finishTurn(id, {
      outcome: 'completed',
      events: [{ id: 'x', toolKind: 'execute', status: 'completed', title: 'npm test' }, { ...write('wiki/a.md'), rawInput: { file_path: '/etc/hosts' } }],
      vaultRoot: ROOT,
    }, 2_000);
    expect(turn(id)).toMatchObject({ phase: 'answered', beyond: true, written: [] });
  });

  it('brings a hidden card back when a request waits, keeping when the wait began', () => {
    const id = begin();
    workRuns.hideActive();
    expect(turn(id).card).toBe('hidden');
    workRuns.observeTurnWork(id, asking('wiki/a.md'), 5_000);
    workRuns.observeTurnWork(id, asking('wiki/a.md'), 9_000);
    expect(turn(id)).toMatchObject({ phase: 'asking', card: 'open', ask: { action: 'edit', target: 'wiki/a.md', since: 5_000 } });
  });

  it('shows stopping until the turn has ended, then stopped with the cut-off write named', () => {
    const id = begin();
    const stop = vi.fn();
    workRuns.setTurnStop(id, stop);
    workRuns.observeTurnWork(id, asking('wiki/a.md'), 5_000);
    workRuns.stopRun(`turn:${id}`);
    workRuns.stopRun(`turn:${id}`);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(turn(id)).toMatchObject({ phase: 'stopping', ask: null, endedAt: null });
    workRuns.observeTurnWork(id, { kind: 'writing', label: null, target: null, asking: true }, 6_000);
    expect(turn(id).phase).toBe('stopping');
    workRuns.finishTurn(id, { outcome: 'cancelled', events: [write('wiki/a.md'), write('wiki/b.md', 'in_progress')], vaultRoot: ROOT }, 7_000);
    expect(turn(id)).toMatchObject({ phase: 'stopped', written: ['wiki/a.md'], partial: ['wiki/b.md'], card: 'open' });
  });

  it('ends a turn of another folder when the folder is switched, through its own stop', () => {
    const id = begin();
    const stop = vi.fn();
    workRuns.setTurnStop(id, stop);
    workRuns.leaveFolder('local:other', 3_000);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(turn(id)).toMatchObject({ phase: 'stopping', switched: true });
    workRuns.finishTurn(id, { outcome: 'cancelled', events: [], vaultRoot: ROOT }, 4_000);
    expect(turn(id)).toMatchObject({ phase: 'switched', card: 'open' });
  });

  it('draws no card while its conversation is on screen, and reports only to its owner', () => {
    const id = begin();
    expect(workRuns.turnOwnedBy(OWNER)).toBe(id);
    expect(workRuns.turnOwnedBy(`${ROOT}:codex-acp`)).toBeNull();
    workRuns.enterTurnStage(OWNER);
    workRuns.finishTurn(id, { outcome: 'completed', events: [write('wiki/a.md')], vaultRoot: ROOT }, 2_000);
    expect(turn(id)).toMatchObject({ phase: 'written', card: 'closed', unseen: false });
    expect(workRuns.activeTurn(FOLDER)).toBeNull();
  });
});
