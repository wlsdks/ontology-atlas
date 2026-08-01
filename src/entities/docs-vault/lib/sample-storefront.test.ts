import { describe, expect, it } from 'vitest';
import { deriveOntologyFromVault } from './derive-ontology-from-vault';
import sampleStorefrontManifestRaw from '../data/sample-storefront.manifest.json';
import type { VaultDoc, VaultManifest } from '../model/types';

// 기본 샘플 볼트(`samples/storefront/`) — 볼트를 안 연 **모든** 방문자가 보는
// 첫 데이터다. 관문·지도·문서함·인사이트·프로젝트가 전부 이걸 그린다.
//
// ⚠️ **이 파일은 수를 박지 않는다.** 예전에는 `sourceConceptCount === 31` 과
// `capability:order-create → capability:payment-authorize` 를 고정했는데, 그건
// 샘플을 고칠 때마다 손으로 갱신해야 하는 잡일이면서 정작 *규격 위반* 은 하나도
// 못 잡았다(2026-08-01 재생성에서 실제로 깨졌다). 그래서 기대값을 **매니페스트
// 자신에서 유도**한다 — 노드가 늘어도 통과하고, 규격이 깨지면 터진다.
// 선례: `tests/e2e/topology-v2-smoke.spec.ts`.

const sampleStorefrontManifest = sampleStorefrontManifestRaw as VaultManifest;

const KIND_FOLDER: Record<string, string> = {
  domain: 'domains/',
  capability: 'capabilities/',
  element: 'elements/',
};

function kindOf(doc: VaultDoc): string | undefined {
  const kind = doc.frontmatter?.kind;
  return typeof kind === 'string' ? kind : undefined;
}

function refsOf(doc: VaultDoc, key: string): string[] {
  const value = doc.frontmatter?.[key];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

describe('sample storefront vault — connected business graph', () => {
  const derivation = deriveOntologyFromVault(sampleStorefrontManifest);
  const docs = sampleStorefrontManifest.docs;

  it('vault 문서 전원이 kind 노드로 유도된다 (기대 분포는 매니페스트에서 유도)', () => {
    const expectedKindCounts: Record<string, number> = {};
    for (const doc of docs) {
      const kind = kindOf(doc);
      if (!kind) continue;
      expectedKindCounts[kind] = (expectedKindCounts[kind] ?? 0) + 1;
    }

    expect(derivation.sourceConceptCount).toBe(docs.length);
    expect(derivation.sourceKindCounts).toEqual(expectedKindCounts);
  });

  it('unknown kind 노드가 없다 (모든 relates/dependencies ref 가 folder-prefixed 로 정확히 resolve)', () => {
    const unknownNodes = derivation.nodes.filter((n) => n.kind === 'unknown');
    expect(unknownNodes.map((n) => n.id)).toEqual([]);
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

  // 기본 샘플은 처음 오는 사람이 보는 **유일한** 볼트다. 카드·행이 읽는 키가
  // 비어 있으면 그 사람은 「설명이 아직 없는 프로젝트입니다」를 첫 문장으로
  // 만나고, 한 클릭 뒤 상세에서는 설명을 본다 — 같은 사실에 두 답이다.
  it('모든 문서가 frontmatter description 을 갖는다 (카드·최근 활동·행이 읽는 키)', () => {
    const missing = docs
      .filter((doc) => {
        const value = doc.frontmatter?.description;
        return typeof value !== 'string' || value.trim().length === 0;
      })
      .map((doc) => doc.slug);

    expect(missing).toEqual([]);
  });

  // ⚠️ 이 볼트가 고쳐진 이유 그 자체 (2026-08-01). 32개 중 25개에 `display_en`
  // 이 없어서 `/en/docs` · `/en/projects` 는 한국어 원문 title 을 그대로 그리고
  // 지도는 번역된 이름을 그렸다 — **같은 노드가 화면마다 다른 언어**였다.
  // AGENTS.md: "vault 가 쓰는 로케일은 전부 채운다 — 한쪽만 채우면 다른 언어
  // 사용자에게 원문 title 이 그대로 노출된다."
  it.each(['display_ko', 'display_en'])('모든 문서가 %s 를 갖는다 (로케일 전수)', (key) => {
    const missing = docs
      .filter((doc) => {
        const value = doc.frontmatter?.[key];
        return typeof value !== 'string' || value.trim().length === 0;
      })
      .map((doc) => doc.slug);

    expect(missing).toEqual([]);
  });

  // 경로형 슬러그 금지 (2026-08-01 판정 「슬러그는 평평한 식별자다」) — 종류
  // 폴더 아래는 평평해야 하고, 위치는 `path:` 가 나른다.
  it('슬러그가 종류 폴더 아래에서 평평하다 (경로형 슬러그 0)', () => {
    const nested = docs
      .map((doc) => ({ doc, kind: kindOf(doc) }))
      .filter(({ doc, kind }) => {
        const folder = kind ? KIND_FOLDER[kind] : undefined;
        if (!folder) return false;
        const slug = typeof doc.frontmatter?.slug === 'string' ? doc.frontmatter.slug : doc.slug;
        return slug.startsWith(folder) && slug.slice(folder.length).includes('/');
      })
      .map(({ doc }) => doc.slug);

    expect(nested).toEqual([]);
  });

  // 온톨로지는 트리가 아니라 **그래프**다. 의미 관계(relates)와 의존
  // (dependencies)이 실제로 있어야 그걸 가르칠 수 있다 — 도그푸드 볼트는
  // `relates` 가 0이라 그 예시가 되지 못한다.
  it('dependencies[] 가 depends_on 엣지로, relates[] 가 related_to 엣지로 유도된다', () => {
    const dependsOn = derivation.edges.filter((e) => e.type === 'depends_on');
    const relatedTo = derivation.edges.filter((e) => e.type === 'related_to');
    expect(dependsOn.length).toBeGreaterThan(0);
    expect(relatedTo.length).toBeGreaterThan(0);
  });

  // 매니페스트가 적은 관계 ref 는 **전부** 실재 노드를 가리켜야 한다. 특정 쌍을
  // 박는 대신 전수로 본다 — 노드를 지우고 백링크를 안 지운 회귀를 잡는다.
  it('모든 dependencies/relates ref 가 실재 노드를 가리킨다', () => {
    const knownSlugs = new Set<string>();
    for (const doc of docs) {
      const fmSlug = doc.frontmatter?.slug;
      if (typeof fmSlug === 'string' && fmSlug.trim()) knownSlugs.add(fmSlug.trim());
      knownSlugs.add(doc.slug);
    }

    const dangling: string[] = [];
    for (const doc of docs) {
      for (const key of ['dependencies', 'relates', 'capabilities', 'elements', 'domains']) {
        for (const ref of refsOf(doc, key)) {
          if (!knownSlugs.has(ref)) dangling.push(`${doc.slug}.${key} → ${ref}`);
        }
      }
    }

    expect(dangling).toEqual([]);
  });
});
