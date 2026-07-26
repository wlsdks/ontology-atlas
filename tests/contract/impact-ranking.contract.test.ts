import { describe, expect, it } from 'vitest';
import {
  IMPACT_DIRECTION_DIVERGENT_GRAPH_KEYS,
  IMPACT_INCLUDED_GRAPH_KEYS,
  IMPACT_RANKING_CASES,
  IMPACT_SOFT_GRAPH_KEYS,
} from '../fixtures/impact-ranking-cases.mjs';
import type { VaultDoc, VaultManifest } from '@/entities/docs-vault';
import { deriveOntologyFromVault } from '@/entities/docs-vault';
import { derivationToInsight } from '@/features/vault-ontology/model/use-ontology-insight';
import { computeOntologyDependents } from '@/shared/lib/ontology-tree';
import { buildImpactRanking } from '@/views/ontology-insights/lib/impact-ranking';
import { compileOntology } from '../../mcp/src/ontology-compiler.mjs';
import { RELATION_TYPE_VALUES, queryCompiledOntology } from '../../mcp/src/ontology-engine.mjs';

/**
 * S2 — 영향 랭킹 contract. 「바꾸면 멀리 퍼지는 개념」 카드가 화면에 쓰는 수와
 * 에이전트가 `query_ontology({operation:'blast_radius', direction:'incoming'})`
 * 로 받는 수는 **같은 볼트에서 같아야 한다**. 다르면 사람과 에이전트가 같은
 * 그래프를 두고 다른 위험도를 말하게 되고, 그 순간 이 화면은 의사결정 자료가
 * 아니라 소음이 된다.
 *
 * parser 3-way / validator 2-way / vault-health contract 와 같은 패턴: 하나의
 * fixture 를 양쪽 파이프라인에 그대로 흘리고 결과를 strict 비교한다.
 *
 * 두 엔진의 표현 차이는 호출 인자로만 흡수한다 —
 * - 깊이: 웹은 전체 closure(노드 수), MCP 는 최대 20 → fixture 는 20 미만.
 * - 필터: 구조/의존 관계만 있는 볼트는 **필터 없이** 비교한다(가장 강한 형태).
 *   연관/설명이 섞인 볼트만, 화면이 의도적으로 빼는 그 두 종류를 빼려고
 *   include-list(`IMPACT_INCLUDED_GRAPH_KEYS`)를 넘긴다.
 * 의미론(역방향 전이 도달 집합의 크기) 자체는 손대지 않는다.
 */

const MCP_DEPTH = 20;
const MCP_LIMIT = 500;

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

function agentBlastRadius(
  docs: { slug: string; frontmatter: Record<string, unknown> }[],
  slug: string,
  softRelations = false,
): number {
  const artifact = compileOntology(
    docs.map((doc, index) => ({ ...doc, body: '', mtime: index + 1 })),
    { includeIndexes: true },
  );
  const result = queryCompiledOntology(artifact, {
    operation: 'blast_radius',
    slug,
    direction: 'incoming',
    depth: MCP_DEPTH,
    limit: MCP_LIMIT,
    ...(softRelations ? { types: IMPACT_INCLUDED_GRAPH_KEYS } : {}),
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
        const agent = agentBlastRadius(testCase.docs, doc.slug, testCase.softRelations);

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
      // 근거 계층은 **표시만** 강등된 것이지 다른 계산이 아니다. 두 계층을
      // 같은 단언에 넣어, 강등을 "파생 개념을 그래프에서 빼는" 방식으로
      // 다시 구현하면 여기가 깨지게 한다.
      const rows = [...ranking.rows, ...ranking.evidenceRows];

      for (const row of rows) {
        const node = insight.nodes.find((candidate) => candidate.id === row.id);
        const slug = node?.evidenceIds[0];
        expect(slug, `${row.id} 의 근거 문서를 찾지 못했습니다`).toBeDefined();
        expect(row.total).toBe(agentBlastRadius(testCase.docs, slug!, testCase.softRelations));
        // 「바로」는 「건너서 포함」의 부분집합 — 막대가 자기 자신을 넘칠 수 없다.
        expect(row.direct).toBeLessThanOrEqual(row.total);
      }
    });
  }

  // 엔진의 관계 어휘가 커지면(예: 볼트 스키마의 `broader` 가 뒤늦게 들어오면)
  // "파급으로 볼 것"인지 사람이 한 번 결정해야 한다. 이 단언이 그 순간 깨져
  // 결정을 강제한다 — 조용히 한쪽만 넓어지는 게 drift 다.
  it('엔진의 관계 어휘 == 파급 include-list + 소프트 연관 + 방향 비대칭 키', () => {
    expect([...RELATION_TYPE_VALUES].sort()).toEqual(
      [
        ...IMPACT_INCLUDED_GRAPH_KEYS,
        ...IMPACT_SOFT_GRAPH_KEYS,
        ...IMPACT_DIRECTION_DIVERGENT_GRAPH_KEYS,
      ].sort(),
    );
  });

  // 알려진 비대칭 — 인라인 `domain:` 한 줄을 두 엔진이 반대 방향으로 읽는다.
  // 웹 파생은 `도메인 → 역량`(도메인 아래 매달리는 트리), 컴파일러는
  // `역량 → 도메인`(belongs-to). 그래서 파급이 정확히 거울처럼 뒤집힌다.
  // 이 테스트는 버그를 축복하는 게 아니라 **좌표를 고정**한다 — 언젠가 방향을
  // 맞추면 여기가 깨지고, 그때 이 키를 include-list 로 옮기면 된다.
  it('인라인 `domain:` 은 두 엔진이 반대 방향으로 읽는다 (좌표 고정)', () => {
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

    // 화면: 역량을 바꾸면 그 역량을 담은 도메인을 다시 본다.
    expect(computeOntologyDependents(nodeOf('capabilities/login').id, insight.nodes, insight.edges)).toBe(1);
    expect(computeOntologyDependents(nodeOf('domains/auth').id, insight.nodes, insight.edges)).toBe(0);
    // 에이전트: 정확히 반대.
    expect(agentBlastRadius(docs, 'capabilities/login')).toBe(0);
    expect(agentBlastRadius(docs, 'domains/auth')).toBe(1);
  });
});
