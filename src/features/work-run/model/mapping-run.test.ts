import { describe, expect, it } from 'vitest';

import {
  afterRequest,
  beginMappingRun,
  MAPPING_SILENCE_LIMIT_MS,
  mappingFraction,
  observeMappingWork,
  silentTooLong,
  stopMappingRun,
  type MappingFigures,
  type MappingRequestEnd,
  type MappingRun,
} from './mapping-run';

const one = (uncovered: number, total = 120): MappingFigures => ({
  widest: { abilitiesUncovered: uncovered, abilitiesTotal: total },
  sum: { abilitiesUncovered: uncovered, abilitiesTotal: total },
});

const begin = (figures: MappingFigures | null = one(96)) => beginMappingRun({
  id: 1, folder: 'local:launch', folderName: 'launch', agent: 'Claude Agent', figures, startedAt: 0,
});

const end = (fields: Partial<MappingRequestEnd> = {}): MappingRequestEnd => ({
  outcome: { kind: 'completed' }, figures: one(72), draft: false, at: 120_000, ...fields,
});

const working = { kind: 'reading', label: null, target: 'src/a.ts', asking: false };
const waiting = { kind: 'writing', label: null, target: 'wiki/a.md', asking: true };

describe('the rule at a request\'s end', () => {
  it('sends the next request when the line went down and nothing stops it', () => {
    const next = afterRequest(begin(), end());
    expect(next).toMatchObject({ phase: 'running', stopReason: null, requestsSent: 2, requestStartedAt: 120_000, endedAt: null });
    expect(next.now).toEqual(one(72));
    expect(next.finished).toEqual([{ gained: 24, durationMs: 120_000 }]);
  });

  it('stops as pressed when the person pressed Stop, before any other rule', () => {
    const stopping = stopMappingRun(begin(), 'press');
    const next = afterRequest(stopping, end({ outcome: { kind: 'failed', usageLimit: true }, figures: null, draft: true }));
    expect(next).toMatchObject({ phase: 'stopped', stopReason: 'press', endedAt: 120_000 });
  });

  it('stops as pressed for a turn cancelled from the composer', () => {
    expect(afterRequest(begin(), end({ outcome: { kind: 'cancelled' } }))).toMatchObject({ phase: 'stopped', stopReason: 'press' });
  });

  it('names a usage limit apart from any other agent error, ahead of a draft', () => {
    expect(afterRequest(begin(), end({ outcome: { kind: 'failed', usageLimit: true } }))).toMatchObject({ stopReason: 'usageLimit' });
    expect(afterRequest(begin(), end({ outcome: { kind: 'failed', usageLimit: false }, draft: true }))).toMatchObject({ phase: 'stopped', stopReason: 'agentError' });
  });

  it('finishes when the line is gone after having been there, or reads zero', () => {
    const gone = afterRequest(begin(), end({ figures: null }));
    expect(gone).toMatchObject({ phase: 'finished', stopReason: null, now: one(96) });
    expect(mappingFraction(gone)).toBe(1);
    expect(afterRequest(begin(), end({ figures: one(0), draft: true }))).toMatchObject({ phase: 'finished' });
  });

  it('stops for no progress when no line was ever read and none appeared', () => {
    expect(afterRequest(begin(null), end({ figures: null }))).toMatchObject({ phase: 'stopped', stopReason: 'noProgress' });
  });

  it('stops for no progress when abilities off the map did not go down, ahead of a draft', () => {
    expect(afterRequest(begin(), end({ figures: one(96), draft: true }))).toMatchObject({ stopReason: 'noProgress' });
    expect(afterRequest(begin(), end({ figures: one(100) }))).toMatchObject({ stopReason: 'noProgress' });
  });

  it('stops past the estimate before sending more than twice it plus two, ahead of a draft', () => {
    let run: MappingRun = begin(one(20));
    expect(run.estimate).toBe(1);
    for (let uncovered = 19; uncovered >= 17; uncovered -= 1) run = afterRequest(run, end({ figures: one(uncovered) }));
    expect(run).toMatchObject({ phase: 'running', requestsSent: 4 });
    expect(afterRequest(run, end({ figures: one(16), draft: true }))).toMatchObject({ phase: 'stopped', stopReason: 'pastEstimate', requestsSent: 4 });
  });

  it('stops for a message when the composer holds a draft at the boundary', () => {
    expect(afterRequest(begin(), end({ draft: true }))).toMatchObject({ phase: 'stopped', stopReason: 'message' });
  });

  it('judges progress on the sum of projects while the card keeps the widest project', () => {
    const two = (widest: number, sum: number): MappingFigures => ({
      widest: { abilitiesUncovered: widest, abilitiesTotal: 100 },
      sum: { abilitiesUncovered: sum, abilitiesTotal: 160 },
    });
    const run = begin(two(80, 120));
    expect(run.estimate).toBe(5);
    const next = afterRequest(run, end({ figures: two(80, 110) }));
    expect(next).toMatchObject({ phase: 'running', finished: [{ gained: 10 }] });
    expect(mappingFraction(next)).toBe(0.2);
    expect(afterRequest(next, end({ figures: two(60, 110) }))).toMatchObject({ stopReason: 'noProgress' });
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
