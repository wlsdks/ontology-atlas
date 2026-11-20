import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CountedRunObservation } from './counted-run';
import { activeRuns, ringRun, seatRun } from './use-work-run';
import { COUNTED_PROGRESS_INTERVAL_MS, workRuns } from './work-run-store';

const FOLDER = 'local:launch';
const OTHER = 'local:atlas';

const preparing = (filesDone: number, fields: Partial<CountedRunObservation> = {}): CountedRunObservation => ({
  phase: 'preparing',
  updating: false,
  quiet: false,
  filesDone,
  filesTotal: 2000,
  bytes: null,
  reading: `wiki/page-${filesDone}.md`,
  minutesLeft: null,
  failure: null,
  pressed: null,
  ...fields,
});
const ready: CountedRunObservation = { ...preparing(2000), phase: 'ready', reading: null };
const failed: CountedRunObservation = {
  ...preparing(1240), phase: 'failed', reading: null, failure: { message: 'runnerDown', values: {} },
};

let now = 0;
const observe = (observation: CountedRunObservation | null, { folder = FOLDER, stage = false } = {}) =>
  workRuns.observeCounted(folder, observation, stage, now);
const counted = () => workRuns.read().counted;

beforeEach(() => {
  vi.useFakeTimers();
  now = 1_000;
});

afterEach(() => {
  workRuns.reset();
  vi.useRealTimers();
});

describe('when the counted card rises', () => {
  it('opens for a press made in this launch', () => {
    observe(preparing(0, { pressed: 1 }));
    expect(counted()).toMatchObject({ phase: 'preparing', card: 'open', pressed: 1 });
    expect(seatRun(workRuns.read())?.kind).toBe('meaning');
  });

  it('draws only the ring for a job that continues by itself, then raises the card when it fails', () => {
    observe(preparing(312));
    expect(counted()?.card).toBe('hidden');
    expect(seatRun(workRuns.read())).toBeNull();
    expect(ringRun(workRuns.read())?.kind).toBe('meaning');
    observe(failed);
    expect(counted()).toMatchObject({ phase: 'failed', card: 'open', failure: { message: 'runnerDown' } });
  });

  it('draws nothing for an update of fewer than ten files and leaves a standing result as it was', () => {
    observe(preparing(3, { updating: true, quiet: true, filesTotal: 9 }));
    expect(counted()).toBeNull();
    observe(preparing(1999, { pressed: 1 }));
    observe(ready);
    observe(preparing(3, { pressed: 1, updating: true, quiet: true, filesTotal: 9 }));
    expect(counted()).toMatchObject({ phase: 'ready', card: 'open' });
    expect(workRuns.readProgress()?.filesTotal).toBe(2000);
  });

  it('never raises the card for an update of changed files', () => {
    observe(preparing(4, { updating: true, filesTotal: 12 }));
    expect(counted()?.card).toBe('closed');
    expect(ringRun(workRuns.read())?.kind).toBe('meaning');
    observe(null);
    expect(counted()).toBeNull();
  });

  it('closes on Stop, keeps it closed while stopped, and opens again only for Resume', () => {
    const stop = vi.fn();
    workRuns.setCountedStop(stop);
    observe(preparing(10, { pressed: 1 }));
    workRuns.stopCounted();
    expect(stop).toHaveBeenCalledOnce();
    expect(counted()?.card).toBe('closed');
    observe({ ...preparing(10, { pressed: 1 }), phase: 'stopped' });
    observe({ ...preparing(10, { pressed: 1 }), phase: 'stopped' });
    expect(counted()?.card).toBe('closed');
    observe(preparing(11, { pressed: 2 }));
    expect(counted()?.card).toBe('open');
  });

  it('shows the result only where the card was open, and never over the desk', () => {
    observe(preparing(1999, { pressed: 1 }));
    observe(ready);
    expect(counted()).toMatchObject({ phase: 'ready', card: 'open' });

    workRuns.reset();
    observe(preparing(1999, { pressed: 1 }));
    workRuns.hideCounted();
    observe(ready);
    expect(counted()?.card).toBe('closed');

    workRuns.reset();
    observe(preparing(1999, { pressed: 1 }));
    observe(ready, { stage: true });
    expect(counted()?.card).toBe('closed');
  });

  it('stands down while the desk line is on screen and returns when the person leaves', () => {
    observe(preparing(5, { pressed: 1 }));
    observe(preparing(6, { pressed: 1 }), { stage: true });
    expect(seatRun(workRuns.read())).toBeNull();
    observe(preparing(7, { pressed: 1 }));
    expect(seatRun(workRuns.read())?.kind).toBe('meaning');
  });

  it("keeps another folder's run as it was left and shows it again on return", () => {
    observe(preparing(5, { pressed: 1 }));
    workRuns.hideCounted();
    observe(null, { folder: OTHER });
    expect(counted()).toBeNull();
    observe(preparing(9, { pressed: 1 }));
    expect(counted()).toMatchObject({ card: 'hidden', pressed: 1 });
  });
});

describe('two runs in one seat', () => {
  it('shows the run started last and lists both as running', () => {
    workRuns.begin({ folder: FOLDER, owner: 'launch:claude-acp', agent: 'Claude Agent', startedAt: 500 });
    observe(preparing(1, { pressed: 1 }));
    expect(seatRun(workRuns.read())?.kind).toBe('meaning');
    expect(activeRuns(workRuns.read()).map((entry) => entry.kind)).toEqual(['meaning', 'check']);
    workRuns.hideCounted();
    expect(seatRun(workRuns.read())?.kind).toBe('check');
    expect(ringRun(workRuns.read())?.kind).toBe('check');
  });
});

describe('the counted figures', () => {
  it('redraw at most four times a second, and the last figure always lands', () => {
    const drawn: number[] = [];
    const drawnAt: number[] = [];
    const stopListening = workRuns.subscribeProgress(() => {
      drawn.push(workRuns.readProgress()?.filesDone ?? -1);
      drawnAt.push(Date.now());
    });
    observe(preparing(0, { pressed: 1 }));
    for (let event = 1; event <= 1_200; event += 1) {
      now += 50;
      vi.advanceTimersByTime(50);
      observe(preparing(event, { pressed: 1 }));
    }
    vi.advanceTimersByTime(COUNTED_PROGRESS_INTERVAL_MS);
    stopListening();
    const gaps = drawnAt.slice(1).map((at, index) => at - drawnAt[index]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(COUNTED_PROGRESS_INTERVAL_MS);
    expect(drawn.length).toBeGreaterThan(200);
    expect(drawn.at(-1)).toBe(1_200);
    expect(workRuns.readProgress()).toMatchObject({ filesDone: 1_200, fraction: 0.6 });
  });

  it('never change the run the shell reads while only the count moves', () => {
    observe(preparing(0, { pressed: 1 }));
    const header = counted();
    const shell = vi.fn();
    const stopListening = workRuns.subscribe(shell);
    for (let event = 1; event <= 100; event += 1) observe(preparing(event, { pressed: 1 }));
    stopListening();
    expect(shell).not.toHaveBeenCalled();
    expect(counted()).toBe(header);
  });

  it('carry bytes while the model downloads and stay full while it is converted', () => {
    observe({ ...preparing(0, { pressed: 1 }), phase: 'modelDownloading', bytes: { done: 500, total: 2_000 } });
    expect(workRuns.readProgress()?.fraction).toBe(0.25);
    observe({ ...preparing(0, { pressed: 1 }), phase: 'modelConverting' });
    expect(workRuns.readProgress()?.fraction).toBe(1);
    observe({ ...preparing(0, { pressed: 1 }), phase: 'waitingTurn' });
    expect(workRuns.readProgress()?.fraction).toBeNull();
  });
});
