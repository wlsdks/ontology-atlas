import { DEFAULT_ONTOLOGY_CLASSES } from './defaults';

/**
 * ontology kind ID → 한글 display label.
 *
 * `DEFAULT_ONTOLOGY_CLASSES` (seed) 의 `name` 을 진실원으로 사용. seed 에 없는
 * kind (런타임 동적 추가 등) 는 raw kind 문자열을 그대로 반환해 dead label 을 피한다.
 *
 * UI surface (트리 chip / 노드 상세 패널 / 검색 결과 등) 에서 라벨을 분산
 * 정의하지 않도록 단일 진입점.
 */
export function getOntologyKindLabel(kind: string): string {
  const found = DEFAULT_ONTOLOGY_CLASSES.find((c) => c.id === kind);
  return found?.name ?? kind;
}
