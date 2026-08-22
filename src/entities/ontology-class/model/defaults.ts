import type { OntologyClass } from './types';

/**
 * The six node classes (five real, plus an `unknown` placeholder).
 *
 * Four layers (Project → Domain → Capability → Element) plus the Document
 * evidence node. The class hierarchy itself is flat; relations between data
 * instances are expressed by `KNOWLEDGE_EDGE_TYPES` (contains / belongs_to /
 * depends_on / implements / uses / describes / related_to).
 *
 * `unknown` is the stub derivation mints when vault frontmatter references a slug
 * that does not exist; the UI surfaces stubs in the amber tone.
 *
 * **Single source of truth**: this array serves both the build-time manifest in
 * `scripts/build-docs-vault.mjs` and the runtime derivation in
 * `derive-ontology-from-vault`, and matches the enum in `mcp/add_concept`.
 */
export const DEFAULT_ONTOLOGY_CLASSES: OntologyClass[] = [
  {
    id: 'project',
    name: '프로젝트',
    description: '외부에 드러나는 제품·시스템·이니셔티브 단위.',
  },
  {
    id: 'domain',
    name: '도메인',
    description: '프로젝트 안의 큰 문제 영역 또는 운영 영역.',
  },
  {
    id: 'capability',
    name: '역량',
    description: '도메인이 제공하는 기능적 능력.',
  },
  {
    id: 'element',
    name: '요소',
    description: '실제 구현체·자산·인터페이스·데이터 구조.',
  },
  {
    id: 'document',
    name: '문서',
    description: '근거 노드. 계층 트리에 매달지 않고 describes 관계로 개념과 연결.',
  },
  {
    // The stub placeholder kind, minted automatically when a frontmatter
    // relation target names a node that does not exist.
    id: 'unknown',
    name: '미지',
    description: 'frontmatter relates.target 이 가리키는 미존재 노드의 placeholder.',
  },
];
