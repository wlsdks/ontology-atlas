import { describe, expect, it } from 'vitest';

import {
  afterRequest,
  beginMappingRun,
  MAPPING_REQUESTS_AT_MOST,
  MAPPING_SILENCE_LIMIT_MS,
  mappingFraction,
  observeMappingWork,
  silentTooLong,
  stopMappingRun,
  type MappingFigures,
  type MappingRequestEnd,
  type MappingRun,
} from './mapping-run';

const one = (uncovered: number, total = 120): MappingFigures => ({ abilitiesUncovered: uncovered, abilitiesTotal: total });

const begin = (figures: MappingFigures | null = one(96), project: string | null = 'launch') => beginMappingRun({
  id: 1, folder: '/vaults/launch', folderName: 'launch', project, agent: 'Claude Agent', figures, startedAt: 0,
});

/** A request that reached the agent; `sessionId: undefined` is one that never did. */
const end = (fields: Partial<MappingRequestEnd> = {}): MappingRequestEnd => ({
  outcome: { kind: 'completed' }, figures: one(72), draft: false, at: 120_000, sessionId: 's-1', ...fields,
});

const working = { kind: 'reading', label: null, target: 'src/a.ts', asking: false };
const waiting = { kind: 'writing', label: null, target: 'wiki/a.md', asking: true };

describe('the rule at a request\'s end', () => {
  it('sends the next request when the line went down and nothing stops it', () => {
    const next = afterRequest(begin(), end({ sessionId: 's-1' }));
    expect(next).toMatchObject({ phase: 'running', stopReason: null, requestsSent: 2, requestStartedAt: 120_000, endedAt: null });
    expect(next.now).toEqual(one(72));
    expect(next.finished).toEqual([{ gained: 24, durationMs: 120_000, sessionId: 's-1' }]);
  });

  it('stops as pressed when the person pressed Stop, before any other rule', () => {
    const stopping = stopMappingRun(begin(), 'press');
    const next = afterRequest(stopping, end({ outcome: { kind: 'failed', usageLimit: true }, figures: null, draft: true }));
    expect(next).toMatchObject({ phase: 'stopped', stopReason: 'press', endedAt: 120_000 });
  });

  it('stops as cancelled, not pressed, for a turn cancelled with no Stop pressed', () => {
    // Every Stop a person presses holds the run at stopping first; a bare cancel came from elsewhere.
    expect(afterRequest(begin(), end({ outcome: { kind: 'cancelled' } }))).toMatchObject({ phase: 'stopped', stopReason: 'cancelled' });
  });

  it('names a usage limit apart from any other agent error, ahead of a draft', () => {
    expect(afterRequest(begin(), end({ outcome: { kind: 'failed', usageLimit: true } }))).toMatchObject({ stopReason: 'usageLimit' });
    expect(afterRequest(begin(), end({ outcome: { kind: 'failed', usageLimit: false }, draft: true }))).toMatchObject({ phase: 'stopped', stopReason: 'agentError' });
  });

  it('finishes when the line reads zero, or is gone after last saying one request could map the rest', () => {
    expect(afterRequest(begin(), end({ figures: one(0), draft: true }))).toMatchObject({ phase: 'finished' });
    const gone = afterRequest(begin(one(31)), end({ figures: null }));
    expect(gone).toMatchObject({ phase: 'finished', stopReason: null, now: one(31) });
    expect(mappingFraction(gone)).toBe(1);
  });

  it('stops with the line lost, keeping what it last said, when it is gone with more left than one request maps', () => {
    expect(afterRequest(begin(one(32)), end({ figures: null }))).toMatchObject({ phase: 'stopped', stopReason: 'lineLost', now: one(32) });
    expect(afterRequest(begin(null), end({ figures: null }))).toMatchObject({ phase: 'stopped', stopReason: 'lineLost' });
  });

  it('stops with the line lost when the note cannot be read, though its last line one request could close', () => {
    expect(afterRequest(begin(one(31)), end({ figures: null, unreadable: true }))).toMatchObject({ phase: 'stopped', stopReason: 'lineLost', now: one(31) });
  });

  it('takes the first line a run begun without one reads, and estimates the rest from it', () => {
    const next = afterRequest(begin(null, null), end({ figures: one(40), project: 'launch' }));
    expect(next).toMatchObject({ phase: 'running', project: 'launch', now: one(40), requestsSent: 2, estimate: 1 + 4 });
    // A run that has its project keeps it, whatever line a request's end names.
    expect(afterRequest(begin(), end({ project: 'other' }))).toMatchObject({ project: 'launch', estimate: 8 });
  });

  it('neither lists nor counts a request that never reached the agent', () => {
    const between = stopMappingRun(afterRequest(begin(), end()), 'press');
    expect(between.requestsSent).toBe(2);
    const stopped = afterRequest(between, end({ sessionId: undefined, at: 125_000 }));
    expect(stopped).toMatchObject({ phase: 'stopped', stopReason: 'press', requestsSent: 1 });
    expect(stopped.finished).toEqual([{ gained: 24, durationMs: 120_000, sessionId: 's-1' }]);
  });

  it('stops for no progress when abilities off the map did not go down, ahead of a draft', () => {
    expect(afterRequest(begin(), end({ figures: one(96), draft: true }))).toMatchObject({ stopReason: 'noProgress' });
    expect(afterRequest(begin(), end({ figures: one(100) }))).toMatchObject({ stopReason: 'noProgress' });
  });

  it('stops past the estimate before sending more than twice it plus two, ahead of a draft', () => {
    let run: MappingRun = begin(one(13));
    expect(run.estimate).toBe(1);
    for (let uncovered = 12; uncovered >= 10; uncovered -= 1) run = afterRequest(run, end({ figures: one(uncovered) }));
    expect(run).toMatchObject({ phase: 'running', requestsSent: 4 });
    expect(afterRequest(run, end({ figures: one(9), draft: true }))).toMatchObject({ phase: 'stopped', stopReason: 'pastEstimate', requestsSent: 4 });
  });

  it('stops for a message when the composer holds a draft at the boundary', () => {
    expect(afterRequest(begin(), end({ draft: true }))).toMatchObject({ phase: 'stopped', stopReason: 'message' });
  });

  it('sends no more than the ceiling of requests in one press, whatever the note says is left', () => {
    let run: MappingRun = begin(one(100_000, 200_000));
    expect(run.estimate).toBeGreaterThan(MAPPING_REQUESTS_AT_MOST);
    for (let left = 99_999; run.phase === 'running'; left -= 1) run = afterRequest(run, end({ figures: one(left, 200_000) }));
    expect(run).toMatchObject({ phase: 'stopped', stopReason: 'pastEstimate', requestsSent: MAPPING_REQUESTS_AT_MOST });
  });

  it('keeps the fraction within the whole for figures that cannot be true', () => {
    expect(mappingFraction(begin(one(-5, 100)))).toBe(1);
    expect(mappingFraction(begin(one(300, 100)))).toBe(0);
    expect(mappingFraction(begin(one(Number.NaN, 100)))).toBeNull();
    expect(mappingFraction(begin(one(1, Number.POSITIVE_INFINITY)))).toBeNull();
  });

  it('leaves an ended run as it is', () => {
    const stopped = afterRequest(begin(), end({ draft: true }));
    expect(afterRequest(stopped, end())).toBe(stopped);
  });
});

describe('the agent\'s reports during a request', () => {
  it('waits on a permission request with no clock and brings back a hidden card', () => {
    const hidden: MappingRun = { ...begin(), card: 'hidden' };
    const asking = observeMappingWork(hidden, waiting, 60_000);
    expect(asking).toMatchObject({ phase: 'asking', card: 'open', line: { kind: 'writingFile', file: 'wiki/a.md' } });
    expect(silentTooLong(asking, 60_000 + MAPPING_SILENCE_LIMIT_MS * 3)).toBe(false);
  });

  it('counts ten minutes without a report as too long while running', () => {
    const run = observeMappingWork(begin(), working, 30_000);
    expect(silentTooLong(run, 30_000 + MAPPING_SILENCE_LIMIT_MS - 1)).toBe(false);
    expect(silentTooLong(run, 30_000 + MAPPING_SILENCE_LIMIT_MS)).toBe(true);
  });

  it('republishes an unchanged line only once a minute has passed, so a quiet read does not tick', () => {
    const run = observeMappingWork(begin(), working, 1_000);
    expect(observeMappingWork(run, working, 30_000)).toBe(run);
    expect(observeMappingWork(run, working, 61_000)).toMatchObject({ heardAt: 61_000, line: run.line });
  });

  it('holds stopping whatever the agent reports, and a folder switch outranks a press', () => {
    const stopping = stopMappingRun(begin(), 'press');
    expect(observeMappingWork(stopping, waiting, 5_000).phase).toBe('stopping');
    expect(stopMappingRun(stopping, 'switched')).toMatchObject({ stopReason: 'switched', card: 'open' });
    expect(stopMappingRun(stopMappingRun(begin(), 'switched'), 'press').stopReason).toBe('switched');
  });
});
