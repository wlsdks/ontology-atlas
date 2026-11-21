import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { READ_FEED_SIZE, useReadFeed } from './use-read-feed';

describe('the files the stage shows being read', () => {
  it('lands each file once the next is shown, newest first and at most three', () => {
    const { result, rerender } = renderHook(({ path }: { path: string | null }) => useReadFeed(path), {
      initialProps: { path: 'a.md' as string | null },
    });
    expect(result.current).toEqual([]);
    act(() => rerender({ path: 'b.md' }));
    expect(result.current.map((item) => item.path)).toEqual(['a.md']);
    for (const path of ['c.md', 'd.md', 'e.md']) act(() => rerender({ path }));
    expect(result.current.map((item) => item.path)).toEqual(['d.md', 'c.md', 'b.md']);
    expect(result.current).toHaveLength(READ_FEED_SIZE);
    expect(new Set(result.current.map((item) => item.id)).size).toBe(READ_FEED_SIZE);
  });
});
