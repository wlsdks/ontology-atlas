import { describe, expect, it } from 'vitest';

import { fuseScoredLists, type ScoredItem } from './lead-fusion';

interface Lead { id: string; kind: 'claim' | 'source' }

const key = (lead: Lead) => lead.id;
const claimFirst = (a: Lead, b: Lead) => (a.kind === b.kind ? 0 : a.kind === 'claim' ? -1 : 1);
const ids = (leads: readonly { item: Lead }[]) => leads.map((lead) => lead.item.id);

const claim = (id: string, score = 1): ScoredItem<Lead> => ({ item: { id, kind: 'claim' }, score });
const source = (id: string, score = 1): ScoredItem<Lead> => ({ item: { id, kind: 'source' }, score });
const EVEN = [1, 1];

describe('fuseScoredLists', () => {
  it('orders items by score across lists, not by their place in a list', () => {
    const fused = fuseScoredLists([[claim('c1', 0.9), claim('c2', 0.2)], [source('s1', 0.5)]], EVEN, key, claimFirst);
    expect(ids(fused)).toEqual(['c1', 's1', 'c2']);
  });

  it('weighs each list, so a weak item of a heavy list can pass a strong item of a light one', () => {
    const lists = [[claim('words', 0.3)], [source('meaning', 0.9)]];
    expect(ids(fuseScoredLists(lists, [1, 1], key, claimFirst))).toEqual(['meaning', 'words']);
    expect(ids(fuseScoredLists(lists, [4, 1], key, claimFirst))).toEqual(['words', 'meaning']);
  });

  it('adds the scores of an item two lists hold', () => {
    const fused = fuseScoredLists([[claim('a', 0.6), claim('shared', 0.4)], [source('b', 0.7), claim('shared', 0.4)]], EVEN, key, claimFirst);
    expect(ids(fused)).toEqual(['shared', 'b', 'a']);
    expect(fused[0]!.lists).toEqual([0, 1]);
    expect(fused[1]!.lists).toEqual([1]);
  });

  it('breaks equal scores with the tie rule before the key', () => {
    const fused = fuseScoredLists([[source('a-source')], [claim('z-claim')]], EVEN, key, claimFirst);
    expect(ids(fused)).toEqual(['z-claim', 'a-source']);
  });

  it('falls back to the key when the tie rule cannot decide', () => {
    const fused = fuseScoredLists([[source('b')], [source('a')]], EVEN, key, claimFirst);
    expect(ids(fused)).toEqual(['a', 'b']);
  });

  it('returns the same order whichever list comes first', () => {
    const words = [claim('c1', 0.7), claim('shared', 0.1 + 0.2), claim('c3', 0.2)];
    const meaning = [source('s3', 0.3), claim('shared', 0.6), claim('c1', 0.1)];
    const forward = fuseScoredLists([words, meaning], [1, 0.7], key, claimFirst);
    const backward = fuseScoredLists([meaning, words], [0.7, 1], key, claimFirst);
    expect(ids(backward)).toEqual(ids(forward));
  });

  it('counts an item once per list, at its best score there, when a list repeats it', () => {
    const fused = fuseScoredLists([[claim('a', 0.2), claim('a', 0.8)], [claim('b', 0.7)]], EVEN, key, claimFirst);
    expect(ids(fused)).toEqual(['a', 'b']);
    expect(fused.map((lead) => lead.lists)).toEqual([[0], [1]]);
  });

  it('folds an item into the host it names, and the host keeps the better score of each list', () => {
    const fold = (lead: Lead) => (lead.id === 's1' ? ['c3'] : []);
    const claims = [claim('c1', 0.6), claim('c2', 0.5), claim('c3', 0.4)];
    const passages = [source('s1', 0.9), source('s2', 0.1)];
    const fused = fuseScoredLists([claims, passages], EVEN, key, claimFirst, fold);
    expect(ids(fused)).toEqual(['c3', 'c1', 'c2', 's2']);
    expect(fused[0]!.lists).toEqual([0, 1]);
  });

  it('never lowers a host, and leaves an item whose host is absent', () => {
    const fold = (lead: Lead) => (lead.id === 's1' ? ['c1'] : lead.id === 's2' ? ['missing'] : []);
    const fused = fuseScoredLists([[claim('c1', 0.9), claim('c2', 0.3), source('s1', 0.1)], [source('s2', 0.5)]], EVEN, key, claimFirst, fold);
    expect(ids(fused)).toEqual(['c1', 's2', 'c2']);
    expect(fused[0]!.lists).toEqual([0]);
  });

  it('folds into the best-scoring host when several name the item, whichever list comes first', () => {
    const fold = (lead: Lead) => (lead.id === 's1' ? ['c2', 'c1'] : []);
    const claims = [claim('c1', 0.8), claim('c2', 0.4)];
    const passages = [source('s1', 0.5)];
    const forward = fuseScoredLists([claims, passages], EVEN, key, claimFirst, fold);
    const backward = fuseScoredLists([passages, claims], EVEN, key, claimFirst, fold);
    expect(ids(forward)).toEqual(['c1', 'c2']);
    expect(forward[0]!.lists).toEqual([0, 1]);
    expect(ids(backward)).toEqual(ids(forward));
  });

  it('returns nothing for no lists and for empty lists', () => {
    expect(fuseScoredLists<Lead>([], [], key, claimFirst)).toEqual([]);
    expect(fuseScoredLists<Lead>([[], []], EVEN, key, claimFirst)).toEqual([]);
  });
});
