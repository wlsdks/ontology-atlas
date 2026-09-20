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
  /**
   * Folders the round's vault place names, relative to the root. `[]` — the default — is the
   * whole folder, which is what every round written before 2026-09-21 means. A page counts
   * when its own file or any source it cites sits under one of them, so limiting a round to
   * `sources/planning` still judges the pages built on those documents wherever they live.
   */
  paths?: readonly string[];
  /** The vault place watches only files under `sources/` with no `source_url`. */
  ownDocumentsOnly?: boolean;
  /** Vault-relative source paths that carry a `source_url`, for `ownDocumentsOnly`. */
  fromService?: ReadonlySet<string>;
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

/** Is `path` the folder itself or inside it? `wiki/releases` never matches `wiki/releases-old`. */
function isUnder(path: string, folder: string): boolean {
  const clean = folder.replace(/\/+$/, '');
  return clean === '' || path === clean || path.startsWith(`${clean}/`);
}

export function runConsistencyPass({
  sources,
  docs,
  hashes,
  pageTexts,
  paths = [],
  ownDocumentsOnly = false,
  fromService,
}: ConsistencyPassInput): ConsistencyPassResult {
  const model = buildLibraryModel({ sources, docs, hashes });
  /*
   * **The filter is applied to the model, not to the hashing.** The hashes were measured for
   * whatever the caller asked for; deciding here which rows count keeps one rule in one place
   * and keeps a page that cites a watched document in the pass even when the page itself lives
   * elsewhere — the person said "watch these documents", not "watch these pages".
   */
  const inScope = (path: string) => {
    if (ownDocumentsOnly && fromService?.has(path)) return false;
    return paths.length === 0 || paths.some((folder) => isUnder(path, folder));
  };
  const watchedSources = new Set(model.sources.filter((row) => inScope(row.path)).map((row) => row.path));
  const watchedPages = new Set<string>();
  for (const row of model.sources) {
    if (!watchedSources.has(row.path)) continue;
    for (const slug of row.reviewPages ?? []) watchedPages.add(slug);
  }
  const pageInScope = (slug: string) =>
    paths.length === 0 && !ownDocumentsOnly ? true : watchedPages.has(slug) || paths.some((folder) => isUnder(slug, folder));

  const stalePages = new Set<string>();
  const staleSources: string[] = [];
  for (const row of model.sources) {
    const pages = row.reviewPages ?? [];
    if (row.state !== 'stale' || pages.length === 0 || !watchedSources.has(row.path)) continue;
    staleSources.push(row.path);
    for (const slug of pages) stalePages.add(slug);
  }
  const knownSources = sources.map((source) => source.path);
  const offTemplate: string[] = [];
  let checked = 0;
  for (const page of model.wikiPages) {
    if (isWikiFurnitureSlug(page.slug)) continue;
    if (!pageInScope(page.slug)) continue;
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
