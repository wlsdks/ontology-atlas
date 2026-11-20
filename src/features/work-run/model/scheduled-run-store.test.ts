import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { workRuns, type SeatRun } from './work-run-store';
import { seatRuns, workCardHoldsSeat } from './use-work-run';
import type { ScheduledRunResult } from './scheduled-run';

const FOLDER = 'local:launch';
const held = (checked: number): ScheduledRunResult => ({ outcome: 'held', checked, stale: 0, written: 0, summary: '' });
const beginScheduled = (id: string, startedAt: number, roundId = 'r-pages') =>
  workRuns.beginScheduled({ id, roundId, name: 'Pages still match', lane: 'documents', folder: FOLDER, startedAt });
const beginCheck = (startedAt: number) =>
  workRuns.begin({ folder: FOLDER, owner: 'launch:claude-acp', agent: 'Claude Agent', startedAt });
const scheduled = (key: string) => {
  const entry = workRuns.read().runs.get(key);
  if (entry?.kind !== 'scheduled') throw new Error(`no scheduled run under ${key}`);
  return entry.run;
};
const seated = () => seatRuns(workRuns.read()).map((entry: SeatRun) => entry.key);

beforeEach(() => workRuns.leaveFolder(FOLDER, 0));
afterEach(() => workRuns.reset());

describe('scheduled checks held by the app session beside the wiki check', () => {
  it('holds a wiki check and a scheduled check at once, keyed apart, and names the latest last', () => {
    const checkId = beginCheck(1_000);
    const key = beginScheduled('pass-1', 2_000);
    expect([...workRuns.read().runs.keys()]).toEqual([`check:${checkId}`, key]);
    expect(workRuns.read().run?.id).toBe(checkId);
    expect(seated()).toEqual([`check:${checkId}`, key]);
  });

  it('counts each document its kind checks once, and names the others without counting them', () => {
    const key = beginScheduled('pass-1', 1_000);
    for (const path of ['wiki/alpha.md', 'wiki/beta.md', 'wiki/alpha.md']) workRuns.observeScheduledDocument(key, path, true);
    workRuns.observeScheduledDocument(key, 'sources/notes.md', false);
    expect(scheduled(key)).toMatchObject({ checkedCount: 2, document: 'sources/notes.md' });
    workRuns.observeScheduledStep(key, 'agent');
    expect(scheduled(key)).toMatchObject({ step: 'agent', document: null, checkedCount: 2 });
  });

  it('stops only the run whose Stop was pressed, and leaves the wiki check running', () => {
    const stopCheck = vi.fn();
    const stopScheduled = vi.fn();
    const checkId = beginCheck(1_000);
    workRuns.setStop(checkId, stopCheck);
    const key = beginScheduled('pass-1', 2_000);
    workRuns.setScheduledStop(key, stopScheduled);
    workRuns.stopRun(key);
    expect(stopScheduled).toHaveBeenCalledTimes(1);
    expect(stopCheck).not.toHaveBeenCalled();
    expect(seated()).toEqual([`check:${checkId}`]);
    workRuns.finishScheduled(key, { stopped: true }, 3_000);
    expect(scheduled(key)).toMatchObject({ phase: 'stopped', card: 'closed', unseen: false });
    expect(workRuns.read().run?.phase).toBe('running');
  });

  it('changes a run that finished elsewhere into its result, unseen until Automations opens', () => {
    const key = beginScheduled('pass-1', 1_000);
    workRuns.hideActive();
    expect(workCardHoldsSeat(workRuns.read())).toBe(false);
    workRuns.finishScheduled(key, { stopped: false, result: held(4) }, 9_000);
    expect(scheduled(key)).toMatchObject({ phase: 'ended', card: 'open', unseen: true, endedAt: 9_000 });
    expect(seated()).toEqual([key]);
    workRuns.enterAutomations();
    expect(scheduled(key)).toMatchObject({ unseen: false, card: 'closed' });
    expect(workCardHoldsSeat(workRuns.read())).toBe(false);
  });

  it('draws a result on Automations itself, with no card and nothing unseen', () => {
    const key = beginScheduled('pass-1', 1_000);
    workRuns.enterAutomations();
    expect(seated()).toEqual([]);
    workRuns.finishScheduled(key, { stopped: false, result: held(0) }, 2_000);
    expect(scheduled(key)).toMatchObject({ card: 'closed', unseen: false });
  });

  it('shows no scheduled run of another folder', () => {
    beginScheduled('pass-1', 1_000);
    workRuns.leaveFolder('local:other', 2_000);
    expect(seated()).toEqual([]);
  });

  it('closes one finished run and keeps the card for the run still working', () => {
    const checkId = beginCheck(1_000);
    const key = beginScheduled('pass-1', 2_000);
    workRuns.finishScheduled(key, { stopped: false, result: held(4) }, 3_000);
    expect(seated()).toEqual([`check:${checkId}`, key]);
    workRuns.closeRun(key);
    expect(seated()).toEqual([`check:${checkId}`]);
  });

  it('drops a scheduled run that has nothing left to say when the next one begins', () => {
    const first = beginScheduled('pass-1', 1_000);
    workRuns.finishScheduled(first, { stopped: true }, 2_000);
    const second = beginScheduled('pass-2', 3_000);
    expect([...workRuns.read().runs.keys()]).toEqual([second]);
  });
});
