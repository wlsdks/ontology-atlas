import { describe, expect, it } from 'vitest';

import { echoCount, echoFact, echoOrder, type EchoNode } from './hero-echo';
import type { StageGraph } from './stage-graph';

const R = 100;
const at = (deg: number) => {
  // The layout's angle runs from −π/2 (twelve o'clock) clockwise: x = cos, z = sin.
  const a = (deg / 180) * Math.PI - Math.PI / 2;
  return { px: Math.cos(a) * R, pz: Math.sin(a) * R };
};

const NODES: EchoNode[] = [
  { s: 'el-b', k: 'element', ...at(200) },
  { s: 'cap-a', k: 'capability', ...at(90) },
  { s: 'dom-2', k: 'domain', ...at(180) },
  { s: 'el-a', k: 'element', ...at(10) },
  { s: 'atlas', k: 'project', px: 0, pz: 0 },
  { s: 'dom-1', k: 'domain', ...at(0) },
  { s: 'cap-b', k: 'capability', ...at(270) },
];

describe('echoOrder', () => {
  it('lights the apex first, then each plane top to bottom, clockwise from twelve', () => {
    expect(echoOrder(NODES)).toEqual(['atlas', 'dom-1', 'dom-2', 'cap-a', 'cap-b', 'el-a', 'el-b']);
  });

  it('is deterministic for nodes at the same angle', () => {
    const twins: EchoNode[] = [
      { s: 'z', k: 'element', ...at(0) },
      { s: 'a', k: 'element', ...at(0) },
    ];
    expect(echoOrder(twins)).toEqual(['a', 'z']);
    expect(echoOrder([...twins].reverse())).toEqual(['a', 'z']);
  });
});

describe('echoCount', () => {
  it('lights nothing before the first character and everything on the last', () => {
    expect(echoCount(0, 30, 90)).toBe(0);
    expect(echoCount(30, 30, 90)).toBe(90);
    expect(echoCount(31, 30, 90)).toBe(90);
  });

  it('gives the first character at least one dot, even when the sentence is longer than the graph', () => {
    expect(echoCount(1, 59, 30)).toBe(1);
    expect(echoCount(1, 30, 90)).toBe(3);
  });

  it('never runs backwards and never leaves a burst for after the sentence', () => {
    for (const [total, n] of [
      [30, 91],
      [59, 91],
      [59, 12],
    ] as const) {
      let prev = 0;
      for (let typed = 0; typed <= total; typed += 1) {
        const lit = echoCount(typed, total, n);
        expect(lit).toBeGreaterThanOrEqual(prev);
        expect(lit).toBeLessThanOrEqual(n);
        prev = lit;
      }
      expect(prev).toBe(n);
    }
  });

  it('lights nothing before the headline has reported a sentence at all', () => {
    // The object mounts one commit before the typewriter's first report; that frame must be dark.
    expect(echoCount(0, 0, 40)).toBe(0);
    expect(echoCount(5, 0, 40)).toBe(0);
    expect(echoCount(5, 0, 0)).toBe(0);
  });
});

describe('echoFact', () => {
  const graph = {
    nodes: [
      { id: 'atlas', label: 'Atlas', kind: 'project' },
      { id: 'map', label: 'Map', kind: 'domain' },
      { id: 'layout', label: 'Layout engine', kind: 'capability' },
      { id: 'search', label: 'Search', kind: 'capability' },
    ],
    edges: [
      { source: 'atlas', target: 'map', kind: 'contains', relationType: 'contains' },
      { source: 'map', target: 'layout', kind: 'contains', relationType: 'contains' },
      { source: 'search', target: 'layout', kind: 'depends', relationType: 'depends_on' },
    ],
  } as unknown as StageGraph;

  it('states the edge to the parent, with both ends as the labels the evidence section prints', () => {
    expect(echoFact(graph, 'layout')).toEqual({ relation: 'contains', from: 'Map', to: 'Layout engine' });
  });

  it('falls back to an edge the node owns when it has no parent', () => {
    expect(echoFact(graph, 'atlas')).toEqual({ relation: 'contains', from: 'Atlas', to: 'Map' });
    expect(echoFact(graph, 'search')).toEqual({ relation: 'depends', from: 'Search', to: 'Layout engine' });
  });

  it('says nothing for a node with no edge rather than inventing one', () => {
    expect(echoFact(graph, 'orphan')).toBeNull();
  });
});
