import { describe, expect, it } from 'vitest';
import { DUPLICATE_PAIR_CASES } from '../fixtures/duplicate-pairs-cases.mjs';
import type { VaultDoc, VaultManifest } from '@/entities/docs-vault';
import { deriveOntologyFromVault } from '@/entities/docs-vault';
import { derivationToInsight } from '@/features/vault-ontology/model/use-ontology-insight';
import {
  buildDuplicatePairs,
  buildSimilarityCandidates,
  scoreNodeSimilarity,
  similarityTokens,
  tokenSetJaccard,
} from '@/views/ontology-insights/lib/duplicate-pairs';
import type { KnowledgeProjectInsight } from '@/entities/knowledge-graph';
import { buildDomainCouplingSummary } from '@/views/ontology-insights/lib/domain-coupling-rows';
import { starterFilesForLocale } from '@/features/docs-vault-local/lib/ontology-starter';
import { compileOntology } from '../../mcp/src/ontology-compiler.mjs';
import { parseFrontmatter } from '../../mcp/src/parser.mjs';
import { queryCompiledOntology } from '../../mcp/src/ontology-engine.mjs';

/**
 * S3 — 중복 의심 contract. 「비슷한 이름 — 같은 걸까요?」 카드가 매기는
 * 유사도와 에이전트가 `query_ontology({operation:'similar_nodes'})` 로 받는
 * 유사도는 **같은 볼트에서 같아야 한다**. 다르면 사람은 화면이 지목한 쌍을,
 * 에이전트는 다른 쌍을 합치게 되고 — 중복 정리는 되돌리기 가장 비싼 쓰기다.
 *
 * parser 3-way / validator 2-way / impact-ranking contract 와 같은 패턴:
 * 하나의 fixture 를 양쪽 파이프라인에 흘리고 결과를 strict 비교한다.
 * 정규화(낱말 자르기)·가중치·반올림까지 전부 비교 대상이다 — 그 셋 중 하나만
 * 어긋나도 순위가 뒤집힌다.
 */

function manifestOf(docs: { slug: string; frontmatter: Record<string, unknown> }[]): VaultManifest {
  const vaultDocs: VaultDoc[] = docs.map((doc) => ({
    slug: doc.slug,
    path: `${doc.slug}.md`,
    title: String(doc.frontmatter.title ?? doc.slug),
    tags: [],
    frontmatter: doc.frontmatter,
    headings: [],
    excerpt: '',
    wordCount: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    linksOut: [],
  }));
  return {
    version: 'test',
    generatedAt: '2026-01-01T00:00:00.000Z',
    docs: vaultDocs,
    backlinksDetail: {},
    tags: {},
    tree: { name: 'root', path: '', type: 'dir', children: [] },
  };
}

interface AgentMatch {
  node: { slug: string };
  score: number;
  signals: { slug: number; title: number; kind: number; domain: number; neighbors: number };
}

function agentSimilarNodes(
  docs: { slug: string; frontmatter: Record<string, unknown> }[],
  slug: string,
): Map<string, AgentMatch> {
  const artifact = compileOntology(
    docs.map((doc, index) => ({ ...doc, body: '', mtime: index + 1 })),
    { includeIndexes: true },
  );
  const result = queryCompiledOntology(artifact, {
    operation: 'similar_nodes',
    slug,
    limit: 500,
  }) as { matches: AgentMatch[] };
  return new Map(result.matches.map((match) => [match.node.slug, match]));
}

/** 화면이 쓰는 것과 같은 환산기로 문서 slug 하나를 유사도 입력으로 되돌린다. */
function candidateOf(insight: KnowledgeProjectInsight, slug: string) {
  const candidates = buildSimilarityCandidates(insight.nodes, insight.edges);
  for (const candidate of candidates.values()) {
    if (candidate.slug === slug) return candidate;
  }
  throw new Error(`${slug} 를 웹 파생 그래프에서 찾지 못했습니다`);
}

describe('duplicate-pairs contract — 화면의 유사도 == MCP similar_nodes', () => {
  for (const testCase of DUPLICATE_PAIR_CASES) {
    it(`${testCase.name} — 쌍마다 점수와 신호가 같다`, () => {
      const insight = derivationToInsight(deriveOntologyFromVault(manifestOf(testCase.docs)));
      // 카드가 쓰는 것과 같은 진입점으로 후보를 만든다. 임계값 0 · 상한을
      // 넉넉히 줘서 점수가 붙는 모든 쌍을 비교 대상으로 올린다. 엔진은 점수
      // 0인 쌍을 아예 내보내지 않으므로(비교 대상이 없다) 그 구간은 뺀다.
      const rows = buildDuplicatePairs(insight.nodes, insight.edges, 500, 0).rows.filter(
        (row) => row.score > 0,
      );

      expect(rows.length, `${testCase.name} — 비교할 쌍이 하나도 없습니다`).toBeGreaterThan(0);

      for (const row of rows) {
        const agent = agentSimilarNodes(testCase.docs, row.keepSlug).get(row.dissolveSlug);
        expect(
          agent,
          `${row.keepSlug} 의 similar_nodes 결과에 ${row.dissolveSlug} 가 없습니다`,
        ).toBeDefined();
        expect(
          row.score,
          `${testCase.name} / ${row.id} — 화면은 ${row.score}, 에이전트는 ${agent!.score} 라고 말합니다. ` +
            '한쪽 정규화·가중치가 바뀌었다면 다른 쪽도 같이 바꾸세요.',
        ).toBe(agent!.score);

        // 총점만 맞고 내부 배분이 어긋나면 다른 볼트에서 순위가 뒤집힌다 —
        // 신호 5종을 하나씩 못 박는다.
        const web = scoreNodeSimilarity(candidateOf(insight, row.keepSlug), candidateOf(insight, row.dissolveSlug));
        expect({
          slug: web.slug,
          title: web.title,
          kind: web.kind,
          domain: web.domain,
          neighbors: web.neighbors,
        }).toEqual(agent!.signals);
      }
    });
  }

  it('낱말 자르기 규칙이 엔진과 같다 — 소문자·영숫자·2자 이상', () => {
    expect(similarityTokens('Ontology-Drawer Model')).toEqual(['ontology', 'drawer', 'model']);
    // 1자 토큰과 한글은 엔진에서도 떨어져 나간다(영숫자만 본다).
    expect(similarityTokens('a b 온톨로지 v2')).toEqual(['v2']);
    expect(similarityTokens(null)).toEqual([]);
  });

  it('빈 집합끼리는 0 — 이름이 전부 비영숫자인 두 노드가 서로 100% 가 되지 않는다', () => {
    expect(tokenSetJaccard(new Set(), new Set())).toBe(0);
    expect(
      scoreNodeSimilarity(
        { slug: '온톨로지', title: '온톨로지', kind: 'capability', domain: null, neighbors: new Set() },
        { slug: '지형도', title: '지형도', kind: 'capability', domain: null, neighbors: new Set() },
      ).total,
    ).toBe(0.1);
  });

  it('스타터 볼트(5개념)는 중복도 결합도 없다 — 두 카드가 빈 방을 만들지 않는다', () => {
    const docs = starterFilesForLocale('ko')
      .map((file) => ({
        slug: file.relPath.replace(/\.md$/, ''),
        frontmatter: (parseFrontmatter(file.content).frontmatter ?? {}) as Record<string, unknown>,
      }))
      .filter((doc) => typeof doc.frontmatter.kind === 'string');

    const insight = derivationToInsight(deriveOntologyFromVault(manifestOf(docs)));

    // 중복 섹션: 0건 → DoNextTab 이 섹션 자체를 그리지 않는다(빈 성공 카드 금지).
    expect(buildDuplicatePairs(insight.nodes, insight.edges, 3).rows).toHaveLength(0);
    // 결합 카드: 도메인 1개뿐이라 콜드스타트 → 격자 대신 다음 한 걸음이 있는
    // 빈 상태 한 장(`DomainCouplingCard` 테스트가 그 내용을 지킨다).
    expect(buildDomainCouplingSummary(insight.nodes, insight.edges).isColdStart).toBe(true);
  });

  it('임계값 위 쌍만 카드에 오르고, 상한을 넘으면 전체 수를 남긴다', () => {
    const insight = derivationToInsight(
      deriveOntologyFromVault(manifestOf(DUPLICATE_PAIR_CASES[0].docs)),
    );
    const capped = buildDuplicatePairs(insight.nodes, insight.edges, 1, 0);
    expect(capped.rows).toHaveLength(1);
    expect(capped.suspectCount).toBeGreaterThan(1);

    // 이름이 안 겹치는 볼트는 한 쌍도 의심하지 않는다 — 카드가 렌더되지 않는
    // 조건이 계산 쪽에서 이미 참이어야 한다(빈 성공 카드 금지).
    const quiet = derivationToInsight(
      deriveOntologyFromVault(manifestOf(DUPLICATE_PAIR_CASES[4].docs)),
    );
    expect(buildDuplicatePairs(quiet.nodes, quiet.edges, 5).rows).toHaveLength(0);
  });
});
