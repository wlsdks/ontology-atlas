import { describe, expect, it } from 'vitest';
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';
import { buildStageGraph } from './stage-graph';

/**
 * 이 어댑터는 홈의 `buildTopologyV2Graph` 와 **같은 헌장급 불변식**을 주장한다
 * (허브는 정확히 하나, 없을 수도 있다). 복제본이 그 불변식을 다르게 구현하고
 * 있었던 것이 체계석 지적이었으므로, 여기서 그 계약을 고정한다.
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
    // 앰버 허브 링은 단일 노드 강조다. 참조가 0인 그래프에서 첫 노드를
    // 허브로 뽑으면 데이터에 없는 사실을 그리는 것이다.
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
    // 이 볼트에는 사이클이 실존한다. 자손 수 계산이 무한 재귀하면 안 된다.
    const { nodes } = buildStageGraph(
      [node('a', 'domain'), node('b', 'capability')],
      [edge('a', 'b', 'contains'), edge('b', 'a', 'contains')],
    );
    expect(nodes).toHaveLength(2);
    for (const n of nodes) expect(Number.isFinite(n.descendantCount)).toBe(true);
  });

  /**
   * 각인 숫자는 **경로 합이 아니라 고유 노드 수**다.
   *
   * 실측 회귀(2026-07-29): 허브가 `379` 를 각인한 채로 바로 옆 캡션이
   * `96 개념` 이라고 적고 있었다. 자체 재귀가 다중 부모를 지나는 containment
   * **경로마다** 자손을 다시 세서 4배 부풀린 것이다. 배경과 캡션이 같은
   * 출처를 쓴다는 것이 이 페이지의 정직성 계약이므로 그 계약을 여기서 고정한다.
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
        // 같은 capability 가 두 도메인에 담긴다 — 경로는 둘, 노드는 하나.
        edge('d1', 'shared', 'contains'),
        edge('d2', 'shared', 'contains'),
        edge('shared', 'leaf', 'contains'),
      ],
    );
    const countById = new Map(nodes.map((n) => [n.id, n.descendantCount]));
    // capability 1 + element 1 = 2. 경로 합이면 4 가 된다.
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
    // 변경 기준선도 볼트 mtime 도 없는 표면이라 어떤 값을 넣어도 거짓이다.
    expect(nodes.every((n) => n.recentlyUpdated === false && n.stale === false)).toBe(true);
    expect(nodes.every((n) => n.ownerKey === null)).toBe(true);
    expect(edges.every((e) => e.relationQuality === null)).toBe(true);
  });
});
