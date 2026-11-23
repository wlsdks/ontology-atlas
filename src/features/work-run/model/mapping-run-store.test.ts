import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mappingFraction, type MappingFigures } from './mapping-run';
import { folderMappingRun, libraryRingRun, seatRuns, workCardHoldsSeat } from './use-work-run';
import { workRuns } from './work-run-store';

const FOLDER = 'local:launch';
const OTHER = 'local:atlas';
const KEY = `mapping:${FOLDER}`;

const one = (uncovered: number, total = 120): MappingFigures => ({
  widest: { abilitiesUncovered: uncovered, abilitiesTotal: total },
  sum: { abilitiesUncovered: uncovered, abilitiesTotal: total },
});
const begin = (folder = FOLDER, figures: MappingFigures | null = one(96)) =>
  workRuns.beginMapping({ folder, folderName: folder.slice(6), agent: 'Claude Agent', figures, startedAt: 0 });
const completed = (uncovered: number, at = 120_000) =>
  ({ outcome: { kind: 'completed' } as const, figures: one(uncovered), draft: false, at });
const mapping = (folder = FOLDER) => folderMappingRun(workRuns.read(), folder);
const waiting = { kind: 'writing', label: null, target: 'wiki/a.md', asking: true };

beforeEach(() => workRuns.leaveFolder(FOLDER, 0));
afterEach(() => workRuns.reset());

describe('a mapping run held by the app session', () => {
  it('goes from a press through a report to the next request', () => {
    begin();
    workRuns.observeMappingWork(FOLDER, { kind: 'reading', label: null, target: 'src/a.ts', asking: false }, 30_000);
    expect(mapping()).toMatchObject({ phase: 'running', line: { kind: 'reading', page: 'src/a.ts' }, heardAt: 30_000 });
    const next = workRuns.endMappingBatch(FOLDER, completed(72));
    expect(next).toMatchObject({ phase: 'running', requestsSent: 2 });
    expect(mapping()).toBe(next);
  });

  it('keeps one run per folder: a second press while it runs starts nothing', () => {
    const first = begin();
    expect(begin()).toBeNull();
    expect(mapping()).toBe(first);
    expect(begin(OTHER)).not.toBeNull();
    workRuns.endMappingBatch(FOLDER, { ...completed(72), draft: true });
    const again = begin(FOLDER, one(72));
    expect(again?.id).not.toBe(first?.id);
    expect(mapping()).toBe(again);
  });

  it('stops while asking: the driver\'s Stop runs once and the end names the press', () => {
    const stop = vi.fn();
    begin();
    workRuns.setMappingStop(FOLDER, stop);
    workRuns.observeMappingWork(FOLDER, waiting, 10_000);
    expect(mapping()?.phase).toBe('asking');
    workRuns.stopRun(KEY);
    workRuns.stopRun(KEY);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(mapping()).toMatchObject({ phase: 'stopping', stopReason: 'press' });
    workRuns.endMappingBatch(FOLDER, { ...completed(72), outcome: { kind: 'cancelled' } });
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'press', card: 'open' });
  });

  it('stops a run of a folder that is no longer open as switched', () => {
    const stop = vi.fn();
    begin();
    workRuns.setMappingStop(FOLDER, stop);
    workRuns.leaveFolder(OTHER, 50_000);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(mapping()).toMatchObject({ phase: 'stopping', stopReason: 'switched' });
    workRuns.endMappingBatch(FOLDER, { ...completed(72), outcome: { kind: 'cancelled' } });
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'switched' });
  });

  it('removes an ended run on close, while closing a running one only lowers its card', () => {
    begin();
    workRuns.closeRun(KEY);
    expect(mapping()).toMatchObject({ phase: 'running', card: 'closed' });
    workRuns.endMappingBatch(FOLDER, { ...completed(72), figures: null });
    expect(mapping()?.phase).toBe('finished');
    workRuns.closeRun(KEY);
    expect(mapping()).toBeNull();
  });
});

describe('what readers see of a mapping run', () => {
  it('takes the card over a working run while asking and stands down on its own stage', () => {
    workRuns.beginTurn({
      folder: FOLDER, folderName: 'launch', owner: 'owner', runtimeId: 'claude-acp', agent: 'Codex', door: 'typed', request: '', startedAt: 5,
    });
    begin();
    workRuns.observeMappingWork(FOLDER, waiting, 10);
    workRuns.beginTurn({
      folder: FOLDER, folderName: 'launch', owner: 'later', runtimeId: 'claude-acp', agent: 'Codex', door: 'typed', request: '', startedAt: 20,
    });
    expect(seatRuns(workRuns.read()).at(-1)?.kind).toBe('mapping');
    workRuns.enterMappingStage(FOLDER);
    expect(seatRuns(workRuns.read()).some((entry) => entry.kind === 'mapping')).toBe(false);
  });

  it('rings the map tile with abilities on the map over those found, not the Library tile', () => {
    begin();
    expect(workCardHoldsSeat(workRuns.read())).toBe(true);
    expect(libraryRingRun(workRuns.read(), FOLDER)).toBeNull();
    const run = mapping();
    expect(run && mappingFraction(run)).toBe(0.2);
    workRuns.endMappingBatch(FOLDER, completed(60));
    const next = mapping();
    expect(next && mappingFraction(next)).toBe(0.5);
  });
});
