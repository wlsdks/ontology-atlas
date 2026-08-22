import { createHash } from 'node:crypto';
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
 * The duplicate-suspect contract. The similarity scored by the "similar names — are
 * these the same?" card and the similarity an agent receives from
 * `query_ontology({operation:'similar_nodes'})` **must match on the same vault**.
 * If they differ, a person merges the pair the screen named while an agent merges a
 * different one — and duplicate cleanup is the most expensive write to undo.
 *
 * The same pattern as the 3-way parser, 2-way validator, and impact-ranking
 * contracts: one fixture flows through both pipelines and the results are compared
 * strictly. Normalisation (token splitting), weighting, and rounding are all
 * compared — a divergence in any one of the three inverts the ranking.
 */

function uidForSlug(slug: string): string {
  const hex = createHash('sha256').update(slug).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = '8';
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

function withUid<T extends { slug: string; frontmatter: Record<string, unknown> }>(doc: T): T {
  return {
    ...doc,
    frontmatter: { uid: uidForSlug(doc.slug), ...doc.frontmatter },
  };
}

function manifestOf(docs: { slug: string; frontmatter: Record<string, unknown> }[]): VaultManifest {
  const vaultDocs: VaultDoc[] = docs.map(withUid).map((doc) => ({
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
    docs.map(withUid).map((doc, index) => ({ ...doc, body: '', mtime: index + 1 })),
    { includeIndexes: true },
  );
  const result = queryCompiledOntology(artifact, {
    operation: 'similar_nodes',
    slug,
    limit: 500,
  }) as { matches: AgentMatch[] };
  return new Map(result.matches.map((match) => [match.node.slug, match]));
}

/** Turns one document slug back into similarity input, using the same converter the screen uses. */
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
      // Builds candidates through the same entry point the card uses. Threshold 0 and a
      // generous limit bring every scored pair into the comparison. The engine never emits
      // pairs scoring 0 (there is nothing to compare), so that range is excluded.
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

        // Matching totals with a divergent internal split inverts the ranking on a different
        // vault — so all five signals are pinned individually.
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
    // Single-character tokens and Hangul drop out in the engine too (it looks at alphanumerics only).
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

    // Duplicates section: at 0 cases DoNextTab does not draw the section at all (no empty success cards).
    expect(buildDuplicatePairs(insight.nodes, insight.edges, 3).rows).toHaveLength(0);
    // Coupling card: with a single domain this is a cold start → one empty state
    // carrying the next step instead of a grid (its content is guarded by the
    // `DomainCouplingCard` test).
    expect(buildDomainCouplingSummary(insight.nodes, insight.edges).isColdStart).toBe(true);
  });

  it('임계값 위 쌍만 카드에 오르고, 상한을 넘으면 전체 수를 남긴다', () => {
    const insight = derivationToInsight(
      deriveOntologyFromVault(manifestOf(DUPLICATE_PAIR_CASES[0].docs)),
    );
    const capped = buildDuplicatePairs(insight.nodes, insight.edges, 1, 0);
    expect(capped.rows).toHaveLength(1);
    expect(capped.suspectCount).toBeGreaterThan(1);

    // A vault with no overlapping names suspects no pair — the condition under which the
    // card does not render must already be true on the computation side (no empty
    // success cards).
    const quiet = derivationToInsight(
      deriveOntologyFromVault(manifestOf(DUPLICATE_PAIR_CASES[4].docs)),
    );
    expect(buildDuplicatePairs(quiet.nodes, quiet.edges, 5).rows).toHaveLength(0);
  });
});
