import { describe, expect, it } from 'vitest';

import type { MapAnalysis, MapAnalysisRecordState } from '@/shared/lib/vault-document/map-analysis-record';
import { analysisWhen, mapAnalysisChipModel, MAP_ANALYSIS_RUNNING_WINDOW_MS } from './map-analysis-chip';

const NOW = new Date(2026, 10, 24, 15, 0).getTime();
const daysAgo = (days: number, hour = 10) => new Date(2026, 10, 24 - days, hour, 0).toISOString();

const analysis = (number: number, fields: Partial<MapAnalysis> = {}): MapAnalysis => ({
  id: `a${number}`,
  number,
  origin: 'session',
  startedAt: daysAgo(4),
  at: daysAgo(4),
  agent: 'claude-code',
  sourceCommit: null,
  sourceDirty: null,
  abilities: { total: 100, offMap: 38 },
  areas: { total: 9, notMapped: 3 },
  concepts: { added: 4, changed: 1, removed: 0 },
  sessions: 1,
  ...fields,
});
const read = (...analyses: MapAnalysis[]): MapAnalysisRecordState => ({ kind: 'read', analyses });
const line = (abilitiesUncovered: number, abilitiesTotal = 100) => ({ abilitiesUncovered, abilitiesTotal });
const base = { hasProject: true, noteFigures: line(38), record: read(analysis(3)), pressRunning: false, nowMs: NOW };

describe('the map analysis chip', () => {
  it('is not drawn without a project, or with neither a line nor a record', () => {
    expect(mapAnalysisChipModel({ ...base, hasProject: false })).toBeNull();
    expect(mapAnalysisChipModel({ ...base, noteFigures: null, record: { kind: 'absent' } })).toBeNull();
  });

  it('reads share, analysis number and days since when a record and a line exist', () => {
    const model = mapAnalysisChipModel(base);
    expect(model?.pill).toEqual({ kind: 'full', percent: 62, number: 3, when: { kind: 'days', days: 4 } });
    expect(model?.counted).toEqual({ number: 3, when: { kind: 'days', days: 4 } });
    expect(model?.offMap).toBe(38);
  });

  it('says no analysis is recorded when the line exists without a record, and when the record cannot be read', () => {
    expect(mapAnalysisChipModel({ ...base, record: { kind: 'absent' } })?.pill).toEqual({ kind: 'shareOnly', percent: 62 });
    const unreadable = mapAnalysisChipModel({ ...base, record: { kind: 'unreadable' } });
    expect(unreadable?.pill).toEqual({ kind: 'shareOnly', percent: 62 });
    expect(unreadable?.record).toBe('unreadable');
  });

  it('drops the share when no code was connected', () => {
    const model = mapAnalysisChipModel({ ...base, noteFigures: null, record: read(analysis(2, { abilities: null })) });
    expect(model?.pill).toEqual({ kind: 'noShare', number: 2, when: { kind: 'days', days: 4 } });
    expect(model?.rows[0]).toMatchObject({ before: null, after: null });
  });

  it('reads everything on the map once the line is gone and the last count left nothing off', () => {
    const model = mapAnalysisChipModel({ ...base, noteFigures: null, record: read(analysis(5, { abilities: { total: 383, offMap: 0 } })) });
    expect(model?.pill).toMatchObject({ kind: 'full', percent: 100 });
    expect(model?.share).toEqual({ mapped: 383, total: 383, percent: 100 });
    expect(model?.offMap).toBe(0);
  });

  it('takes the note\'s share over the record\'s when they differ', () => {
    expect(mapAnalysisChipModel({ ...base, noteFigures: line(10) })?.pill).toMatchObject({ percent: 90 });
  });

  it('reads as running during a press, and for the run\'s silence limit after a terminal agent\'s last line', () => {
    expect(mapAnalysisChipModel({ ...base, pressRunning: true })?.pill).toEqual({ kind: 'running', percent: 62 });
    const at = NOW - MAP_ANALYSIS_RUNNING_WINDOW_MS / 2;
    const recent = mapAnalysisChipModel({ ...base, record: read(analysis(4, { at: new Date(at).toISOString() })) });
    expect(recent?.pill.kind).toBe('running');
    expect(recent?.runningUntilMs).toBe(at + MAP_ANALYSIS_RUNNING_WINDOW_MS);
    const settled = mapAnalysisChipModel({ ...base, record: read(analysis(4, { at: new Date(at).toISOString() })), nowMs: at + MAP_ANALYSIS_RUNNING_WINDOW_MS });
    expect(settled?.pill).toEqual({ kind: 'full', percent: 62, number: 4, when: { kind: 'today' } });
  });

  it('lists five analyses newest first with the share before and after, and counts the rest', () => {
    const analyses = Array.from({ length: 7 }, (_, index) => analysis(index + 1, { abilities: { total: 100, offMap: 70 - index * 10 } }));
    analyses[5] = analysis(6, { abilities: null });
    const model = mapAnalysisChipModel({ ...base, record: read(...analyses) });
    expect(model?.rows.map(({ number, before, after }) => ({ number, before, after }))).toEqual([
      { number: 7, before: 70, after: 90 },
      { number: 6, before: null, after: null },
      { number: 5, before: 60, after: 70 },
      { number: 4, before: 50, after: 60 },
      { number: 3, before: 40, after: 50 },
    ]);
    expect(model?.earlier).toBe(2);
    expect(mapAnalysisChipModel({ ...base, record: read(analysis(1)) })?.rows[0]).toMatchObject({ before: null, after: 62 });
  });
});

describe('the time since an analysis', () => {
  it('counts calendar days, and reads a time in the future as today', () => {
    expect(analysisWhen(new Date(2026, 10, 24, 0, 5).getTime(), NOW)).toEqual({ kind: 'today' });
    expect(analysisWhen(new Date(2026, 10, 23, 23, 55).getTime(), NOW)).toEqual({ kind: 'yesterday' });
    expect(analysisWhen(new Date(2026, 10, 20, 12).getTime(), NOW)).toEqual({ kind: 'days', days: 4 });
    expect(analysisWhen(NOW + 3 * 24 * 60 * 60_000, NOW)).toEqual({ kind: 'today' });
  });
});
