import { describe, expect, it } from 'vitest';
import { deriveOntologyFromVault } from './derive-ontology-from-vault';
import type { VaultDoc, VaultManifest } from '../model/types';

/**
 * Performance regression guard for the live-update hot path.
 *
 * `deriveOntologyFromVault` re-runs in **full** every time the vault changes
 * (agent edit → watcher → refresh) so the topology can be redrawn. How long it
 * takes on a large vault decides whether watching the map live stutters.
 *
 * This pins the baseline for the *full rebuild* cost. Making it incremental is the
 * work this measurement exists to judge.
 *
 * jsdom absolute numbers differ from a real browser but are adequate for detecting
 * regression; the threshold is lenient to absorb environment noise.
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
 * project 1 + D domains + C capabilities per domain + E elements per capability.
 * Capabilities carry domain / elements / dependencies / relates frontmatter so the
 * edge build (and stub creation) is realistically exercised.
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
      // Dependency and relates onto the neighbouring capability — exercises cross edges.
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

    // Sanity that derivation actually built a graph. With every ref resolving to a real
    // doc, node count equals doc count (no extra stubs); a missing ref makes it larger.
    expect(result.nodes.length).toBeGreaterThanOrEqual(docCount);
    expect(result.edges.length).toBeGreaterThan(0);

    console.log(
      `[perf] deriveOntologyFromVault — ${docCount} docs → ${result.nodes.length} nodes / ${result.edges.length} edges in ${elapsed.toFixed(1)}ms`,
    );

    // Lenient absolute threshold to absorb jsdom noise. Breaking this line means a
    // regression in the derive hot path.
    expect(elapsed).toBeLessThan(2500);
  });
});
