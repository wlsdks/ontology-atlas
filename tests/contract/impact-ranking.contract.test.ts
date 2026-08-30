import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  IMPACT_DIRECTION_DIVERGENT_GRAPH_KEYS,
  IMPACT_INCLUDED_GRAPH_KEYS,
  IMPACT_RANKING_CASES,
  IMPACT_SOFT_GRAPH_KEYS,
  IMPACT_STRUCTURAL_GRAPH_KEYS,
} from '../fixtures/impact-ranking-cases.mjs';
import type { VaultDoc, VaultManifest } from '@/entities/docs-vault';
import { deriveOntologyFromVault } from '@/entities/docs-vault';
import { derivationToInsight } from '@/features/vault-ontology/model/use-ontology-insight';
import { computeOntologyDependents } from '@/entities/knowledge-graph/lib/ontology-tree';
import { buildImpactRanking } from '@/views/ontology-insights/lib/impact-ranking';
import { compileOntology } from '../../mcp/src/ontology-compiler.mjs';
import { RELATION_TYPE_VALUES, queryCompiledOntology } from '../../mcp/src/ontology-engine.mjs';

/**
 * Impact ranking contract. The number the "concepts whose change spreads far" card
 * paints on screen and the number an agent receives from
 * `query_ontology({operation:'blast_radius', direction:'incoming'})` **must agree on
 * the same vault**. If they differ, a person and an agent state different risk over
 * the same graph, and at that moment this screen becomes noise rather than material
 * for a decision.
 *
 * Same pattern as the parser 3-way, validator 2-way, and vault-health contracts: one
 * fixture flows through both pipelines and the results are compared strictly.
 *
 * Differences in the two engines' expression are absorbed through call arguments
 * only:
 * - Depth: the web takes the full closure (node count), MCP caps at 20 → the fixture
 *   stays under 20.
 * - Filters: a vault with only structural and dependency relations is compared
 *   **without a filter** (the strongest form). Only a vault mixing in association and
 *   description passes an include list (`IMPACT_INCLUDED_GRAPH_KEYS`) to exclude the
 *   two kinds the screen deliberately omits.
 * The semantics (the size of the reverse transitive reachable set) are untouched.
 */

const MCP_DEPTH = 20;
const MCP_LIMIT = 500;

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

function agentBlastRadius(
  docs: { slug: string; frontmatter: Record<string, unknown> }[],
  slug: string,
): number {
  const artifact = compileOntology(
    docs.map(withUid).map((doc, index) => ({ ...doc, body: '', mtime: index + 1 })),
    { includeIndexes: true },
  );
  const result = queryCompiledOntology(artifact, {
    operation: 'blast_radius',
    slug,
    direction: 'incoming',
    depth: MCP_DEPTH,
    limit: MCP_LIMIT,
    types: IMPACT_INCLUDED_GRAPH_KEYS,
  }) as { summary: { affectedNodes: number } };
  return result.summary.affectedNodes;
}

describe('impact-ranking contract — 화면의 파급 수 == MCP blast_radius', () => {
  for (const testCase of IMPACT_RANKING_CASES) {
    it(testCase.name, () => {
      const insight = derivationToInsight(deriveOntologyFromVault(manifestOf(testCase.docs)));

      for (const doc of testCase.docs) {
        const node = insight.nodes.find((candidate) => candidate.evidenceIds[0] === doc.slug);
        expect(node, `${doc.slug} 가 웹 파생 그래프에 없습니다`).toBeDefined();

        const web = computeOntologyDependents(node!.id, insight.nodes, insight.edges);
        const agent = agentBlastRadius(testCase.docs, doc.slug);

        expect(
          web,
          `${testCase.name} / ${doc.slug} — 화면은 ${web}, 에이전트는 ${agent} 라고 말합니다. ` +
            '한쪽 의미론이 바뀌었다면 다른 쪽도 같이 바꾸세요.',
        ).toBe(agent);
      }
    });

    it(`${testCase.name} — 카드 행의 숫자도 같은 계산에서 나온다`, () => {
      const insight = derivationToInsight(deriveOntologyFromVault(manifestOf(testCase.docs)));
      const ranking = buildImpactRanking(insight.nodes, insight.edges, 6);
      // The evidence tier is demoted **in display only**, not computed differently. Both
      // tiers go into the same assertion so that reimplementing the demotion as "remove
      // derived concepts from the graph" breaks here.
      const rows = [...ranking.rows, ...ranking.evidenceRows];

      for (const row of rows) {
        const node = insight.nodes.find((candidate) => candidate.id === row.id);
        const slug = node?.evidenceIds[0];
        expect(slug, `${row.id} 의 근거 문서를 찾지 못했습니다`).toBeDefined();
        expect(row.total).toBe(agentBlastRadius(testCase.docs, slug!));
        // "direct" is a subset of "including indirect" — a bar cannot exceed itself.
        expect(row.direct).toBeLessThanOrEqual(row.total);
      }
    });
  }

  // When an engine's relation vocabulary grows (say the vault schema's `broader`
  // arrives later), a person must decide once whether it counts as impact. This
  // assertion breaks at that moment and forces the decision — one side widening
  // quietly is exactly what drift is.
  it('엔진의 관계 어휘 == 파급 include-list + 소프트 연관 + 방향 비대칭 키', () => {
    expect([...RELATION_TYPE_VALUES].sort()).toEqual(
      [
        ...IMPACT_INCLUDED_GRAPH_KEYS,
        ...IMPACT_STRUCTURAL_GRAPH_KEYS,
        ...IMPACT_SOFT_GRAPH_KEYS,
        ...IMPACT_DIRECTION_DIVERGENT_GRAPH_KEYS,
      ].sort(),
    );
  });

  // A known asymmetry: the two engines read a single inline `domain:` line in
  // opposite directions. The web derivation reads `domain → capability` (a tree
  // hanging beneath the domain) and the compiler reads `capability → domain`
  // (belongs-to), so the impact is exactly mirrored. This test does not bless the bug
  // — it **pins the coordinates**: aligning the direction one day breaks here, and
  // that is when this key moves into the include list.
  it('인라인 `domain:` 은 방향 차이와 무관하게 영향에서 제외한다', () => {
    const docs = [
      { slug: 'domains/auth', frontmatter: { kind: 'domain', title: 'Auth' } },
      {
        slug: 'capabilities/login',
        frontmatter: { kind: 'capability', title: 'Login', domain: 'domains/auth' },
      },
    ];
    const insight = derivationToInsight(deriveOntologyFromVault(manifestOf(docs)));
    const nodeOf = (slug: string) =>
      insight.nodes.find((candidate) => candidate.evidenceIds[0] === slug)!;

    expect(computeOntologyDependents(nodeOf('capabilities/login').id, insight.nodes, insight.edges)).toBe(0);
    expect(computeOntologyDependents(nodeOf('domains/auth').id, insight.nodes, insight.edges)).toBe(0);
    expect(agentBlastRadius(docs, 'capabilities/login')).toBe(0);
    expect(agentBlastRadius(docs, 'domains/auth')).toBe(0);
  });
});
