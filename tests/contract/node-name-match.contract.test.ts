import { describe, expect, it } from 'vitest';
import { matchOntologyNodes } from '@/widgets/global-search';
import { candidateFromNode } from '@/views/ontology-studio/lib/build-create-node';
import { candidateMatches } from '@/views/ontology-studio/lib/match-candidate';
import type { KnowledgeGraphNode } from '@/entities/knowledge-graph';

/**
 * 검색 표면 간 이름 규칙 계약 — 전역 검색과 공방 소켓 피커는 같은 노드를
 * 같은 이름으로 찾아야 한다.
 *
 * 흐름 점검 2026-07-26 D1: 지도·INDEX·공방 피커는 `display_ko` 를 그리는데
 * 전역 검색만 canonical `title` 을 인덱싱해서, 한국어 화면에서 눈으로 읽은
 * 이름을 그대로 치면 0건이었다. 같은 볼트를 두고 한 표면에서는 나오고 다른
 * 표면에서는 없다고 말하면, 사용자는 데이터가 없다고 믿는다.
 *
 * 규칙의 단일 출처는 `shared/lib/node-name-match` 다. 이 테스트는 두 표면이
 * 실제로 그 출처를 통해 같은 답을 내는지 fixture 로 강제한다.
 */

const NAMES = ['온톨로지 코어', 'Ontology Core', '코어', 'ontology'] as const;

const NODE: KnowledgeGraphNode = {
  id: 'capability:ontology-core',
  title: 'Ontology Core',
  display: '온톨로지 코어',
  displayLocales: { ko: '온톨로지 코어', en: 'Ontology Core' },
  kind: 'capability',
  projectIds: [],
  evidenceIds: [],
  lastApprovedAt: new Date(0),
  lastApprovedBy: 'vault-frontmatter',
};

describe('이름 매칭 계약 — 전역 검색 ↔ 공방 피커', () => {
  const candidate = candidateFromNode(NODE);

  for (const query of NAMES) {
    it(`"${query}" — 두 표면 모두 찾는다`, () => {
      expect(matchOntologyNodes(query, [NODE])).toHaveLength(1);
      expect(candidateMatches(candidate, query)).toBe(true);
    });
  }

  it('아무 이름도 아닌 말은 두 표면 모두 안 찾는다', () => {
    expect(matchOntologyNodes('환불 정책', [NODE])).toHaveLength(0);
    expect(candidateMatches(candidate, '환불 정책')).toBe(false);
  });
});
