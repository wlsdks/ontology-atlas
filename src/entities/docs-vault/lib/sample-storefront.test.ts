import { describe, expect, it } from 'vitest';
import { deriveOntologyFromVault } from './derive-ontology-from-vault';
import sampleStorefrontManifestRaw from '../data/sample-storefront.manifest.json';
import type { VaultDoc, VaultManifest } from '../model/types';

// The default sample vault (`samples/storefront/`) is the first data **every**
// visitor without a vault sees — the gateway, map, docs, insights, and projects all
// draw it.
//
// ⚠️ **This file pins no counts.** It used to fix `sourceConceptCount === 31` and a
// specific `capability:order-create → capability:payment-authorize` edge, which was
// hand-maintenance on every sample edit and caught no actual *spec violation* (it
// broke on the 2026-08-01 regeneration). Expectations are therefore **derived from
// the manifest itself** — they pass as nodes are added and fail when a spec breaks.
// Precedent: `tests/e2e/topology-v2-smoke.spec.ts`.

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

/**
 * ⚠️ **An architecture profile is deliberately not one of these documents.**
 *
 * `docs/ARCHITECTURE.md` and decision (120) both settle it: a file carrying
 * `architecture_schema: architecture-profile/v1` has **no `kind:`**, so it never becomes a Map
 * node — "not an ontology kind and not an overloaded ontology `document`". These three checks
 * were written before profiles existed and say "every document", which would force the sample's
 * profile to grow a `kind`, a `uid` and a `relates` edge purely to satisfy them. That is the
 * contract bending the design rather than describing it.
 *
 * So the graph checks read the graph documents, and the profile is excluded by the one property
 * that defines it. The exclusion is narrow on purpose: anything without that schema is still held
 * to every rule below.
 */
const isArchitectureProfile = (doc: VaultDoc): boolean =>
  doc.frontmatter?.architecture_schema === 'architecture-profile/v1';

describe('sample storefront vault — connected business graph', () => {
  const derivation = deriveOntologyFromVault(sampleStorefrontManifest);
  const docs = sampleStorefrontManifest.docs.filter((doc) => !isArchitectureProfile(doc));

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
    // Undirected adjacency — regardless of type (contains/depends_on/related_to),
    // this only asks whether a node is connected to the rest of the graph.
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

  // The default sample is the **only** vault a newcomer sees. If the key a card or
  // row reads is empty, their first sentence is "this project has no description
  // yet", and one click later the detail page shows one — two answers to one fact.
  it('모든 문서가 frontmatter description 을 갖는다 (카드·최근 활동·행이 읽는 키)', () => {
    const missing = docs
      .filter((doc) => {
        const value = doc.frontmatter?.description;
        return typeof value !== 'string' || value.trim().length === 0;
      })
      .map((doc) => doc.slug);

    expect(missing).toEqual([]);
  });

  // ⚠️ The reason this vault was fixed (2026-08-01). 25 of 32 documents had no
  // `display_en`, so `/en/docs` and `/en/projects` rendered the Korean title while
  // the map rendered the translated name — **one node, a different language per
  // screen**. Per AGENTS.md: fill every locale the vault uses; filling one leaves
  // the raw title exposed to speakers of the other.
  it.each(['display_ko', 'display_en'])('모든 문서가 %s 를 갖는다 (로케일 전수)', (key) => {
    const missing = docs
      .filter((doc) => {
        const value = doc.frontmatter?.[key];
        return typeof value !== 'string' || value.trim().length === 0;
      })
      .map((doc) => doc.slug);

    expect(missing).toEqual([]);
  });

  // No path-shaped slugs (2026-08-01 decision, "a slug is a flat identifier") —
  // everything under a kind folder is flat, and location is carried by `path:`.
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

  // An ontology is a **graph**, not a tree. Teaching that requires real semantic
  // relations (relates) and dependencies — the dogfood vault has zero `relates`, so
  // it cannot serve as the example.
  it('dependencies[] 가 depends_on 엣지로, relates[] 가 related_to 엣지로 유도된다', () => {
    const dependsOn = derivation.edges.filter((e) => e.type === 'depends_on');
    const relatedTo = derivation.edges.filter((e) => e.type === 'related_to');
    expect(dependsOn.length).toBeGreaterThan(0);
    expect(relatedTo.length).toBeGreaterThan(0);
  });

  // Every relation ref the manifest states must point at a real node. Checking all
  // of them rather than pinning a pair catches the regression where a node is
  // deleted and its backlinks are not.
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
