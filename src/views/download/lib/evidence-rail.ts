import type { StageGraph } from './stage-graph';

/**
 * 증거 절 우측 레일의 데이터 — **전부 왼쪽 지도와 같은 `StageGraph` 에서
 * 파생된다** (2026-08-18 소유자 지적: 절의 80%가 빈 검정 — *"반 자르고
 * 우측에는 뭔가 다른걸"*). 장식이 아니라 증거이므로, 여기 적히는 숫자·관계·
 * 이름은 하나도 지어내지 않는다: 캡션·지도와 같은 객체를 세고, 같은 frontmatter
 * 관계를 그대로 옮겨 적는다.
 *
 * 선택은 전부 결정적이다(빈도 내림차순 → 이름 오름차순) — 같은 볼트면 어느
 * 빌드에서도 같은 세 줄이 나온다. 스냅숏이 아니라 파생이라 볼트가 자라면
 * 화면도 따라간다.
 */

export interface EvidenceCensusRow {
  kind: 'project' | 'domain' | 'capability' | 'element';
  count: number;
}

export interface EvidenceRelationLine {
  source: string;
  type: string;
  target: string;
}

export interface EvidenceImpact {
  name: string;
  count: number;
}

export interface EvidenceRailModel {
  census: EvidenceCensusRow[];
  relations: EvidenceRelationLine[];
  impact: EvidenceImpact | null;
}

const KIND_ORDER = ['project', 'domain', 'capability', 'element'] as const;

export function buildEvidenceRailModel(graph: StageGraph): EvidenceRailModel {
  const labelById = new Map(graph.nodes.map((node) => [node.id, node.label]));

  const kindCounts = new Map<string, number>();
  for (const node of graph.nodes) {
    kindCounts.set(node.kind, (kindCounts.get(node.kind) ?? 0) + 1);
  }
  const census: EvidenceCensusRow[] = [];
  for (const kind of KIND_ORDER) {
    const count = kindCounts.get(kind) ?? 0;
    if (count > 0) census.push({ kind, count });
  }

  // 관계 세 줄 — 가장 흔한 관계 타입 셋을 고르고, 각 타입에서 (source, target)
  // 사전순 첫 엣지를 옮겨 적는다. 흔한 타입이 먼저인 이유: 이 볼트가 실제로
  // 무엇으로 짜여 있는지가 증거이지, 희귀한 타입의 전시가 아니다.
  // ⚠️ 정렬은 전부 **코드포인트 비교**다. `localeCompare` 는 서버(Node ICU)와
  // 브라우저가 한글·라틴 혼합 정렬을 다르게 매겨 SSR 하이드레이션이 갈라진다
  // (실측 2026-08-18: 서버 "Agent Connect…" vs 클라이언트 "그래프 모델…").
  // 비교 키도 표시 라벨이 아니라 **노드 id(슬러그)** 다 — 라벨은 로케일마다
  // 다르지만 id 는 어디서나 같은 ASCII 라서 어느 로케일이든 같은 줄이 뽑힌다.
  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  const byType = new Map<string, { sourceId: string; targetId: string }[]>();
  for (const edge of graph.edges) {
    if (!labelById.has(edge.source) || !labelById.has(edge.target)) continue;
    const list = byType.get(edge.relationType) ?? [];
    list.push({ sourceId: edge.source, targetId: edge.target });
    byType.set(edge.relationType, list);
  }
  const rankedTypes = [...byType.entries()].sort(
    (a, b) => b[1].length - a[1].length || cmp(a[0], b[0]),
  );
  const relations: EvidenceRelationLine[] = rankedTypes.slice(0, 3).map(([type, list]) => {
    const first = [...list].sort(
      (a, b) => cmp(a.sourceId, b.sourceId) || cmp(a.targetId, b.targetId),
    )[0];
    return {
      source: labelById.get(first.sourceId) as string,
      type,
      target: labelById.get(first.targetId) as string,
    };
  });

  // 영향 반경 — 비-컨테인먼트(depends 부류) 엣지가 가장 많이 향하는 노드 하나.
  // 「이걸 고치면 몇 곳이 흔들리나」는 에이전트가 이 그래프에 실제로 묻는
  // 질문이라(`find_backlinks`), 그 답 하나가 이 절의 가장 강한 증거다.
  const incoming = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'depends') continue;
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }
  let impact: EvidenceImpact | null = null;
  let impactId: string | null = null;
  for (const [id, count] of incoming) {
    const name = labelById.get(id);
    if (!name) continue;
    if (
      impact === null ||
      count > impact.count ||
      (count === impact.count && impactId !== null && id < impactId)
    ) {
      impact = { name, count };
      impactId = id;
    }
  }

  return { census, relations, impact };
}
