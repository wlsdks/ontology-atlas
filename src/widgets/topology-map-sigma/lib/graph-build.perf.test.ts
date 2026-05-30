import { describe, expect, it } from 'vitest';
import { buildGraph } from './graph-build';
import type { Project } from '@/entities/project';
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from '@/entities/knowledge-graph';

/**
 * 성능 회귀 차단 — live-update 의 *두 번째* 핵심 비용.
 *
 * wedge charter 의 심장(실시간 시각 성장, 렉 0)이 지목하는 렉 근원은 두 단계다:
 * (1) `deriveOntologyFromVault`(별도 perf 테스트로 baseline 잡음) → (2) **`buildGraph`**
 * — derive 결과를 Sigma 그래프(노드/엣지 attr + degree 스케일 + forceLabel + 랜드마크)
 * 로 만드는 단계. vault 가 바뀔 때마다 *전체* 재빌드되며(SigmaTopology), 토폴로지의
 * 실제 부피는 project 몇 개 + 대량의 ontology 확장(domain/capability/element)이다.
 *
 * derive 는 측정됐지만 `buildGraph` 는 기능 테스트만 있고 perf baseline 이 없었다.
 * charter 의 north-star(증분 그래프 업데이트)는 이 전체-재빌드 비용을 변경분만으로
 * 줄이는 것 — 그 작업이 *무엇을* 줄이는지 알려면 먼저 여기서 baseline + 회귀 가드를
 * 잡아야 한다("측정 먼저").
 *
 * jsdom 절대값은 실 브라우저와 다르지만 회귀 감지엔 충분. 임계는 환경 noise 고려해
 * lenient.
 */

const EPOCH = new Date(0);

function makeProject(slug: string, deps: string[]): Project {
  return {
    slug,
    name: slug,
    description: '',
    tags: [],
    stack: [],
    links: [],
    dependencies: deps,
    screenshots: [],
    createdAt: EPOCH,
    updatedAt: EPOCH,
  };
}

function makeNode(id: string, kind: string): KnowledgeGraphNode {
  return {
    id,
    title: id.split('/').pop() ?? id,
    kind,
    projectIds: [],
    summary: '',
    evidenceIds: [],
    lastApprovedAt: EPOCH,
    lastApprovedBy: 'vault',
  };
}

function makeEdge(id: string, from: string, to: string, type: string): KnowledgeGraphEdge {
  return {
    id,
    from,
    to,
    type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: EPOCH,
    lastApprovedBy: 'vault',
  };
}

/**
 * project P 개 + domain D + (domain 당) capability C + (capability 당) element E 의
 * ontology 확장. contains(계층) + depends_on(인접 capability) + related_to(cross-domain)
 * 엣지로 buildGraph 의 ext 노드/엣지 루프 + degree 재계산 + forceLabel + 랜드마크를
 * 현실적으로 자극한다.
 */
function buildLargeInput(
  projectCount: number,
  domainCount: number,
  capPerDomain: number,
  elemPerCap: number,
): { projects: Project[]; ext: { nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] } } {
  const projects: Project[] = [];
  for (let p = 0; p < projectCount; p += 1) {
    projects.push(makeProject(`projects/p${p}`, p > 0 ? [`projects/p${p - 1}`] : []));
  }

  const nodes: KnowledgeGraphNode[] = [];
  const edges: KnowledgeGraphEdge[] = [];
  let edgeId = 0;
  const addEdge = (from: string, to: string, type: string) =>
    edges.push(makeEdge(`e${edgeId++}`, from, to, type));

  for (let d = 0; d < domainCount; d += 1) {
    const domainId = `domains/d${d}`;
    nodes.push(makeNode(domainId, 'domain'));
    for (let c = 0; c < capPerDomain; c += 1) {
      const capId = `capabilities/d${d}-c${c}`;
      nodes.push(makeNode(capId, 'capability'));
      addEdge(domainId, capId, 'contains');
      for (let e = 0; e < elemPerCap; e += 1) {
        const elemId = `elements/d${d}-c${c}-e${e}`;
        nodes.push(makeNode(elemId, 'element'));
        addEdge(capId, elemId, 'contains');
      }
      // 인접 capability 의존 + cross-domain relates — cross-edge 자극.
      addEdge(capId, `capabilities/d${d}-c${(c + 1) % capPerDomain}`, 'depends_on');
      addEdge(capId, `capabilities/d${(d + 1) % domainCount}-c${c}`, 'related_to');
    }
  }

  return { projects, ext: { nodes, edges } };
}

describe('buildGraph — live-update perf baseline', () => {
  it('대형 ontology(~600 노드) buildGraph 가 2500ms 안에 (회귀 sanity)', () => {
    const { projects, ext } = buildLargeInput(5, 10, 10, 5);
    expect(ext.nodes.length).toBeGreaterThan(600);

    const t0 = performance.now();
    const graph = buildGraph(projects, [], { ontologyExtension: ext });
    const elapsed = performance.now() - t0;

    // 그래프가 실제로 만들어졌는지 sanity — project + ontology ext 노드.
    expect(graph.order).toBeGreaterThanOrEqual(ext.nodes.length);
    expect(graph.size).toBeGreaterThan(0);

    console.log(
      `[perf] buildGraph — ${ext.nodes.length} ext nodes / ${ext.edges.length} ext edges + ${projects.length} projects → ${graph.order} nodes / ${graph.size} edges in ${elapsed.toFixed(1)}ms`,
    );

    // lenient 절대 임계 — jsdom/CI noise 흡수. 이 줄이 깨지면 buildGraph hot-path 회귀.
    expect(elapsed).toBeLessThan(2500);
  });
});
