import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { READ_FEED_SIZE, useReadFeed } from './use-read-feed';

describe('the files the stage shows being read', () => {
  it('lands each file once the next is shown, with the passages recorded while it was shown, newest first and at most three', () => {
    const { result, rerender } = renderHook(({ path, passages }: { path: string | null; passages: number }) => useReadFeed(path, passages), {
      initialProps: { path: 'a.md', passages: 10 },
    });
    expect(result.current).toEqual([]);
    act(() => rerender({ path: 'a.md', passages: 14 }));
    act(() => rerender({ path: 'b.md', passages: 16 }));
    expect(result.current.map(({ path, passages }) => [path, passages])).toEqual([['a.md', 6]]);
    for (const [index, path] of ['c.md', 'd.md', 'e.md'].entries()) act(() => rerender({ path, passages: 20 + index }));
    expect(result.current.map((item) => item.path)).toEqual(['d.md', 'c.md', 'b.md']);
    expect(result.current).toHaveLength(READ_FEED_SIZE);
    expect(new Set(result.current.map((item) => item.id)).size).toBe(READ_FEED_SIZE);
  });
});
