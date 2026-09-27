import { describe, expect, it } from 'vitest';
import { deriveOntologyFromVault } from './derive-ontology-from-vault';
import type { VaultDoc, VaultManifest } from '../model/types';

/**
 * Guards the full-derive cost on the live-update path (every vault change reruns it). jsdom
 * numbers differ from a browser, so the threshold is lenient.
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

/** One project, D domains, C capabilities per domain and E elements per capability, with cross edges. */
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
      // Dependencies and relates onto the neighbouring capability.
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
  it('derives a ~600-node vault within 2500ms', () => {
    const { manifest, docCount } = buildLargeManifest(10, 10, 5);
    expect(docCount).toBeGreaterThan(600);

    const t0 = performance.now();
    const result = deriveOntologyFromVault(manifest);
    const elapsed = performance.now() - t0;

    // Every ref resolves, so nodes ≥ docs; a missing ref only adds stubs.
    expect(result.nodes.length).toBeGreaterThanOrEqual(docCount);
    expect(result.edges.length).toBeGreaterThan(0);

    console.log(
      `[perf] deriveOntologyFromVault — ${docCount} docs → ${result.nodes.length} nodes / ${result.edges.length} edges in ${elapsed.toFixed(1)}ms`,
    );

    /*
     * measurement window: 7.6 ms for 611 docs (2026-09-12), so 2,500 ms is ~300x headroom; only a
     * quadratic regression reaches it (`.claude/rules/testing.md`, "The timing rule").
     */
    expect(elapsed).toBeLessThan(2500);
  });
});
