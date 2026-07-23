import { describe, expect, it } from 'vitest';
import { deriveOntologyFromVault } from './derive-ontology-from-vault';
import sampleStorefrontManifestRaw from '../data/sample-storefront.manifest.json';
import type { VaultManifest } from '../model/types';

// P0 공감형 샘플 vault (2026-07) — `samples/storefront/` 가 실제로 연결된
// (orphan 0) 비즈니스 그래프를 유도하는지 고정하는 빌드 파이프라인 test.
// dogfood(`derive-ontology-from-vault.test.ts`)와 같은 계약을 storefront
// manifest 실물에 대해 검증한다 — frontmatter 슬러그 표기(`domains/x` 접두사
// vs bare)가 하나라도 어긋나면 phantom `unknown:*` 노드나 끊긴 섬이 생기므로
// 이 test 가 회귀를 잡는다.

const sampleStorefrontManifest = sampleStorefrontManifestRaw as VaultManifest;

describe('sample storefront vault — connected business graph', () => {
  const derivation = deriveOntologyFromVault(sampleStorefrontManifest);

  it('31 vault 문서 전원이 kind 노드로 유도된다 (project 1 · domain 6 · capability 13 · element 11)', () => {
    expect(derivation.sourceConceptCount).toBe(31);
    expect(derivation.sourceKindCounts).toEqual({
      project: 1,
      domain: 6,
      capability: 13,
      element: 11,
    });
  });

  it('unknown kind 노드가 없다 (모든 relates/dependencies ref 가 folder-prefixed 로 정확히 resolve)', () => {
    const unknownNodes = derivation.nodes.filter((n) => n.kind === 'unknown');
    expect(unknownNodes).toEqual([]);
  });

  it('project → domain → capability → element 체인이 끊기지 않는다 (orphan 0)', () => {
    const nodeIds = new Set(derivation.nodes.map((n) => n.id));
    // 무방향 인접 리스트 — contains/depends_on/related_to 어떤 타입이든
    // "이 노드가 그래프의 나머지와 이어져 있는가" 만 본다(orphan = 고립 노드).
    const adjacency = new Map<string, Set<string>>();
    for (const id of nodeIds) adjacency.set(id, new Set());
    for (const edge of derivation.edges) {
      adjacency.get(edge.from)?.add(edge.to);
      adjacency.get(edge.to)?.add(edge.from);
    }

    const projectNode = derivation.nodes.find((n) => n.kind === 'project');
    expect(projectNode).toBeDefined();

    const visited = new Set<string>([projectNode!.id]);
    const queue = [projectNode!.id];
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      for (const next of adjacency.get(cur) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }

    const orphans = derivation.nodes.filter((n) => !visited.has(n.id));
    expect(orphans.map((n) => n.id)).toEqual([]);
    expect(visited.size).toBe(derivation.nodes.length);
  });

  it('dependencies[] 가 depends_on 엣지로, relates[] 가 related_to 엣지로 유도된다', () => {
    const dependsOn = derivation.edges.filter((e) => e.type === 'depends_on');
    const relatedTo = derivation.edges.filter((e) => e.type === 'related_to');
    expect(dependsOn.length).toBeGreaterThan(0);
    expect(relatedTo.length).toBeGreaterThan(0);
    expect(
      dependsOn.some(
        (e) => e.from === 'capability:order-create' && e.to === 'capability:payment-authorize',
      ),
    ).toBe(true);
  });
});
