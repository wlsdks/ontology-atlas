import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';
import {
  computeDomainCensusRows,
  domainCensusById,
  isContainmentRelation,
} from '@/shared/lib/ontology-tree';
import type { TopologyV2Edge, TopologyV2Node } from '@/widgets/topology-map-v2';

const RENDERABLE_KIND_LIST = ['project', 'domain', 'capability', 'element'] as const;
const RENDERABLE_KINDS = new Set<string>(RENDERABLE_KIND_LIST);
type RenderableKind = (typeof RENDERABLE_KIND_LIST)[number];

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
 * ⚠️ **위 사유는 뷰 레이어 함수에만 적용된다.** 구 판본은 이 사유를 넓게 읽어
 * 자손 수까지 자체 재귀로 다시 구현했고, 그 재귀가 **고유 노드가 아니라
 * 컨테인먼트 경로 합**을 세는 바람에 허브 각인이 `379` 로 그려졌다 — 바로 그
 * 옆 캡션이 `96 개념` 이라고 적은 화면에서 **4배 모순**이다(도메인 배지도 최대
 * 2.9배 부풀었다: views 129/실제 46 · onboarding-ux 119/15). 배경이 캡션과 같은
 * 출처를 쓴다는 것이 이 페이지가 거는 정직성 계약인데, 그 계약을 배경 자신이
 * 깨고 있었다. 자손 수의 단일 진실원 `computeDomainCensusRows` 는
 * `shared/lib` 에 있어 **크로스임포트 문제가 처음부터 없었다** — INDEX 트리 ·
 * `/projects` · 홈 어댑터가 이미 전부 그것을 쓴다(도해석 지적 2026-07-29).
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

  const fullDegree = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const edge of includedEdges) {
    fullDegree.set(edge.from, (fullDegree.get(edge.from) ?? 0) + 1);
    fullDegree.set(edge.to, (fullDegree.get(edge.to) ?? 0) + 1);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }

  /**
   * 하위 자손 수 — 노드 크기와 각인 숫자의 출처. 표면마다 다시 세지 않는다:
   * containment 를 parent→child 로 정규화한 뒤 **노드별 유일 집계**로 BFS 하는
   * 공유 census 하나가 INDEX 트리 · `/projects` · 홈 지도 · 이 무대의 진실원이다.
   * 사이클 안전(visited)도 그쪽이 이미 가진다.
   *
   * 기본 대상은 domain/project 지만 여기서는 **그리는 네 kind 전부**를 넘긴다 —
   * 각인 숫자는 project/domain 에만 그려지지만(`topology-frame-draw.ts`),
   * `size`(시각 규모 · 라벨 우선순위)는 capability 도 쓰기 때문이다. `?? 0`
   * 으로 뭉개면 capability 의 규모 채널이 통째로 죽는다.
   */
  const censusById = domainCensusById(
    computeDomainCensusRows(nodes, edges, RENDERABLE_KIND_LIST),
  );
  const descendantCountOf = (id: string) => censusById.get(id)?.total ?? 0;

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
      size: descendantCountOf(node.id),
      x: 0,
      y: 0,
      isHub: node.id === hubId,
      ownerKey: null,
      recentlyUpdated: false,
      stale: false,
      fullDegree: fullDegree.get(node.id) ?? 0,
      descendantCount: descendantCountOf(node.id),
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
