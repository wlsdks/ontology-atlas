import { describe, expect, it } from 'vitest';
import { collectDomeAncestry, domeAncestryEdgeKey } from './dome-ancestry';

/**
 * The ancestry walk — what is locked is that the chain is **exactly** the parent line, in the
 * contains direction, and that a malformed vault cannot spin it.
 */
const PARENTS: Record<string, string | null> = {
  'project:atlas': null,
  'domain:agents': 'project:atlas',
  'capability:mcp': 'domain:agents',
  'element:panel': 'capability:mcp',
};

const parentOf = (id: string) => PARENTS[id] ?? null;

describe('collectDomeAncestry', () => {
  it('요소에서 꼭대기까지 부모 사슬을 그대로 걷는다', () => {
    const nodes = new Set<string>();
    const edges = new Set<string>();
    const n = collectDomeAncestry('element:panel', parentOf, nodes, edges);
    expect(n).toBe(3);
    expect([...nodes]).toEqual(['capability:mcp', 'domain:agents', 'project:atlas']);
    // Edges are keyed parent-first — the contains direction the world writes.
    expect(edges.has(domeAncestryEdgeKey('capability:mcp', 'element:panel'))).toBe(true);
    expect(edges.has(domeAncestryEdgeKey('domain:agents', 'capability:mcp'))).toBe(true);
    expect(edges.has(domeAncestryEdgeKey('project:atlas', 'domain:agents'))).toBe(true);
    expect(edges.size).toBe(3);
  });

  it('꼭대기를 누르면 켤 것이 없다 — 0 을 돌려주고 집합은 빈다', () => {
    const nodes = new Set<string>(['stale']);
    const edges = new Set<string>(['stale']);
    expect(collectDomeAncestry('project:atlas', parentOf, nodes, edges)).toBe(0);
    // The sets are cleared even on an empty result — a stale frame's chain must not linger.
    expect(nodes.size).toBe(0);
    expect(edges.size).toBe(0);
  });

  /**
   * A malformed vault can write `contains` cycles (the `cycles` query exists because they really
   * occur). The walk must stop on the first repeat rather than hanging the frame loop.
   */
  it('순환하는 부모 사슬에서 멈춘다 — 프레임 루프를 매달지 않는다', () => {
    const cyc = (id: string) => ({ a: 'b', b: 'c', c: 'a' })[id] ?? null;
    const nodes = new Set<string>();
    const edges = new Set<string>();
    const n = collectDomeAncestry('a', cyc, nodes, edges);
    expect(n).toBe(2); // b, c — then c's parent is a (the focus) and the walk stops
    expect(nodes.has('a')).toBe(false);
  });

  it('자기 자신이 부모여도 멈춘다', () => {
    const selfy = (id: string) => (id === 'x' ? 'x' : null);
    const nodes = new Set<string>();
    const edges = new Set<string>();
    expect(collectDomeAncestry('x', selfy, nodes, edges)).toBe(0);
  });
});
