import { describe, expect, it } from 'vitest';

import type { BriefRow } from './brief-rows';
import { briefRowHref, splitBriefTodo } from './brief-todo';

const line = (id: string, count: number): BriefRow => ({
  kind: 'line',
  core: 'ontology',
  availability: 'measured',
  line: { id, count, state: 'stale' } as never,
});
const hrefOf = (row: BriefRow) => briefRowHref(row, false);
const ids = (rows: readonly BriefRow[]) => rows.map((row) => (row.kind === 'line' ? row.line.id : row.kind));

describe('splitBriefTodo', () => {
  it('takes the first three counted lines and leaves the rest in order', () => {
    const rows = [line('ontology-repair', 8), line('ontology-unmatched', 2), line('wiki-stale-pages', 1), line('wiki-orphan-pages', 4)];
    const { todo, rest } = splitBriefTodo(rows, hrefOf);
    expect(ids(todo)).toEqual(['ontology-repair', 'ontology-unmatched', 'wiki-stale-pages']);
    expect(ids(rest)).toEqual(['wiki-orphan-pages']);
  });

  it('takes fewer than three when fewer qualify, and none when none do', () => {
    expect(ids(splitBriefTodo([line('ontology-repair', 8)], hrefOf).todo)).toEqual(['ontology-repair']);
    const none = splitBriefTodo([{ kind: 'app-only', cores: ['harness'] }], hrefOf);
    expect(none.todo).toEqual([]);
    expect(none.rest).toHaveLength(1);
  });

  it('skips zero lines and counts them as zero in the rest', () => {
    const rows = [line('ontology-repair', 0), line('ontology-unmatched', 3)];
    const { todo, rest, zeroCount } = splitBriefTodo(rows, hrefOf);
    expect(ids(todo)).toEqual(['ontology-unmatched']);
    expect(ids(rest)).toEqual(['ontology-repair']);
    expect(zeroCount).toBe(1);
  });

  it('keeps status and app-only rows in the rest, counting quiet and no-data as zero', () => {
    const rows: BriefRow[] = [
      line('ontology-repair', 1),
      { kind: 'app-only', cores: ['harness'] },
      { kind: 'status', core: 'wiki', status: 'no-data' },
      { kind: 'status', core: 'agent', status: 'quiet' },
      { kind: 'status', core: 'ontology', status: 'unreadable' },
    ];
    const { todo, rest, zeroCount } = splitBriefTodo(rows, hrefOf);
    expect(todo).toHaveLength(1);
    expect(rest.map((row) => row.kind)).toEqual(['app-only', 'status', 'status', 'status']);
    expect(zeroCount).toBe(2);
  });

  it('keeps a counted line with no destination in the rest', () => {
    const rows = [line('unknown-line', 5), line('ontology-repair', 2)];
    const { todo, rest } = splitBriefTodo(rows, hrefOf);
    expect(ids(todo)).toEqual(['ontology-repair']);
    expect(ids(rest)).toEqual(['unknown-line']);
  });
});
