import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeaningRunObservation } from './meaning-run';
import { libraryRingRun, seatRuns } from './use-work-run';
import { MEANING_PROGRESS_INTERVAL_MS, workRuns } from './work-run-store';

const FOLDER = 'local:launch';
const OTHER = 'local:atlas';
const KEY = `meaning:${FOLDER}`;

const preparing = (filesDone: number, fields: Partial<MeaningRunObservation> = {}): MeaningRunObservation => ({
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
const ready: MeaningRunObservation = { ...preparing(2000), phase: 'ready', reading: null };
const failed: MeaningRunObservation = {
  ...preparing(1240), phase: 'failed', reading: null, failure: 'Ollama stopped answering.',
};

let now = 0;
const observe = (observation: MeaningRunObservation | null, { folder = FOLDER, stage = false } = {}) =>
  workRuns.observeMeaning(folder, observation, stage, now);
const meaning = (folder = FOLDER) => {
  const entry = workRuns.read().runs.get(`meaning:${folder}`);
  return entry?.kind === 'meaning' ? entry.run : null;
};
const named = () => seatRuns(workRuns.read()).at(-1)?.kind ?? null;
const ring = () => libraryRingRun(workRuns.read(), FOLDER)?.kind ?? null;

beforeEach(() => {
  vi.useFakeTimers();
  now = 1_000;
  workRuns.leaveFolder(FOLDER, now);
});

afterEach(() => {
  workRuns.reset();
  vi.useRealTimers();
});

describe('when the meaning card rises', () => {
  it('opens for a press made in this launch', () => {
    observe(preparing(0, { pressed: 1 }));
    expect(meaning()).toMatchObject({ phase: 'preparing', card: 'open', pressed: 1 });
    expect(named()).toBe('meaning');
  });

  it('draws only the ring for a job that continues by itself, then raises the card when it fails', () => {
    observe(preparing(312));
    expect(meaning()?.card).toBe('hidden');
    expect(named()).toBeNull();
    expect(ring()).toBe('meaning');
    observe(failed);
    expect(meaning()).toMatchObject({ phase: 'failed', card: 'open', failure: 'Ollama stopped answering.' });
    expect(ring()).toBeNull();
  });

  it('draws nothing for an update of fewer than ten files and leaves a standing result as it was', () => {
    observe(preparing(3, { updating: true, quiet: true, filesTotal: 9 }));
    expect(meaning()).toBeNull();
    observe(preparing(1999, { pressed: 1 }));
    observe(ready);
    observe(preparing(3, { pressed: 1, updating: true, quiet: true, filesTotal: 9 }));
    expect(meaning()).toMatchObject({ phase: 'ready', card: 'open' });
    expect(workRuns.readMeaningProgress()?.filesTotal).toBe(2000);
  });

  it('never raises the card for an update of changed files', () => {
    observe(preparing(4, { updating: true, filesTotal: 12 }));
    expect(meaning()?.card).toBe('closed');
    expect(ring()).toBe('meaning');
    observe(null);
    expect(meaning()).toBeNull();
  });

  it('closes on Stop, keeps it closed while stopped, and opens again only for Resume', () => {
    const stop = vi.fn();
    workRuns.setMeaningStop(stop);
    observe(preparing(10, { pressed: 1 }));
    workRuns.stopRun(KEY);
    expect(stop).toHaveBeenCalledOnce();
    expect(meaning()?.card).toBe('closed');
    observe({ ...preparing(10, { pressed: 1 }), phase: 'stopped' });
    observe({ ...preparing(10, { pressed: 1 }), phase: 'stopped' });
    expect(meaning()?.card).toBe('closed');
    observe(preparing(11, { pressed: 2 }));
    expect(meaning()?.card).toBe('open');
  });

  it('keeps a press open when its first answer is the held status the job had before', () => {
    observe({ ...preparing(10), phase: 'stopped' });
    observe({ ...preparing(10, { pressed: 1 }), phase: 'stopped' });
    expect(named(), 'nothing to say while it is still held').toBeNull();
    observe(preparing(11, { pressed: 1 }));
    expect(meaning()?.card).toBe('open');
    expect(named()).toBe('meaning');
  });

  it('shows the result only where the card was open, and never over the desk', () => {
    observe(preparing(1999, { pressed: 1 }));
    observe(ready);
    expect(meaning()).toMatchObject({ phase: 'ready', card: 'open' });

    workRuns.reset();
    workRuns.leaveFolder(FOLDER, now);
    observe(preparing(1999, { pressed: 1 }));
    workRuns.hideActive();
    observe(ready);
    expect(meaning()?.card).toBe('closed');

    workRuns.reset();
    workRuns.leaveFolder(FOLDER, now);
    observe(preparing(1999, { pressed: 1 }));
    observe(ready, { stage: true });
    expect(meaning()?.card).toBe('closed');
  });

  it('stands down while the desk line is on screen and returns when the person leaves', () => {
    observe(preparing(5, { pressed: 1 }));
    observe(preparing(6, { pressed: 1 }), { stage: true });
    expect(named()).toBeNull();
    observe(preparing(7, { pressed: 1 }));
    expect(named()).toBe('meaning');
  });

  it("keeps another folder's run as it was left and shows it again on return", () => {
    observe(preparing(5, { pressed: 1 }));
    workRuns.leaveFolder(OTHER, now);
    observe(null, { folder: OTHER });
    expect(meaning(OTHER)).toBeNull();
    expect(meaning()).toMatchObject({ card: 'open', pressed: 1 });
    expect(named(), "another folder's run is never shown").toBeNull();
    workRuns.leaveFolder(FOLDER, now);
    observe(preparing(9, { pressed: 1 }));
    expect(meaning()).toMatchObject({ card: 'open', pressed: 1 });
    expect(named()).toBe('meaning');
  });
});

describe('beside the wiki check', () => {
  it('names the run started last, and the ring follows the run the card names', () => {
    workRuns.begin({ folder: FOLDER, owner: 'launch:claude-acp', agent: 'Claude Agent', startedAt: 500 });
    observe(preparing(1, { pressed: 1 }));
    expect(seatRuns(workRuns.read()).map((entry) => entry.kind)).toEqual(['check', 'meaning']);
    expect(ring()).toBe('meaning');
    workRuns.stopRun(KEY);
    expect(named()).toBe('check');
    expect(ring()).toBe('check');
  });

  it('Stop in the list ends only its own run', () => {
    const stopMeaning = vi.fn();
    const stopCheck = vi.fn();
    workRuns.setMeaningStop(stopMeaning);
    const checkId = workRuns.begin({ folder: FOLDER, owner: 'launch:claude-acp', agent: 'Claude Agent', startedAt: 500 });
    workRuns.setStop(checkId, stopCheck);
    observe(preparing(1, { pressed: 1 }));
    workRuns.stopRun(`check:${checkId}`);
    expect(stopCheck).toHaveBeenCalledOnce();
    expect(stopMeaning).not.toHaveBeenCalled();
    expect(meaning()?.card).toBe('open');
  });
});

describe('the meaning figures', () => {
  it('redraw at most four times a second, and the last figure always lands', () => {
    const drawn: number[] = [];
    const drawnAt: number[] = [];
    const stopListening = workRuns.subscribeMeaningProgress(() => {
      drawn.push(workRuns.readMeaningProgress()?.filesDone ?? -1);
      drawnAt.push(Date.now());
    });
    observe(preparing(0, { pressed: 1 }));
    for (let event = 1; event <= 1_200; event += 1) {
      now += 50;
      vi.advanceTimersByTime(50);
      observe(preparing(event, { pressed: 1 }));
    }
    vi.advanceTimersByTime(MEANING_PROGRESS_INTERVAL_MS);
    stopListening();
    const gaps = drawnAt.slice(1).map((at, index) => at - drawnAt[index]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(MEANING_PROGRESS_INTERVAL_MS);
    expect(drawn.length).toBeGreaterThan(200);
    expect(drawn.at(-1)).toBe(1_200);
    expect(workRuns.readMeaningProgress()).toMatchObject({ filesDone: 1_200, fraction: 0.6 });
  });

  it('never change the snapshot the shell reads while only the count moves', () => {
    observe(preparing(0, { pressed: 1 }));
    const before = workRuns.read();
    const shell = vi.fn();
    const stopListening = workRuns.subscribe(shell);
    for (let event = 1; event <= 100; event += 1) observe(preparing(event, { pressed: 1 }));
    stopListening();
    expect(shell).not.toHaveBeenCalled();
    expect(workRuns.read()).toBe(before);
  });

  it('carry bytes while the model downloads and stay full while it is converted', () => {
    observe({ ...preparing(0, { pressed: 1 }), phase: 'modelDownloading', bytes: { done: 500, total: 2_000 } });
    expect(workRuns.readMeaningProgress()?.fraction).toBe(0.25);
    observe({ ...preparing(0, { pressed: 1 }), phase: 'modelConverting' });
    expect(workRuns.readMeaningProgress()?.fraction).toBe(1);
    observe({ ...preparing(0, { pressed: 1 }), phase: 'waitingTurn' });
    expect(workRuns.readMeaningProgress()?.fraction).toBeNull();
  });
});
