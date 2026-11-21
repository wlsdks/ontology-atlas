import { describe, expect, it } from 'vitest';

import { judgeSource, writeUpFreshness } from './source-compile-state';
import type { WikiCitation } from './wiki-page-facts';

const citation = (sourceHash: string | null, truncated = false): WikiCitation => ({
  wikiSlug: 'wiki/a',
  sourcePath: 'sources/a.md',
  sourceHash,
  truncated,
  compiledDay: 1,
  page: 0,
});

describe('judgeSource', () => {
  it('is not compiled while no page cites the source', () => {
    expect(judgeSource(undefined, 'h1', false)).toBe('not-compiled');
    expect(judgeSource([], 'h1', false)).toBe('not-compiled');
  });

  it('is stale when every citation lacks a hash, because none proves coverage', () => {
    expect(judgeSource([citation(null)], 'h1', false)).toBe('stale');
    expect(judgeSource([citation(null)], undefined, false)).toBe('stale');
  });

  it('waits in checking until the file is hashed, or is unreadable when it could not be', () => {
    expect(judgeSource([citation('h1')], undefined, false)).toBe('checking');
    expect(judgeSource([citation('h1')], undefined, true)).toBe('unreadable');
  });

  it('is stale when no hashed citation matches the bytes now', () => {
    expect(judgeSource([citation('h0')], 'h1', false)).toBe('stale');
  });

  it('is compiled when any matching page read the whole file, partial when every matching page read part', () => {
    expect(judgeSource([citation('h1', true), citation('h1')], 'h1', false)).toBe('compiled');
    expect(judgeSource([citation('h1', true), citation('h0')], 'h1', false)).toBe('partial');
  });
});

describe('writeUpFreshness', () => {
  it('reads a page with no recorded hash as behind, and an unmeasured file as unchecked', () => {
    expect(writeUpFreshness(citation(null), 'h1')).toBe('behind');
    expect(writeUpFreshness(citation('h1'), undefined)).toBe('unchecked');
  });

  it('is current only when the hash matches and the page read the whole file', () => {
    expect(writeUpFreshness(citation('h1'), 'h1')).toBe('current');
    expect(writeUpFreshness(citation('h1', true), 'h1')).toBe('partial');
    expect(writeUpFreshness(citation('h0'), 'h1')).toBe('behind');
  });
});
