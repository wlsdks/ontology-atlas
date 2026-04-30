import type { OntologyClass, OntologyClassInput } from './types';

/**
 * C-1 시드 — 6 노드 클래스 (5 정식 + unknown placeholder).
 *
 * 보류 스펙 §3.1 의 4-layer (Project → Domain → Capability → Element) +
 * §3.4 의 Document 근거 노드. 모두 root 클래스 (parentClassId 없음) —
 * 클래스 자체의 계층은 단순화하고, 데이터 인스턴스 사이 관계는 ontologyRelations
 * (예: contains / belongs_to) 으로 표현한다.
 *
 * `unknown` 은 frontmatter relates.target 이 미존재 노드를 가리킬 때 server
 * 만 자동 생성하는 stub placeholder — manual create 화이트리스트 (5 정식)
 * 에는 포함되지 않는다.
 *
 * **단일 진실원**: 이 배열은 `scripts/seed-ontology-tbox.mjs` 의
 * `ONTOLOGY_CLASSES` 와 `firestore.rules` 의 manual create 화이트리스트가
 * 모두 동기화되어야 한다. `defaults.sync.test.ts` 가 빌드 타임에 검증.
 *
 * version=1 — 첫 TBox 버전. schema 변경 시 +1.
 */
export const DEFAULT_ONTOLOGY_CLASSES: OntologyClassInput[] = [
  {
    id: 'project',
    name: '프로젝트',
    description: '외부에 드러나는 제품·시스템·이니셔티브 단위.',
    version: 1,
    createdBy: 'system',
  },
  {
    id: 'domain',
    name: '도메인',
    description: '프로젝트 안의 큰 문제 영역 또는 운영 영역.',
    version: 1,
    createdBy: 'system',
  },
  {
    id: 'capability',
    name: '역량',
    description: '도메인이 제공하는 기능적 능력.',
    version: 1,
    createdBy: 'system',
  },
  {
    id: 'element',
    name: '요소',
    description: '실제 구현체·자산·인터페이스·데이터 구조. elementType 으로 세분화.',
    version: 1,
    createdBy: 'system',
  },
  {
    id: 'document',
    name: '문서',
    description: '근거 노드. 계층 트리에 매달지 않고 describes 관계로 개념과 연결.',
    version: 1,
    createdBy: 'system',
  },
  {
    // T-12: stub placeholder. frontmatter relates.target 이 미존재 노드를
    // 가리킬 때 자동 생성된다. 검수자가 promote (kind 선택) 또는 dismiss.
    // 결정: 2026-04-27-ontology-id-resolution.md §2.
    id: 'unknown',
    name: '미지',
    description: 'frontmatter relates.target 이 가리키는 미존재 노드의 placeholder. 검수자가 promote 또는 dismiss.',
    version: 1,
    createdBy: 'system',
  },
];

/**
 * 클래스 ID 가 합법인지 확인 — knowledgeApprovedNodes.kind 의 진입 시 검증.
 */
export function isOntologyClassId(id: string, classes: OntologyClass[]): boolean {
  return classes.some((c) => c.id === id);
}
