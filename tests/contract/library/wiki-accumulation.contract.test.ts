import { describe, expect, it } from 'vitest';

import { buildWikiRetrievalIndex, type VaultDoc } from '@/entities/docs-vault';
import { createCompileExecutor } from '@/features/vault-agent/model/compile/compile-executor';
import { parseFrontmatter } from '@/shared/lib/vault-document/parse-frontmatter';

import { evaluateAccumulation } from '../../../scripts/lib/benchmark/wiki-accumulation-eval.mjs';
import { accumulationCases, distractors, negativeRetrieval } from '../../fixtures/wiki-accumulation-cases.mjs';

function indexFor(fixture: typeof accumulationCases[number]) {
  const pages = [...distractors, fixture.existing];
  const docs: VaultDoc[] = pages.map(({ slug, title, raw }) => ({ slug, path: `${slug}.md`, title,
    frontmatter: parseFrontmatter(raw).frontmatter, tags: [], headings: [], excerpt: '', linksOut: [], updatedAt: '', wordCount: 0 }));
  return buildWikiRetrievalIndex(docs, new Map(pages.map(({ slug, raw }) => [slug, raw])));
}

async function readWikiCompletely(
  execute: (call: { id: string; name: string; args: Record<string, unknown>; argsInvalid: boolean }) => Promise<{ isError?: boolean; content: string; summary: string }>,
  slug: string,
) {
  let cursor: number | undefined;
  for (;;) {
    const args = cursor === undefined ? { slug } : { slug, cursor };
    const result = await execute({ id: 'read-wiki', name: 'read_wiki_page', args, argsInvalid: false });
    expect(result.isError, result.content).toBe(false);
    const payload = JSON.parse(result.content) as { complete?: boolean; receipt?: unknown; nextCursor?: unknown };
    if (payload.complete === true) {
      expect(typeof payload.receipt).toBe('string');
      expect(payload.receipt).not.toBe('');
      return payload.receipt as string;
    }
    expect(typeof payload.nextCursor).toBe('number');
    expect(Number.isSafeInteger(payload.nextCursor)).toBe(true);
    expect(payload.nextCursor as number).toBeGreaterThanOrEqual(0);
    if (cursor !== undefined) expect(payload.nextCursor as number).toBeGreaterThan(cursor);
    cursor = payload.nextCursor as number;
  }
}

describe('wiki accumulation: independent source reads, retrieval, revision and omission scoring', () => {
  for (const fixture of accumulationCases) {
    it(`${fixture.id}: the oracle passes the production executor and the omission rubric catches damaged revisions`, async () => {
      const index = indexFor(fixture);
      const retrieval = index.search(fixture.target, fixture.sources[fixture.target as keyof typeof fixture.sources]!);
      const executor = createCompileExecutor({ model: 'fixture-oracle', now: () => new Date('2026-09-10T00:00:00Z'), pageCap: 3,
        wikiSlugs: [fixture.existing.slug], readExistingPage: async () => ({ text: fixture.existing.raw, mtime: 10 }), findRelatedPages: index.search,
        sourcePort: {
          sources: Object.entries(fixture.sources).map(([path, text]) => ({ path, name: path, format: 'md', bytes: text!.length })),
          readSourceBytes: async (path) => new TextEncoder().encode(fixture.sources[path as keyof typeof fixture.sources]!).buffer,
          hashSource: async () => 'a'.repeat(64),
        },
      });
      for (const path of Object.keys(fixture.sources)) await executor.execute({ id: path, name: 'read_source_text', args: { path }, argsInvalid: false });
      const receipt = await readWikiCompletely(executor.execute.bind(executor), fixture.existing.slug);
      const proposed = await executor.execute({ id: 'proposal', name: 'propose_wiki_page', argsInvalid: false, args: {
        slug: fixture.existing.slug, title: fixture.existing.title, summary: fixture.existing.title,
        ...fixture.oracle, not_in_sources: [], receipt,
      } });
      expect(proposed.isError, proposed.content).toBe(false);
      const page = executor.proposals()[0].page;
      const evaluate = (text: string, applied = true) => evaluateAccumulation(fixture, { candidates: retrieval.candidates, page: text, applied });
      expect(evaluate(page).failed).toEqual([]);
      expect(evaluate(page.replace(fixture.gold.note, '')).failed).toContain('humanNoteRetained');
      expect(evaluate(page.replaceAll(fixture.gold.prior.citation, '[[src:sources/wrong.md#p2]]')).failed).toContain('priorClaimWithCitation');
      expect(evaluate(page.replaceAll(fixture.gold.incoming.citation, fixture.gold.prior.citation)).failed).toContain('incomingClaimWithCitation');
      expect(evaluate(page.replace(/## Summary\n[\s\S]*?## Facts/, '## Summary\n\nThe most recently imported source wins.\n\n## Facts')).failed).toContain('summaryObligation');
      expect(evaluate('', false).failed).toHaveLength(6);
      expect(evaluate(fixture.existing.raw, false).failed).toHaveLength(6);
      expect(index.search(negativeRetrieval.path, negativeRetrieval.text).candidates).toEqual([]);
    });
  }
});
