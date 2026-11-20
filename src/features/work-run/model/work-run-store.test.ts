import { afterEach, describe, expect, it, vi } from 'vitest';

import { workRuns } from './work-run-store';
import { latestReport, type WorkRunOutcome } from './work-run';

const FOLDER = 'local:launch';
const OWNER = 'launch:claude-acp';
const report = (itemCount: number, pageCount = itemCount): WorkRunOutcome => ({ kind: 'report', report: { itemCount, pageCount, payload: { itemCount } } });
const begin = (owner = OWNER) => workRuns.begin({ folder: FOLDER, owner, agent: 'Claude Agent', startedAt: 1_000 });
const run = () => workRuns.read().run!;

afterEach(() => workRuns.reset());

describe('a wiki check held by the app session', () => {
  it('names each page as it is read, counts exactly the pages read, then says it is writing', () => {
    const id = begin();
    expect(run().line).toEqual({ kind: 'connecting' });
    const pages = ['wiki/alpha', 'wiki/beta', 'wiki/gamma', 'wiki/delta', 'wiki/epsilon'];
    const lines: string[] = [];
    for (const page of pages) {
      workRuns.observeActivity(id, { kind: 'reading', label: { kind: 'kind', text: 'read' }, target: page, asking: false });
      workRuns.observeRead(id, page);
      const line = run().line;
      lines.push(line.kind === 'reading' ? line.page : line.kind);
    }
    workRuns.observeRead(id, 'wiki/alpha');
    expect(lines).toEqual(pages);
    expect(run().readCount).toBe(5);
    workRuns.observeActivity(id, { kind: 'answering', label: null, target: null, asking: false });
    expect(run().line).toEqual({ kind: 'writing' });
    expect(run().readCount).toBe(5);
  });

  it('keeps the last observed line while the agent thinks between calls', () => {
    const id = begin();
    workRuns.observeActivity(id, { kind: 'searching', label: { kind: 'known', text: 'checkPages' }, target: null, asking: false });
    workRuns.observeActivity(id, { kind: 'thinking', label: null, target: null, asking: false });
    expect(run().line).toEqual({ kind: 'tool', label: { kind: 'known', text: 'checkPages' } });
  });

  it('waits on a permission ask and goes back to running once it is answered', () => {
    const id = begin();
    workRuns.observeActivity(id, { kind: 'writing', label: { kind: 'kind', text: 'edit' }, target: null, asking: true });
    expect(run().phase).toBe('asking');
    workRuns.observeActivity(id, { kind: 'thinking', label: null, target: null, asking: false });
    expect(run().phase).toBe('running');
  });

  it('brings a hidden card back for the result and leaves the result unseen until it is opened', () => {
    const id = begin();
    workRuns.hide();
    expect(run().card).toBe('hidden');
    workRuns.finish(id, report(3, 2), 9_000);
    expect(run()).toMatchObject({ phase: 'found', card: 'open', unseen: true, endedAt: 9_000 });
    workRuns.markSeen(FOLDER);
    expect(run()).toMatchObject({ unseen: false, card: 'closed' });
  });

  it('draws a result in place where its stage stands, with no card and nothing unseen', () => {
    const id = begin();
    workRuns.enterStage(FOLDER);
    workRuns.finish(id, report(3), 9_000);
    expect(run()).toMatchObject({ phase: 'found', card: 'closed', unseen: false });
  });

  it('reads a report listing nothing as clean, which leaves no badge', () => {
    const id = begin();
    workRuns.finish(id, report(0), 9_000);
    expect(run()).toMatchObject({ phase: 'clean', unseen: false, card: 'open' });
  });

  it('stops through the conversation and puts the card away at once', () => {
    const stop = vi.fn();
    const id = begin();
    workRuns.setStop(id, stop);
    workRuns.stop();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(run().card).toBe('closed');
    workRuns.finish(id, { kind: 'stopped' }, 2_000);
    expect(run()).toMatchObject({ phase: 'stopped', card: 'closed', unseen: false });
  });

  it('keeps Stop on the check when another conversation is seated and reports none', () => {
    const stop = vi.fn();
    const id = begin();
    workRuns.setStop(id, stop);
    const other = workRuns.runOwnedBy('launch:codex-acp');
    expect(other).toBeNull();
    workRuns.observeRead(id + 1, 'wiki/elsewhere');
    workRuns.setStop(id + 1, null);
    expect(run().readCount).toBe(0);
    workRuns.stop();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('ends the check when the folder is switched and keeps its late result out of the new folder', () => {
    const stop = vi.fn();
    const id = begin();
    workRuns.setStop(id, stop);
    workRuns.observeRead(id, 'wiki/alpha');
    workRuns.leaveFolder('local:other', 3_000);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(run()).toMatchObject({ phase: 'failed', folder: FOLDER, card: 'open', report: null });
    workRuns.finish(id, report(3), 4_000);
    expect(run()).toMatchObject({ phase: 'failed', report: null, unseen: false });
  });

  it('ignores a late completion from a check that a newer one replaced', () => {
    const first = begin();
    const second = begin();
    workRuns.finish(first, report(2), 5_000);
    expect(run()).toMatchObject({ id: second, phase: 'running', report: null });
  });

  it.each([
    ['stopped', { kind: 'stopped' }],
    ['failed', { kind: 'failed' }],
    ['unreadable', { kind: 'unreadable' }],
  ] as const)('keeps the last findings through a re-check that ends %s, and replaces them with a new report', (_, outcome) => {
    const first = begin();
    workRuns.finish(first, report(3), 2_000);
    const second = begin();
    expect(latestReport(run())?.itemCount).toBe(3);
    workRuns.finish(second, outcome, 3_000);
    expect(latestReport(run())?.itemCount).toBe(3);
    const third = begin();
    workRuns.finish(third, report(1), 4_000);
    expect(latestReport(run())?.itemCount).toBe(1);
  });

  it('keeps a fixed finding fixed across a re-check that reports nothing new, and clears it on a new report', () => {
    const first = begin();
    workRuns.finish(first, report(3), 2_000);
    workRuns.markHandled(FOLDER, 'disagreement:wiki/alpha');
    const second = begin();
    workRuns.finish(second, { kind: 'stopped' }, 3_000);
    expect(latestReport(run())?.handled.has('disagreement:wiki/alpha')).toBe(true);
    const third = begin();
    workRuns.finish(third, report(2), 4_000);
    expect(latestReport(run())?.handled.size).toBe(0);
  });
});
