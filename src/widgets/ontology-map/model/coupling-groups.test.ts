import { describe, expect, it } from 'vitest';
import { findCouplingGroups } from './coupling-groups';

const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'isolated'];
const edges = [
  ['a', 'b'], ['a', 'c'], ['b', 'c'],
  ['d', 'e'], ['d', 'f'], ['e', 'f'], ['c', 'd'],
].map(([sourceId, targetId]) => ({ sourceId, targetId }));

describe('coupling groups', () => {
  it('keeps two dense neighbourhoods distinct across their single bridge', () => {
    const groups = findCouplingGroups(ids, edges);
    expect(groups[0]).toBe(groups[1]);
    expect(groups[1]).toBe(groups[2]);
    expect(groups[3]).toBe(groups[4]);
    expect(groups[4]).toBe(groups[5]);
    expect(groups[0]).not.toBe(groups[3]);
    expect(groups[6]).not.toBe(groups[0]);
    expect(groups[6]).not.toBe(groups[3]);
  });

  it('is independent of input order and reciprocal duplicate facts', () => {
    const expected = Object.fromEntries(ids.map((id, i) => [id, findCouplingGroups(ids, edges)[i]]));
    const reverseIds = [...ids].reverse();
    const reordered = [...edges].reverse().flatMap(edge => [edge, { sourceId: edge.targetId, targetId: edge.sourceId }]);
    const groups = findCouplingGroups(reverseIds, reordered);
    expect(Object.fromEntries(reverseIds.map((id, i) => [id, groups[i]]))).toEqual(expected);
  });

  it('never groups disconnected nodes through a missing endpoint or self relation', () => {
    const groups = findCouplingGroups(['one', 'two'], [
      { sourceId: 'one', targetId: 'missing' },
      { sourceId: 'one', targetId: 'one' },
    ]);
    expect(new Set(groups).size).toBe(2);
    expect(findCouplingGroups([], [])).toHaveLength(0);
  });

  it('keeps aggregation stable when a graph is read in a different order', () => {
    const names = Array.from({ length: 20 }, (_, i) => `node-${String(i).padStart(2, '0')}`);
    for (let fixture = 0; fixture < 12; fixture += 1) {
      const relations = names.flatMap((sourceId, i) => names.flatMap((targetId, j) =>
        j > i && (i * 17 + j * 31 + fixture * 13) % 17 < 3 ? [{ sourceId, targetId }] : []));
      const forward = findCouplingGroups(names, relations);
      const reversed = [...names].reverse();
      const backward = findCouplingGroups(reversed, [...relations].reverse());
      expect(Object.fromEntries(reversed.map((id, i) => [id, backward[i]])))
        .toEqual(Object.fromEntries(names.map((id, i) => [id, forward[i]])));
    }
  });
});
