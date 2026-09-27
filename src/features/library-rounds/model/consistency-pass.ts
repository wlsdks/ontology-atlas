import type { VaultDoc, VaultSourceFile } from '@/entities/docs-vault';
import { buildLibraryModel } from '@/entities/docs-vault';
import { isWikiFurnitureSlug, validateWikiPage } from '@/shared/lib/wiki-page-schema';

/** Does every page still match its sources? The Library's own verdicts, computed locally with no agent turn. */

export interface ConsistencyPassInput {
  sources: readonly VaultSourceFile[];
  docs: readonly VaultDoc[];
  /** sha256 by vault-relative source path, measured for this pass — not a cache. */
  hashes: ReadonlyMap<string, string>;
  /** Raw text by wiki slug (`wiki/<name>`), for the structural check. */
  pageTexts: ReadonlyMap<string, string>;
  /** Folders the vault place names; `[]` is the whole folder. A page counts when it or a cited source is under one. */
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
  /* The filter applies to the model, so a page citing a watched document counts wherever it lives. */
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
