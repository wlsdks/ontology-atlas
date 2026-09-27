import { describe, expect, it } from 'vitest';
import { deriveOntologyFromVault } from './derive-ontology-from-vault';
import sampleStorefrontManifestRaw from '../data/sample-storefront.manifest.json';
import type { VaultDoc, VaultManifest } from '../model/types';

// The default sample (`samples/storefront/`) is what every visitor without a vault sees.
// Expectations derive from the manifest, never pinned counts (precedent: `tests/e2e/map-smoke.spec.ts`).

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
 * Architecture profiles have no `kind:` and are not graph documents (`docs/ARCHITECTURE.md`),
 * so graph checks exclude exactly the files carrying `architecture_schema`.
 */
const isArchitectureProfile = (doc: VaultDoc): boolean =>
  doc.frontmatter?.architecture_schema === 'architecture-profile/v1';

describe('sample storefront vault — connected business graph', () => {
  const derivation = deriveOntologyFromVault(sampleStorefrontManifest);
  const docs = sampleStorefrontManifest.docs.filter((doc) => !isArchitectureProfile(doc));

  it('derives every vault document as a kind node', () => {
    const expectedKindCounts: Record<string, number> = {};
    for (const doc of docs) {
      const kind = kindOf(doc);
      if (!kind) continue;
      expectedKindCounts[kind] = (expectedKindCounts[kind] ?? 0) + 1;
    }

    expect(derivation.sourceConceptCount).toBe(docs.length);
    expect(derivation.sourceKindCounts).toEqual(expectedKindCounts);
  });

  it('has no unknown-kind nodes', () => {
    const unknownNodes = derivation.nodes.filter((n) => n.kind === 'unknown');
    expect(unknownNodes.map((n) => n.id)).toEqual([]);
  });

  it('keeps the project, domain, capability, element chain unbroken', () => {
    const nodeIds = new Set(derivation.nodes.map((n) => n.id));
    // Undirected adjacency: only connectedness matters, not edge type.
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

  // An empty description key would contradict the detail page for a newcomer's first project.
  it('gives every document a frontmatter description', () => {
    const missing = docs
      .filter((doc) => {
        const value = doc.frontmatter?.description;
        return typeof value !== 'string' || value.trim().length === 0;
      })
      .map((doc) => doc.slug);

    expect(missing).toEqual([]);
  });

  // Every locale the vault uses must be filled, or one screen shows a raw title (AGENTS.md).
  it.each(['display_ko', 'display_en'])('gives every document %s', (key) => {
    const missing = docs
      .filter((doc) => {
        const value = doc.frontmatter?.[key];
        return typeof value !== 'string' || value.trim().length === 0;
      })
      .map((doc) => doc.slug);

    expect(missing).toEqual([]);
  });

  // A slug is a flat identifier; location is carried by `path:`.
  it('keeps slugs flat under their kind folder', () => {
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

  // The sample must teach a graph, so it needs real `relates` and dependency edges.
  it('derives depends_on from dependencies[] and related_to from relates[]', () => {
    const dependsOn = derivation.edges.filter((e) => e.type === 'depends_on');
    const relatedTo = derivation.edges.filter((e) => e.type === 'related_to');
    expect(dependsOn.length).toBeGreaterThan(0);
    expect(relatedTo.length).toBeGreaterThan(0);
  });

  // Checks every ref, so a deleted node with surviving backlinks fails.
  it('points every dependencies and relates ref at a real node', () => {
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
