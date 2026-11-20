import { describe, expect, it } from 'vitest';

import { fuseRankedLists } from './lead-fusion';

interface Lead { id: string; kind: 'claim' | 'source' }

const key = (lead: Lead) => lead.id;
const claimFirst = (a: Lead, b: Lead) => (a.kind === b.kind ? 0 : a.kind === 'claim' ? -1 : 1);
const ids = (leads: readonly { item: Lead }[]) => leads.map((lead) => lead.item.id);

const claim = (id: string): Lead => ({ id, kind: 'claim' });
const source = (id: string): Lead => ({ id, kind: 'source' });

describe('fuseRankedLists', () => {
  it('interleaves two lists by rank, the better rank first', () => {
    const fused = fuseRankedLists([[claim('c1'), claim('c2'), claim('c3')], [source('s1')]], key, claimFirst);
    expect(ids(fused)).toEqual(['c1', 's1', 'c2', 'c3']);
  });

  it('ranks an item held by two lists above an item held by one at the same rank', () => {
    const fused = fuseRankedLists([[claim('a'), claim('shared')], [source('b'), claim('shared')]], key, claimFirst);
    expect(ids(fused)).toEqual(['shared', 'a', 'b']);
    expect(fused[0]!.lists).toEqual([0, 1]);
    expect(fused[1]!.lists).toEqual([0]);
  });

  it('breaks equal scores with the tie rule before the key', () => {
    const fused = fuseRankedLists([[source('a-source')], [claim('z-claim')]], key, claimFirst);
    expect(ids(fused)).toEqual(['z-claim', 'a-source']);
  });

  it('falls back to the key when the tie rule cannot decide', () => {
    const fused = fuseRankedLists([[source('b')], [source('a')]], key, claimFirst);
    expect(ids(fused)).toEqual(['a', 'b']);
  });

  it('returns the same order whichever list comes first', () => {
    const words = [claim('c1'), claim('shared'), claim('c3')];
    const passages = [source('s1'), claim('shared'), source('s3')];
    const meaning = [source('s3'), claim('c1')];
    const forward = fuseRankedLists([words, passages, meaning], key, claimFirst);
    const backward = fuseRankedLists([meaning, passages, words], key, claimFirst);
    expect(ids(backward)).toEqual(ids(forward));
  });

  it('counts an item once per list even when a list repeats it', () => {
    const fused = fuseRankedLists([[claim('a'), claim('a')], [claim('b')]], key, claimFirst);
    expect(fused.map((lead) => lead.lists)).toEqual([[0], [1]]);
  });

  it('returns nothing for no lists and for empty lists', () => {
    expect(fuseRankedLists<Lead>([], key, claimFirst)).toEqual([]);
    expect(fuseRankedLists<Lead>([[], []], key, claimFirst)).toEqual([]);
  });
});
