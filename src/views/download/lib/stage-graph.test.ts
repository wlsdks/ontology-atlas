import { describe, expect, it } from 'vitest';
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';
import { buildStageGraph } from './stage-graph';

/**
 * This adapter claims **the same charter-level invariants** as home's `buildTopologyV2Graph`
 * (exactly one hub, and there may be none). A duplicate implementing that invariant differently is
 * what the design-system seat flagged, so the contract is pinned here.
 */
const node = (id: string, kind: KnowledgeGraphNode['kind']): KnowledgeGraphNode =>
  ({
    id,
    title: id,
    kind,
    projectIds: [],
    evidenceIds: [],
  }) as unknown as KnowledgeGraphNode;

const edge = (from: string, to: string, type: string): KnowledgeGraphEdge =>
  ({ from, to, type, evidenceIds: [] }) as unknown as KnowledgeGraphEdge;

describe('buildStageGraph', () => {
  it('아무도 참조되지 않으면 허브를 만들지 않는다', () => {
    // The amber hub ring is a single-node emphasis. Picking the first node as hub in a graph with
    // zero references draws a fact absent from the data.
    const { nodes } = buildStageGraph(
      [node('a', 'domain'), node('b', 'domain'), node('c', 'domain')],
      [],
    );
    expect(nodes.every((n) => !n.isHub)).toBe(true);
  });

  it('허브는 정확히 하나 — 최다 피참조, 동점은 id 오름차순', () => {
    const { nodes } = buildStageGraph(
      [node('p', 'project'), node('x', 'capability'), node('y', 'capability')],
      [edge('p', 'x', 'contains'), edge('y', 'x', 'depends_on'), edge('p', 'y', 'contains')],
    );
    expect(nodes.filter((n) => n.isHub)).toHaveLength(1);
    expect(nodes.find((n) => n.isHub)?.id).toBe('x');
  });

  it('자기참조 엣지는 그리지 않는다', () => {
    const { edges } = buildStageGraph(
      [node('a', 'domain'), node('b', 'capability')],
      [edge('a', 'a', 'related_to'), edge('a', 'b', 'contains')],
    );
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'a', target: 'b', kind: 'contains' });
  });

  it('순환하는 containment 에서도 멈춘다', () => {
    // Cycles genuinely exist in this vault. Descendant counting must not recurse infinitely.
    const { nodes } = buildStageGraph(
      [node('a', 'domain'), node('b', 'capability')],
      [edge('a', 'b', 'contains'), edge('b', 'a', 'contains')],
    );
    expect(nodes).toHaveLength(2);
    for (const n of nodes) expect(Number.isFinite(n.descendantCount)).toBe(true);
  });

  /**
   * The engraved number is **a count of unique nodes, not a sum over paths.**
   *
   * Measured regression (2026-07-29): the hub engraved `379` while the caption right beside it read
   * `96 concepts`. A hand-rolled recursion recounted descendants **per containment path** through
   * multiple parents, inflating by 4×. This page's honesty contract is that the background and the
   * caption share one source, so that contract is pinned here.
   */
  it('다중 부모를 지나도 자손을 한 번만 센다 (경로 합 금지)', () => {
    const { nodes } = buildStageGraph(
      [
        node('p', 'project'),
        node('d1', 'domain'),
        node('d2', 'domain'),
        node('shared', 'capability'),
        node('leaf', 'element'),
      ],
      [
        edge('p', 'd1', 'contains'),
        edge('p', 'd2', 'contains'),
        // The same capability is contained by two domains — two paths, one node.
        edge('d1', 'shared', 'contains'),
        edge('d2', 'shared', 'contains'),
        edge('shared', 'leaf', 'contains'),
      ],
    );
    const countById = new Map(nodes.map((n) => [n.id, n.descendantCount]));
    // capability 1 + element 1 = 2. A path sum would give 4.
    expect(countById.get('p')).toBe(2);
    expect(countById.get('d1')).toBe(2);
    expect(countById.get('shared')).toBe(1);
    expect(countById.get('leaf')).toBe(0);
  });

  it('관문에 근거가 없는 사실은 꾸며내지 않는다', () => {
    const { nodes, edges } = buildStageGraph(
      [node('a', 'domain'), node('b', 'element')],
      [edge('a', 'b', 'contains')],
    );
    // This surface has neither a change baseline nor vault mtimes, so any value would be false.
    expect(nodes.every((n) => n.recentlyUpdated === false && n.stale === false)).toBe(true);
    expect(nodes.every((n) => n.ownerKey === null)).toBe(true);
    expect(edges.every((e) => e.relationQuality === null)).toBe(true);
  });
});
