import type { VaultDoc, VaultSourceFile } from '@/entities/docs-vault';
import { buildLibraryModel } from '@/entities/docs-vault';
import { isWikiFurnitureSlug, validateWikiPage } from '@/shared/lib/wiki-page-schema';

/**
 * **A consistency pass** — does every page still match its sources? Computed here, on this
 * machine, from bytes and frontmatter. No agent turn.
 *
 * The verdicts are the ones the Library already draws: `buildLibraryModel` derives a source's
 * state from the pages that cite it and the hash measured now, and `validateWikiPage` is the
 * same judge the Wiki list and `wiki-validate` run. This pass adds nothing to those rules; it
 * runs them at a time nobody pressed and turns the result into one ledger line.
 */

export interface ConsistencyPassInput {
  sources: readonly VaultSourceFile[];
  docs: readonly VaultDoc[];
  /** sha256 by vault-relative source path, measured for this pass — not a cache. */
  hashes: ReadonlyMap<string, string>;
  /** Raw text by wiki slug (`wiki/<name>`), for the structural check. */
  pageTexts: ReadonlyMap<string, string>;
}

export interface ConsistencyPassResult {
  /** Pages the pass judged: every wiki page that is not furniture. */
  checked: number;
  /** Wiki slugs whose source bytes no longer match the hash they recorded. */
  stalePages: string[];
  /** Vault-relative source paths behind those pages — what a redraft compiles. */
  staleSources: string[];
  /** Wiki slugs whose text fails the page contract. */
  offTemplate: string[];
  /** Sources nobody has written up. Reported, never acted on by a round. */
  notCompiled: number;
}

export function runConsistencyPass({ sources, docs, hashes, pageTexts }: ConsistencyPassInput): ConsistencyPassResult {
  const model = buildLibraryModel({ sources, docs, hashes });
  const stalePages = new Set<string>();
  const staleSources: string[] = [];
  for (const row of model.sources) {
    const pages = row.reviewPages ?? [];
    if (row.state !== 'stale' || pages.length === 0) continue;
    staleSources.push(row.path);
    for (const slug of pages) stalePages.add(slug);
  }
  const knownSources = sources.map((source) => source.path);
  const offTemplate: string[] = [];
  let checked = 0;
  for (const page of model.wikiPages) {
    if (isWikiFurnitureSlug(page.slug)) continue;
    checked += 1;
    const raw = pageTexts.get(page.slug);
    if (raw === undefined) continue;
    if (!validateWikiPage(raw, { knownSources }).ok) offTemplate.push(page.slug);
  }
  return {
    checked,
    stalePages: [...stalePages].sort(),
    staleSources: staleSources.sort(),
    offTemplate: offTemplate.sort(),
    notCompiled: model.notCompiledCount,
  };
}
