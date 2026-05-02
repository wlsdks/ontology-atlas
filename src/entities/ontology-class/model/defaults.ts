import type { OntologyClass, OntologyClassInput } from './types';

/**
 * 6 노드 클래스 시드 (5 정식 + unknown placeholder).
 *
 * 4-layer (Project → Domain → Capability → Element) + Document 근거 노드.
 * 클래스 자체의 계층은 단순하고, 데이터 인스턴스 사이 관계는
 * `KNOWLEDGE_EDGE_TYPES` (contains / belongs_to / depends_on / implements /
 * uses / describes / related_to) 로 표현한다.
 *
 * `unknown` 은 vault frontmatter 가 미존재 slug 를 참조할 때 derivation 이
 * 자동 생성하는 stub placeholder — UI 가 stub 을 amber 톤으로 surface.
 *
 * **단일 진실원**: 이 배열은 \`scripts/build-docs-vault.mjs\` 의 빌드타임
 * 매니페스트와 \`derive-ontology-from-vault\` 의 runtime derivation 모두에
 * 동일 5 정식 + 1 stub 으로 사용된다. \`mcp/add_concept\` 의 enum 도 정합.
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
