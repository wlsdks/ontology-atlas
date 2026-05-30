import { describe, expect, it } from 'vitest';
import { deriveOntologyFromVault } from './derive-ontology-from-vault';
import type { VaultDoc, VaultManifest } from '../model/types';

/**
 * 성능 회귀 차단 — live-update 의 핵심 비용.
 *
 * `deriveOntologyFromVault` 는 vault 가 바뀔 때마다(에이전트 편집 → 폴링/워처 →
 * refresh) 토폴로지를 다시 그리기 위해 *전체* 재실행되는 derivation 이다. wedge
 * charter 의 심장(실시간 시각 성장, 렉 0)에서 이 함수가 대형 vault 에서 얼마나
 * 걸리는지가 곧 "틀어놓고 보는데 끊기느냐" 를 좌우한다.
 *
 * 여기서 *전체-재빌드* 비용의 baseline + 회귀 가드를 잡는다. charter 의 north-star
 * (증분 업데이트)는 이 비용을 변경분만으로 줄이는 것 — 그 작업의 측정 기준.
 *
 * jsdom 절대값은 실 브라우저와 다르지만 회귀 감지엔 충분. 임계는 환경 noise
 * 고려해 lenient.
 */

function makeDoc(slug: string, frontmatter: Record<string, unknown>): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title: slug.split('/').pop() ?? slug,
    description: undefined,
    tags: [],
    frontmatter,
    headings: [],
    excerpt: '',
    wordCount: 0,
    updatedAt: '2026-04-01T00:00:00.000Z',
    linksOut: [],
  };
}

/**
 * project 1 + domain D + (domain 당) capability C + (capability 당) element E.
 * capability 는 domain·elements·dependencies·relates frontmatter 를 달아 derive
 * 의 엣지 빌드(+ stub 생성)를 현실적으로 자극한다.
 */
function buildLargeManifest(domainCount: number, capPerDomain: number, elemPerCap: number): {
  manifest: VaultManifest;
  docCount: number;
} {
  const docs: VaultDoc[] = [
    makeDoc('projects/app', { kind: 'project', title: 'App' }),
  ];
  for (let d = 0; d < domainCount; d += 1) {
    const domain = `d${d}`;
    docs.push(makeDoc(`domains/${domain}`, { kind: 'domain', title: `Domain ${d}` }));
    for (let c = 0; c < capPerDomain; c += 1) {
      const capName = `${domain}-c${c}`;
      const elements: string[] = [];
      for (let e = 0; e < elemPerCap; e += 1) {
        const elemSlug = `elements/${capName}-e${e}`;
        elements.push(elemSlug);
        docs.push(makeDoc(elemSlug, { kind: 'element', domain }));
      }
      // 인접 capability 로의 dependency + relates — cross-edge 자극.
      const nextCap = `capabilities/${domain}-c${(c + 1) % capPerDomain}`;
      docs.push(
        makeDoc(`capabilities/${capName}`, {
          kind: 'capability',
          domain,
          elements,
          dependencies: [nextCap],
          relates: [`capabilities/d${(d + 1) % domainCount}-c${c}`],
        }),
      );
    }
  }
  return {
    manifest: {
      version: '2026-04-23',
      generatedAt: new Date('2026-04-01T00:00:00.000Z').toISOString(),
      docs,
      backlinksDetail: {},
      tags: {},
      tree: { name: 'root', path: '', type: 'dir' },
    },
    docCount: docs.length,
  };
}

describe('deriveOntologyFromVault — live-update perf baseline', () => {
  it('대형 vault(~600 노드) derive 가 2500ms 안에 (회귀 sanity)', () => {
    const { manifest, docCount } = buildLargeManifest(10, 10, 5);
    expect(docCount).toBeGreaterThan(600);

    const t0 = performance.now();
    const result = deriveOntologyFromVault(manifest);
    const elapsed = performance.now() - t0;

    // derive 가 실제로 그래프를 만들었는지 sanity. 모든 ref 가 실제 doc 으로
    // 해소되면 노드 수 = doc 수(추가 stub 0), missing ref 면 그 이상.
    expect(result.nodes.length).toBeGreaterThanOrEqual(docCount);
    expect(result.edges.length).toBeGreaterThan(0);

    console.log(
      `[perf] deriveOntologyFromVault — ${docCount} docs → ${result.nodes.length} nodes / ${result.edges.length} edges in ${elapsed.toFixed(1)}ms`,
    );

    // lenient 절대 임계 — jsdom noise 흡수. 이 줄이 깨지면 derive hot-path 회귀.
    expect(elapsed).toBeLessThan(2500);
  });
});
