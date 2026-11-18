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
     * 2,500 ms is generous headroom over the real run time; only a quadratic regression reaches it
     * (`.claude/rules/testing.md`, "The timing rule").
     */
    expect(elapsed).toBeLessThan(2500);
  });
});

describe('deriveOntologyFromVault — one edited document at 50,000', () => {
  it('re-derives an edited body or title at under a twentieth of a full derivation', () => {
    const { manifest, docCount } = buildLargeManifest(50, 100, 9);
    expect(docCount).toBeGreaterThan(50_000);

    let start = performance.now();
    deriveOntologyFromVault(manifest);
    const fullMs = performance.now() - start;

    // An editor save: same relations, new title and summary, so a new VaultDoc in the same place.
    const at = 1234;
    const docs = manifest.docs.slice();
    docs[at] = { ...docs[at], title: 'Edited title', definitionPreview: 'Edited summary.' };
    start = performance.now();
    const edited = deriveOntologyFromVault({ ...manifest, docs });
    const editMs = performance.now() - start;

    expect(edited.nodes.find((node) => node.sourceSlug === docs[at].slug)?.title).toBe('Edited title');
    console.log(
      `[perf] deriveOntologyFromVault — ${docCount} docs: full ${fullMs.toFixed(1)} ms, one edited document ${editMs.toFixed(2)} ms`,
    );
    // Measured 2026-11-19: full ~550 ms, edit ~0.3 ms; a ratio holds across machines.
    expect(editMs * 20).toBeLessThan(fullMs);
  });
});
