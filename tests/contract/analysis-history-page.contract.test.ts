import { describe, expect, it } from 'vitest';

import { createNamePage } from '../../mcp/src/analysis-history/name-page.mts';

function expected(names: string[], limit: number, cursor: string | null) {
  const remaining = names.filter(name => cursor === null || name < cursor).sort().reverse();
  const page = remaining.slice(0, limit);
  return { names: page, totalFiles: names.length, nextCursor: remaining.length > page.length ? page.at(-1) : null };
}

describe('analysis history file selection', () => {
  it.each([
    { names: [], limit: 30, cursor: null },
    { names: ['b'], limit: 1, cursor: null },
    { names: ['c', 'a', 'b', 'b'], limit: 2, cursor: null },
    { names: ['d', 'b', 'c', 'a'], limit: 2, cursor: 'c' },
    { names: ['d', 'b', 'c', 'a'], limit: 2, cursor: 'a' },
    { names: ['개념', '😀', 'a', 'b'], limit: 3, cursor: null },
  ])('keeps the original full-sort page and cursor for $names', ({ names, limit, cursor }) => {
    const selection = createNamePage(limit, cursor);
    for (const name of names) selection.add(name);
    expect(selection.page()).toEqual(expected(names, limit, cursor));
  });

  it('keeps the newest hundred from a hundred thousand streamed names', () => {
    const selection = createNamePage(100);
    for (let index = 0; index < 100_000; index += 1) selection.add(String(index).padStart(6, '0'));
    const page = selection.page();
    expect(page.totalFiles).toBe(100_000);
    expect(page.names).toEqual(Array.from({ length: 100 }, (_, index) => String(99_999 - index).padStart(6, '0')));
    expect(page.nextCursor).toBe('099900');
  });

  it('matches full sorting through every page of an unsorted inventory', () => {
    const names = Array.from({ length: 1000 }, (_, index) => String((index * 613) % 1000).padStart(4, '0'));
    let cursor: string | null = null;
    const visited: string[] = [];
    do {
      const selection = createNamePage(31, cursor);
      for (const name of names) selection.add(name);
      const page = selection.page();
      expect(page).toEqual(expected(names, 31, cursor));
      visited.push(...page.names);
      cursor = page.nextCursor ?? null;
    } while (cursor !== null);
    expect(visited).toEqual([...names].sort().reverse());
  });
});
