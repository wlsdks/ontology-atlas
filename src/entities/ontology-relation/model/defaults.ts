import type { OntologyRelation, OntologyRelationInput } from './types';

/**
 * C-1 시드 — 7 관계 타입.
 *
 * 보류 스펙 §4.2 의 표준 관계 7 종 (구조 2 / 동작 3 / 근거 1 / 약 1).
 * 현재 knowledgeApprovedEdges.type enum 은 5 종 (depends_on / implements /
 * uses / describes / related_to) 이라 T-2 에서 contains, belongs_to 를
 * 추가해야 정합성 완성.
 */
export const DEFAULT_ONTOLOGY_RELATIONS: OntologyRelationInput[] = [
  {
    id: 'contains',
    name: '포함',
    inverseName: 'belongs_to',
    description: '상위 구조가 하위 구조를 품음. Project → Domain → Capability → Element 트리의 구조 관계.',
    sourceClassIds: ['project', 'domain', 'capability'],
    targetClassIds: ['domain', 'capability', 'element'],
    category: 'structure',
    symmetric: false,
    transitive: true,
    version: 1,
    createdBy: 'system',
  },
  {
    id: 'belongs_to',
    name: '소속',
    inverseName: 'contains',
    description: '특정 개념이 상위 개념에 속함. contains 의 역방향이지만 데이터 모델상 별도 엣지로 저장 가능.',
    sourceClassIds: ['domain', 'capability', 'element'],
    targetClassIds: ['project', 'domain', 'capability'],
    category: 'structure',
    symmetric: false,
    transitive: true,
    version: 1,
    createdBy: 'system',
  },
  {
    id: 'depends_on',
    name: '의존',
    description: '기능·요소가 다른 기능·요소에 의존. 동작 관계.',
    sourceClassIds: ['project', 'capability', 'element'],
    targetClassIds: ['project', 'capability', 'element'],
    category: 'behavior',
    symmetric: false,
    transitive: false,
    version: 1,
    createdBy: 'system',
  },
  {
    id: 'implements',
    name: '구현',
    description: '요소가 역량을 구현.',
    sourceClassIds: ['element'],
    targetClassIds: ['capability'],
    category: 'behavior',
    symmetric: false,
    transitive: false,
    version: 1,
    createdBy: 'system',
  },
  {
    id: 'uses',
    name: '사용',
    description: '한 요소가 다른 요소를 사용. 동작 관계.',
    sourceClassIds: ['element', 'capability'],
    targetClassIds: ['element'],
    category: 'behavior',
    symmetric: false,
    transitive: false,
    version: 1,
    createdBy: 'system',
  },
  {
    id: 'describes',
    name: '설명',
    description: '문서가 개념을 설명. 근거 관계 — 모든 ontology 관계는 describes 로 문서에 닿아야 신뢰도 평가 가능.',
    sourceClassIds: ['document'],
    targetClassIds: ['project', 'domain', 'capability', 'element'],
    category: 'evidence',
    symmetric: false,
    transitive: false,
    version: 1,
    createdBy: 'system',
  },
  {
    id: 'related_to',
    name: '연관',
    description: '약 연관. 초기 추출에서 보조 관계로 사용. 충분한 근거가 쌓이면 더 구체적 타입으로 승격.',
    sourceClassIds: [],
    targetClassIds: [],
    category: 'weak',
    symmetric: true,
    transitive: false,
    version: 1,
    createdBy: 'system',
  },
];

/** 관계 ID 가 합법인지 확인 — knowledgeApprovedEdges.type 진입 시 검증. */
export function isOntologyRelationId(id: string, relations: OntologyRelation[]): boolean {
  return relations.some((r) => r.id === id);
}

/**
 * source/target class 가 관계의 제약을 만족하는지 확인.
 * sourceClassIds 또는 targetClassIds 가 빈 배열이면 모든 클래스 허용.
 */
export function isRelationApplicable(
  relation: OntologyRelation,
  sourceClassId: string,
  targetClassId: string,
): boolean {
  const sourceOk =
    relation.sourceClassIds.length === 0 || relation.sourceClassIds.includes(sourceClassId);
  const targetOk =
    relation.targetClassIds.length === 0 || relation.targetClassIds.includes(targetClassId);
  return sourceOk && targetOk;
}
