import { describe, expect, it } from 'vitest';

import type { BriefCore } from './brief-model';
import { briefRows } from './brief-rows';

const core = (overrides: Partial<BriefCore> & Pick<BriefCore, 'core' | 'availability'>): BriefCore => ({
  headline: null,
  current: null,
  stale: null,
  unknown: null,
  lines: [],
  ...overrides,
});

describe('briefRows — one list across the four cores', () => {
  it('puts stale before unknown before what happened, across cores, keeping core order inside a state', () => {
    const rows = briefRows([
      core({ core: 'ontology', availability: 'measured', lines: [
        { id: 'ontology-changed-since', count: 3, state: 'current' },
        { id: 'ontology-evidence-unchecked', count: 20, state: 'unknown' },
      ] }),
      core({ core: 'wiki', availability: 'measured', lines: [{ id: 'wiki-stale-pages', count: 1, state: 'stale' }] }),
      core({ core: 'harness', availability: 'measured', lines: [{ id: 'harness-untold-areas', count: 2, state: 'unknown' }] }),
      core({ core: 'agent', availability: 'measured', lines: [{ id: 'agent-calls-since', count: 4, state: 'current' }] }),
    ]);
    expect(rows.map((row) => (row.kind === 'line' ? row.line.id : row.kind))).toEqual([
      'wiki-stale-pages',
      'ontology-evidence-unchecked',
      'harness-untold-areas',
      'ontology-changed-since',
      'agent-calls-since',
    ]);
  });

  it('gives a core that cannot count one row, and drops lines whose count is zero', () => {
    const rows = briefRows([
      core({ core: 'ontology', availability: 'measured', lines: [{ id: 'ontology-repair', count: 0, state: 'stale' }] }),
      core({ core: 'wiki', availability: 'no-data' }),
      core({ core: 'harness', availability: 'no-source' }),
      core({ core: 'agent', availability: 'reading' }),
    ]);
    expect(rows).toEqual([
      { kind: 'status', core: 'ontology', status: 'quiet' },
      { kind: 'status', core: 'wiki', status: 'no-data' },
      { kind: 'status', core: 'harness', status: 'no-source' },
      { kind: 'status', core: 'agent', status: 'reading' },
    ]);
  });

  /*
   * The hosted sample printed "measured in the app" twice and "Get the app" three times on
   * one screen (2026-09-23), against a decision that says nothing is listed twice.
   */
  it('says the app-only reason once, straight after the lines, naming every core it covers', () => {
    const rows = briefRows([
      core({ core: 'ontology', availability: 'app-only', lines: [{ id: 'ontology-evidence-unchecked', count: 125, state: 'unknown' }] }),
      core({ core: 'wiki', availability: 'no-data' }),
      core({ core: 'harness', availability: 'app-only' }),
      core({ core: 'agent', availability: 'no-data' }),
    ]);
    expect(rows.filter((row) => row.kind === 'app-only')).toEqual([{ kind: 'app-only', cores: ['ontology', 'harness'] }]);
    expect(rows.map((row) => row.kind)).toEqual(['line', 'app-only', 'status', 'status']);
    expect(rows[0]).toMatchObject({ kind: 'line', core: 'ontology', availability: 'app-only' });
  });
});
