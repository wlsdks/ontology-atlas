import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';
import { isContainmentRelation } from '@/shared/lib/ontology-tree';
import type { TopologyV2Edge, TopologyV2Node } from '@/widgets/topology-map-v2';

const RENDERABLE_KINDS = new Set(['project', 'domain', 'capability', 'element']);
type RenderableKind = 'project' | 'domain' | 'capability' | 'element';

/**
 * `/download` 무대에 **진짜 지도 엔진**을 태우기 위한 어댑터.
 *
 * ## 왜 이게 따로 있나 (HomePage 것을 안 쓰고)
 *
 * 같은 일을 하는 `buildTopologyV2Graph` 가 `views/home/lib` 에 있지만, 그건
 * **다른 뷰의 내부**다. `views/download` 가 그걸 import 하면 FSD 의 동일 레이어
 * cross-import 금지에 걸리고, 끌려오는 사슬(`topology-ontology-skeleton` ·
 * `topology-analysis` → `views/home/model/url-state`)이 홈의 URL 상태까지
 * 딸려 온다. 반대로 그 어댑터를 위젯으로 내리는 리팩터는 **지금 이 페이지가
 * 필요로 하지 않는 것들**(변경 펄스 · dusty 판정 · 관계 품질 분류)까지 옮기며
 * 앱에서 가장 중요한 지도의 배선을 건드린다.
 *
 * 그래서 이 화면이 실제로 쓰는 것만 여기서 만든다. 엔진이 요구하는 필드 중
 * 이 무대에 의미가 없는 것(`recentlyUpdated` · `stale` · `ownerKey` ·
 * `relationQuality`)은 **꾸며내지 않고 중립값**으로 둔다 — 관문에는 "최근 변경"
 * 기준선도, 볼트 mtime 도 없어서 어떤 값을 넣든 거짓이기 때문이다.
 *
 * ## 좌표를 안 만드는 이유
 *
 * 엔진(`topology-world.ts`)이 `contains` 엣지에서 결정적 동심 배치를 스스로
 * 계산하고 들어온 `x`/`y` 는 무시한다. 그래서 0 을 넘긴다 — 홈의 어댑터가
 * 하는 것과 같다.
 */
export interface StageGraph {
  nodes: TopologyV2Node[];
  edges: TopologyV2Edge[];
}

export function buildStageGraph(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): StageGraph {
  const included = nodes.filter((node) => RENDERABLE_KINDS.has(node.kind));
  const includedIds = new Set(included.map((node) => node.id));
  const includedEdges = edges.filter(
    // 자기참조 엣지는 제외 — 이 볼트에는 사이클이 실존하고(`cycles` 질의가
    // 세는 그것), 자기 자신을 가리키는 엣지는 렌더에서 0 길이 선이 된다.
    (edge) => edge.from !== edge.to && includedIds.has(edge.from) && includedIds.has(edge.to),
  );

  const childrenOf = new Map<string, string[]>();
  const fullDegree = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const edge of includedEdges) {
    fullDegree.set(edge.from, (fullDegree.get(edge.from) ?? 0) + 1);
    fullDegree.set(edge.to, (fullDegree.get(edge.to) ?? 0) + 1);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    if (!isContainmentRelation(edge.type)) continue;
    const bucket = childrenOf.get(edge.from);
    if (bucket) bucket.push(edge.to);
    else childrenOf.set(edge.from, [edge.to]);
  }

  /**
   * 하위 자손 수 — 노드 크기와 각인 숫자의 출처. 순환이 있는 볼트에서도
   * 멈추도록 방문 집합을 들고 돈다(사이클은 실제로 존재한다 —
   * `query_ontology({operation:"cycles"})` 가 세는 그것).
   */
  const descendantCount = new Map<string, number>();
  const countDescendants = (id: string, seen: Set<string>): number => {
    const cached = descendantCount.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 0;
    seen.add(id);
    let total = 0;
    for (const child of childrenOf.get(id) ?? []) {
      total += 1 + countDescendants(child, seen);
    }
    seen.delete(id);
    descendantCount.set(id, total);
    return total;
  };
  for (const node of included) countDescendants(node.id, new Set());

  /**
   * 허브는 **정확히 하나**다 — 헌장의 앰버 링이 단일 노드 강조이기 때문이다.
   * 동점은 id 오름차순으로 깨서 빌드마다 같은 노드가 뽑히게 한다.
   */
  let hubId: string | null = null;
  let hubIncoming = 0;
  for (const node of included) {
    const count = incoming.get(node.id) ?? 0;
    /**
     * ⚠️ `incoming === 0` 은 건너뛴다. 시작값이 `-1` 이면 **아무도 참조되지
     * 않은 그래프**(고립 노드만 있는 볼트)에서도 배열 첫 노드가 허브로 뽑혀
     * 앰버 링이 근거 없이 켜진다. 헌장은 "허브는 정확히 하나" 이면서 동시에
     * "허브가 없을 수 있다" — 없는데 그리는 것은 데이터에 없는 사실을
     * 그리는 것이다. 홈의 어댑터가 같은 가드를 갖고 있고, 이쪽에 없어서
     * 두 곳이 같은 불변식을 다르게 구현하고 있었다 (체계석 지적 2026-07-28).
     */
    if (count === 0) continue;
    if (count > hubIncoming || (count === hubIncoming && hubId !== null && node.id < hubId)) {
      hubId = node.id;
      hubIncoming = count;
    }
  }

  return {
    nodes: included.map((node) => ({
      id: node.id,
      // 캔버스 라벨은 표시용 짧은 제목 — 긴 title(괄호 부연 포함)을 그대로
      // 그리면 잘리고 지저분하다.
      label: node.display ?? node.title,
      kind: node.kind as RenderableKind,
      size: descendantCount.get(node.id) ?? 0,
      x: 0,
      y: 0,
      isHub: node.id === hubId,
      ownerKey: null,
      recentlyUpdated: false,
      stale: false,
      fullDegree: fullDegree.get(node.id) ?? 0,
      descendantCount: descendantCount.get(node.id) ?? 0,
    })),
    edges: includedEdges.map((edge) => ({
      source: edge.from,
      target: edge.to,
      relationType: edge.type,
      relationQuality: null,
      evidenceCount: edge.evidenceIds.length,
      kind: isContainmentRelation(edge.type) ? ('contains' as const) : ('depends' as const),
      declaredBySlug: edge.evidenceIds[0] ?? null,
    })),
  };
}
