import { describe, expect, it } from 'vitest';
import { deriveOntologyFromVault } from './derive-ontology-from-vault';
import type { VaultDoc, VaultManifest } from '../model/vault-manifest';

/**
 * Guards the derive cost on the live-update path (every vault change reruns it) by counting the
 * document fields it reads: a pass that rescans the documents multiplies that count, while a wall
 * clock also moves with machine load.
 */

const reads = { count: 0 };

/** The document, with every field read counted in `reads`. */
function counted(doc: VaultDoc): VaultDoc {
  return new Proxy(doc, {
    get(target, key, receiver) {
      reads.count += 1;
      return Reflect.get(target, key, receiver);
    },
  });
}

function readsOf(run: () => void): number {
  reads.count = 0;
  run();
  return reads.count;
}

function makeDoc(slug: string, frontmatter: Record<string, unknown>): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title: slug.split('/').pop() ?? slug,
    description: undefined,
    tags: [],
    frontmatter,
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
      docs: docs.map(counted),
      backlinkSources: {},
      tags: {},
      tree: { name: 'root', path: '', type: 'dir' },
    },
    docCount: docs.length,
  };
}

describe('deriveOntologyFromVault — document reads', () => {
  it('reads each document a bounded number of times, so twice the vault costs at most 2.2 times the reads', () => {
    const small = buildLargeManifest(10, 10, 5);
    const large = buildLargeManifest(20, 10, 5);
    expect(large.docCount).toBeGreaterThan(small.docCount * 1.9);

    const smallReads = readsOf(() => deriveOntologyFromVault(small.manifest));
    let result: ReturnType<typeof deriveOntologyFromVault> | undefined;
    const largeReads = readsOf(() => { result = deriveOntologyFromVault(large.manifest); });

    // Every ref resolves, so nodes ≥ docs; a missing ref only adds stubs.
    expect(result?.nodes.length).toBeGreaterThanOrEqual(large.docCount);
    expect(result?.edges.length).toBeGreaterThan(0);
    // Measured 2026-11-23: about 12 reads a document, 7,410 at 611 documents and 14,810 at 1,221.
    expect(largeReads).toBeLessThanOrEqual(1.1 * smallReads * (large.docCount / small.docCount));
  });
});

describe('deriveOntologyFromVault — one edited document at 50,000', () => {
  it('re-derives an edited body or title without reading the unchanged documents', () => {
    const { manifest, docCount } = buildLargeManifest(50, 100, 9);
    expect(docCount).toBeGreaterThan(50_000);

    const fullReads = readsOf(() => deriveOntologyFromVault(manifest));

    // An editor save: same relations, new title and summary, so a new VaultDoc in the same place.
    const at = 1234;
    const docs = manifest.docs.slice();
    docs[at] = { ...docs[at], title: 'Edited title', definitionPreview: 'Edited summary.' };
    let edited: ReturnType<typeof deriveOntologyFromVault> | undefined;
    const editReads = readsOf(() => { edited = deriveOntologyFromVault({ ...manifest, docs }); });

    expect(edited?.nodes.find((node) => node.sourceSlug === docs[at].slug)?.title).toBe('Edited title');
    expect(fullReads).toBeGreaterThan(docCount);
    // Measured 2026-11-23: 2 reads, both on the replaced document; a full pass reads 605,510.
    expect(editReads).toBeLessThanOrEqual(8);
  });
});
