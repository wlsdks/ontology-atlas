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

  it('folds an item into the host it names and keeps both rank contributions', () => {
    const hosts: Record<string, string[]> = { s1: ['c3'] };
    const fold = (lead: Lead) => hosts[lead.id] ?? [];
    const claims = [claim('c1'), claim('c2'), claim('c3')];
    const passages = [source('s1'), source('s2')];
    const unfolded = fuseRankedLists([claims, passages], key, claimFirst);
    const fused = fuseRankedLists([claims, passages], key, claimFirst, fold);
    expect(ids(fused)).not.toContain('s1');
    expect(fused).toHaveLength(unfolded.length - 1);
    // c3 alone ranks last; with s1's first place added it outranks every single-list item.
    expect(ids(fused)).toEqual(['c3', 'c1', 'c2', 's2']);
    expect(fused[0]!.lists).toEqual([0, 1]);
  });

  it('never lowers a host, and leaves an item whose host is absent', () => {
    const fold = (lead: Lead) => (lead.id === 's1' ? ['c1'] : lead.id === 's2' ? ['missing'] : []);
    const fused = fuseRankedLists([[claim('c1'), claim('c2')], [source('s2'), source('s1')]], key, claimFirst, fold);
    expect(ids(fused)).toEqual(['c1', 's2', 'c2']);
  });

  it('folds into the best-scoring host when several name the item, whichever list comes first', () => {
    const fold = (lead: Lead) => (lead.id === 's1' ? ['c2', 'c1'] : []);
    const claims = [claim('c1'), claim('c2')];
    const passages = [source('s1')];
    const forward = fuseRankedLists([claims, passages], key, claimFirst, fold);
    const backward = fuseRankedLists([passages, claims], key, claimFirst, fold);
    expect(ids(forward)).toEqual(['c1', 'c2']);
    expect(forward[0]!.lists).toEqual([0, 1]);
    expect(ids(backward)).toEqual(ids(forward));
  });

  it('returns nothing for no lists and for empty lists', () => {
    expect(fuseRankedLists<Lead>([], key, claimFirst)).toEqual([]);
    expect(fuseRankedLists<Lead>([[], []], key, claimFirst)).toEqual([]);
  });
});
