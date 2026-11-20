import { afterEach, describe, expect, it, vi } from 'vitest';

import { workRuns } from './work-run-store';
import type { WorkRunReport } from './work-run';

const FOLDER = 'local:launch';
const report = (itemCount: number, pageCount = itemCount): WorkRunReport => ({ itemCount, pageCount, payload: null });
const begin = () => workRuns.begin({ folder: FOLDER, agent: 'Claude Agent', startedAt: 1_000 });
const run = () => workRuns.read().run!;

afterEach(() => workRuns.reset());

describe('a wiki check held by the app session', () => {
  it('names each page as it is read, counts exactly the pages read, then says it is writing', () => {
    begin();
    expect(run().line).toEqual({ kind: 'connecting' });
    const pages = ['wiki/alpha', 'wiki/beta', 'wiki/gamma', 'wiki/delta', 'wiki/epsilon'];
    const lines: string[] = [];
    for (const page of pages) {
      workRuns.observeActivity({ kind: 'reading', label: { kind: 'kind', text: 'read' }, target: page, asking: false });
      workRuns.observeRead(page);
      const line = run().line;
      lines.push(line.kind === 'reading' ? line.page : line.kind);
    }
    workRuns.observeRead('wiki/alpha');
    expect(lines).toEqual(pages);
    expect(run().pagesRead).toHaveLength(5);
    workRuns.observeActivity({ kind: 'answering', label: null, target: null, asking: false });
    expect(run().line).toEqual({ kind: 'writing' });
    expect(run().pagesRead).toHaveLength(5);
  });

  it('keeps the last observed line while the agent thinks between calls', () => {
    begin();
    workRuns.observeActivity({ kind: 'searching', label: { kind: 'known', text: 'checkPages' }, target: null, asking: false });
    workRuns.observeActivity({ kind: 'thinking', label: null, target: null, asking: false });
    expect(run().line).toEqual({ kind: 'tool', label: { kind: 'known', text: 'checkPages' } });
  });

  it('waits on a permission ask and goes back to running once it is answered', () => {
    begin();
    workRuns.observeActivity({ kind: 'writing', label: { kind: 'kind', text: 'edit' }, target: null, asking: true });
    expect(run().phase).toBe('asking');
    workRuns.observeActivity({ kind: 'thinking', label: null, target: null, asking: false });
    expect(run().phase).toBe('running');
  });

  it('brings a hidden card back for the result and leaves the result unseen until it is opened', () => {
    const id = begin();
    workRuns.hide();
    expect(run().card).toBe('hidden');
    workRuns.finish(id, { kind: 'report', report: report(3, 2) }, 9_000);
    expect(run()).toMatchObject({ phase: 'found', card: 'open', unseen: true, endedAt: 9_000 });
    workRuns.markSeen(FOLDER);
    expect(run()).toMatchObject({ unseen: false, card: 'closed' });
  });

  it('draws a result in place where its stage stands, with no card and nothing unseen', () => {
    const id = begin();
    workRuns.enterStage(FOLDER);
    workRuns.finish(id, { kind: 'report', report: report(3) }, 9_000);
    expect(run()).toMatchObject({ phase: 'found', card: 'closed', unseen: false });
  });

  it('reads a report listing nothing as clean, which leaves no badge', () => {
    const id = begin();
    workRuns.finish(id, { kind: 'report', report: report(0) }, 9_000);
    expect(run()).toMatchObject({ phase: 'clean', unseen: false, card: 'open' });
  });

  it('stops through the conversation and puts the card away at once', () => {
    const stop = vi.fn();
    const id = begin();
    workRuns.setStop(stop);
    workRuns.stop();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(run().card).toBe('closed');
    workRuns.finish(id, { kind: 'stopped' }, 2_000);
    expect(run()).toMatchObject({ phase: 'stopped', card: 'closed', unseen: false });
  });

  it('ends the check when the folder is switched and keeps its late result out of the new folder', () => {
    const stop = vi.fn();
    const id = begin();
    workRuns.setStop(stop);
    workRuns.observeRead('wiki/alpha');
    workRuns.leaveFolder('local:other', 3_000);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(run()).toMatchObject({ phase: 'failed', folder: FOLDER, card: 'open', report: null });
    workRuns.finish(id, { kind: 'report', report: report(3) }, 4_000);
    expect(run()).toMatchObject({ phase: 'failed', report: null, unseen: false });
  });

  it('ignores a late completion from a check that a newer one replaced', () => {
    const first = begin();
    const second = begin();
    workRuns.finish(first, { kind: 'report', report: report(2) }, 5_000);
    expect(run()).toMatchObject({ id: second, phase: 'running', report: null });
  });
});
