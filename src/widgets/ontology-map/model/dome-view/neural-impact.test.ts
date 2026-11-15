import { describe, expect, it } from 'vitest';
import { neuralGraphOf } from './neural-cells';
import { carriesImpact, neuralImpact, neuralSpreadAt, neuralSpreadHopMs } from './neural-impact';

const depends = (sourceId: string, targetId: string, relationType = 'depends_on') =>
  ({ sourceId, targetId, kind: 'depends' as const, relationType });
const impactOf = (edges: ReturnType<typeof depends>[], focusId: string) => neuralImpact(neuralGraphOf([], edges), focusId);
const distances = (edges: ReturnType<typeof depends>[], focusId: string) => Object.fromEntries(impactOf(edges, focusId).distance);

describe("a selection's impact", () => {
  it('reaches every dependent of a chain, one hop further each', () => {
    const chain = [depends('b', 'a'), depends('c', 'b'), depends('d', 'c')];
    expect(distances(chain, 'a')).toEqual({ b: 1, c: 2, d: 3 });
    expect(impactOf(chain, 'a').countAt).toEqual([1, 1, 1]);
  });

  it('gives a concept reached two ways its fewest hops', () => {
    const diamond = [depends('b', 'a'), depends('c', 'a'), depends('d', 'b'), depends('e', 'd'), depends('e', 'c')];
    expect(distances(diamond, 'a')).toEqual({ b: 1, c: 1, d: 2, e: 2 });
  });

  it('ends on a cycle and never counts the selection among its dependents', () => {
    const cycle = [depends('b', 'a'), depends('c', 'b'), depends('a', 'c')];
    expect(distances(cycle, 'a')).toEqual({ b: 1, c: 2 });
  });

  it('is empty for a concept nothing depends on, and follows dependencies only', () => {
    const edges = [depends('a', 'b'), depends('c', 'a', 'related_to')];
    expect(impactOf(edges, 'a')).toMatchObject({ hops: 0, countAt: [] });
    expect(distances(edges, 'a')).toEqual({});
  });
});

describe('which dependencies carry the change', () => {
  const edges = [depends('b', 'a'), depends('c', 'a'), depends('d', 'b'), depends('c', 'b'), depends('d', 'a'), depends('a', 'x')];
  const impact = impactOf(edges, 'a');

  it('lights a dependency whose source is one hop farther than its target', () => {
    expect(carriesImpact(impact, 'b', 'a')).toBe(true);
    expect(carriesImpact(impact, 'd', 'a')).toBe(true);
  });

  it('leaves receded one between two concepts at the same distance, and the selection\'s own needs', () => {
    expect(carriesImpact(impact, 'c', 'b')).toBe(false);
    expect(carriesImpact(impact, 'd', 'b')).toBe(false);
    expect(carriesImpact(impact, 'a', 'x')).toBe(false);
  });

  it('leaves receded one that skips a level', () => {
    const chain = impactOf([depends('b', 'a'), depends('c', 'b'), depends('d', 'c'), depends('b', 'd')], 'a');
    expect(chain.distance.get('d')).toBe(3);
    expect(carriesImpact(chain, 'd', 'c')).toBe(true);
    expect(carriesImpact(chain, 'b', 'd')).toBe(false);
  });
});

describe("the spread's timing", () => {
  const HOP_MS = 600;
  const WHOLE_MS = 1200;

  it('gives one hop the expressive duration', () => {
    const hopMs = neuralSpreadHopMs(1, HOP_MS, WHOLE_MS);
    expect(hopMs).toBe(HOP_MS);
    expect(neuralSpreadAt(HOP_MS / 2, 0, 1, hopMs, false)).toBe(0.5);
    expect(neuralSpreadAt(HOP_MS, 0, 1, hopMs, false)).toBe(1);
  });

  it('starts hop two as hop one arrives, each still at the expressive duration', () => {
    const hopMs = neuralSpreadHopMs(2, HOP_MS, WHOLE_MS);
    expect(hopMs).toBe(HOP_MS);
    expect(neuralSpreadAt(HOP_MS * 1.5, 0, 2, hopMs, false)).toBe(1.5);
  });

  it('shortens every hop equally so six hops take the choreography duration', () => {
    const hopMs = neuralSpreadHopMs(6, HOP_MS, WHOLE_MS);
    expect(hopMs * 6).toBe(WHOLE_MS);
    expect(neuralSpreadAt(WHOLE_MS / 2, 0, 6, hopMs, false)).toBe(3);
    expect(neuralSpreadAt(WHOLE_MS, 0, 6, hopMs, false)).toBe(6);
  });

  it('is complete at once under reduced motion', () => {
    expect(neuralSpreadAt(0, 0, 6, neuralSpreadHopMs(6, HOP_MS, WHOLE_MS), true)).toBe(6);
  });
});
