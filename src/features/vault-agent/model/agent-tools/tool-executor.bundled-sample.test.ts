import { describe, expect, it } from 'vitest';

import type { VaultDoc } from '@/entities/docs-vault';
import dogfoodContent from '@/entities/docs-vault/data/content.json';
import dogfoodManifest from '@/entities/docs-vault/data/manifest.json';
import { buildMdEntry } from '@/entities/docs-vault/lib/local-manifest/md-entry';

import { wrapUntrusted } from './concept-evidence-pack';
import { createToolExecutor } from './tool-executor';
import type { VaultReadDoc, VaultReadPort } from './vault-read-port';

const content = dogfoodContent as Record<string, string>;
const conceptDocs = (dogfoodManifest as { docs: VaultDoc[] }).docs.filter(
  (doc) => typeof doc.frontmatter?.kind === 'string',
);

/** What the agent was handed before: the excerpt a local folder's build wrote on each document. */
function oldExcerpt(doc: VaultDoc): string {
  const entry = { relativePath: doc.path, kind: 'md', handle: {} as FileSystemFileHandle } as const;
  const built = buildMdEntry(entry, content[doc.slug], 1, (value: string) => value).doc;
  if (!built) throw new Error(`no document built for ${doc.path}`);
  return built.excerpt;
}

function samplePort(): VaultReadPort {
  const docs: VaultReadDoc[] = conceptDocs.map((doc) => ({
    slug: doc.slug,
    path: doc.path,
    title: doc.title,
    kind: String(doc.frontmatter.kind),
    frontmatter: doc.frontmatter,
    mtime: doc.mtime,
  }));
  return {
    nodes: docs.map((doc) => ({
      id: `${doc.kind}:${doc.slug}`,
      title: doc.title,
      kind: doc.kind,
      projectIds: [],
      evidenceIds: [doc.slug],
      hasOwnDocument: true,
      lastApprovedAt: new Date(0),
      lastApprovedBy: 'vault-frontmatter',
    })),
    edges: [],
    docs,
    readDocText: async (slug) => content[slug] ?? null,
  };
}

const PAGE = 5;
const call = (name: string, args: unknown) => ({ id: 't1', name, args, argsInvalid: false });

describe('the agent reads the excerpt from the text it reads, as the folder build did, on the bundled sample', () => {
  it('returns the old excerpt body for every concept of the sample in excerpt body mode', async () => {
    expect(conceptDocs.length).toBeGreaterThan(50);
    const execute = createToolExecutor(samplePort());
    for (const doc of conceptDocs) {
      const result = await execute(call('get_concept', { slug: doc.slug, body: 'excerpt' }));
      const payload = JSON.parse(result.content) as { body: string; bodyInfo: { returnedChars: number } };
      expect(payload.body, doc.slug).toBe(wrapUntrusted(oldExcerpt(doc)));
      expect(payload.bodyInfo.returnedChars, doc.slug).toBe(oldExcerpt(doc).length);
    }
  });

  it('returns the old summary for every row of a summary list', async () => {
    const execute = createToolExecutor(samplePort());
    const expected = new Map(conceptDocs.map((doc) => [doc.slug, wrapUntrusted(oldExcerpt(doc))]));
    const seen = new Set<string>();
    for (let offset = 0; offset < conceptDocs.length; offset += PAGE) {
      const result = await execute(call('list_concepts', { summary: true, limit: PAGE, offset }));
      const rows = (JSON.parse(result.content) as { rows: Array<{ slug: string; summary: string }> }).rows;
      for (const row of rows) {
        expect(row.summary, row.slug).toBe(expected.get(row.slug));
        seen.add(row.slug);
      }
    }
    expect(seen.size).toBe(conceptDocs.length);
  });
});
