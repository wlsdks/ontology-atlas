import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  MEANINGFUL_ONTOLOGY_KINDS,
  isMeaningfulOntologyKind,
  type MeaningfulOntologyKind,
} from "./kind-stats";

/**
 * 한 project slug 에 매달린 ontology 노드의 kind 분포.
 *
 * `total` 은 4 kind 합. `byKind` 는 dense — 0 도 포함해서 surface 가
 * 안전하게 읽을 수 있다.
 */
export interface OntologyCountsForProject {
  byKind: Record<MeaningfulOntologyKind, number>;
  total: number;
}

/**
 * 노드 list 를 project slug → kind 카운트 map 으로 집계.
 *
 * - project / document kind 는 메타라 집계 제외 (`MEANINGFUL_ONTOLOGY_KINDS`
 *   = domain / capability / element / unknown).
 * - 한 노드의 `projectIds` 가 N 개면 각 project 에 sum 으로 1씩 카운트.
 *   (한 노드가 다중 project 에 속하는 경우 — 진안이 측정 후 unique 카운트가
 *   필요하다고 피드백 주면 별도 함수로 추가.)
 *
 * 반환되는 Map 의 key 는 입력 nodes 에서 발견된 project slug 만 — 없는 slug
 * 호출자는 fallback (모두 0) 이 필요하면 `undefined` 체크 후 별도 처리.
 */
export function buildProjectOntologyCounts(
  nodes: readonly KnowledgeGraphNode[],
): Map<string, OntologyCountsForProject> {
  const map = new Map<string, OntologyCountsForProject>();

  for (const node of nodes) {
    if (!isMeaningfulOntologyKind(node.kind)) continue;
    const projectIds = Array.isArray(node.projectIds) ? node.projectIds : [];
    for (const slug of projectIds) {
      if (!slug) continue;
      let entry = map.get(slug);
      if (!entry) {
        entry = createZeroCounts();
        map.set(slug, entry);
      }
      entry.byKind[node.kind] += 1;
      entry.total += 1;
    }
  }

  return map;
}

function createZeroCounts(): OntologyCountsForProject {
  const byKind = {
    domain: 0,
    capability: 0,
    element: 0,
    unknown: 0,
  } satisfies Record<MeaningfulOntologyKind, number>;
  return { byKind, total: 0 };
}

/**
 * 한 project 의 카운트에서 "도미넌트 kind" 결정 — sigma border tone 매핑의
 * 1차 입력. 동률이면 `MEANINGFUL_ONTOLOGY_KINDS` 순서 (domain → capability →
 * element → unknown) 로 결정 — 안정 정렬 + spec 의 4-layer 자연 순서.
 *
 * `unknown` 은 1 이상이면 stub 검수 신호라 다른 kind 보다 우선 — surface 가
 * amber 톤으로 검수 필요를 신호하기 위함.
 *
 * total 0 은 `null` 반환 — 호출자가 무채색 fallback.
 */
export function pickDominantOntologyKind(
  counts: OntologyCountsForProject | undefined,
): MeaningfulOntologyKind | null {
  if (!counts || counts.total === 0) return null;
  if (counts.byKind.unknown > 0) return "unknown";
  let best: MeaningfulOntologyKind | null = null;
  let bestCount = 0;
  for (const kind of MEANINGFUL_ONTOLOGY_KINDS) {
    if (kind === "unknown") continue;
    const c = counts.byKind[kind];
    if (c > bestCount) {
      best = kind;
      bestCount = c;
    }
  }
  return best;
}
