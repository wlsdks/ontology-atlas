import type { CoverageAreaInput, CoverageCapability } from '@/entities/agent-files';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';

/**
 * **The rows of the coverage matrix come from the vault, and only from the vault.**
 *
 * A domain is on screen because a person defined it and approved it, and each of its capabilities
 * carries one canonical repo-relative `path` — the implementation entrypoint. Those two facts are
 * what let an empty cell say "this area does X and no check names it" instead of "a file is
 * absent", which is the sentence no file-only scanner can write.
 *
 * **A capability with no `path` is dropped from the join and kept nowhere else.** It cannot be
 * reached by a path scope, so counting it would make an area look uncovered for a reason that is
 * about the vault's own completeness rather than about the harness. The screen says how many were
 * left out instead of quietly folding them in.
 */

/** The two vault fields this derivation needs, written out so the view model does not import a doc type it does not use. */
export interface CoverageVaultDoc {
  slug: string;
  title: string;
  description?: string;
  excerpt: string;
  frontmatter: Record<string, unknown>;
}

export interface CoverageAreasResult {
  areas: CoverageAreaInput[];
  /** Every capability path the vault records — what the scan resolves its scopes against. */
  capabilityPaths: string[];
  /** Capabilities whose vault record names no implementation path. */
  pathlessCapabilities: number;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The area's purpose, in the vault's own words: the `description` key when a person wrote one,
 * otherwise the opening of the document body. Never generated, never paraphrased — the cell shows
 * what the vault says, and the reader judges the gap against it.
 */
function purposeOf(doc: CoverageVaultDoc): string {
  return text(doc.description) || text(doc.excerpt);
}

/**
 * `locale` is not optional decoration: the row names are the reader's entry into the matrix, and
 * measured in the installed Korean app before this argument existed, all eight read "AI Agent
 * Integration", "Codebase Architecture" and their siblings in English under a Korean screen. The
 * vault already carries `display_ko` / `display_en`; the canonical `title` stays the search name.
 */
export function deriveCoverageAreas(
  docs: readonly CoverageVaultDoc[],
  locale?: string,
): CoverageAreasResult {
  const capabilitiesByDomain = new Map<string, CoverageCapability[]>();
  const capabilityPaths: string[] = [];
  let pathlessCapabilities = 0;

  for (const doc of docs) {
    if (doc.frontmatter.kind !== 'capability') continue;
    const domain = text(doc.frontmatter.domain);
    const path = text(doc.frontmatter.path);
    if (!path) {
      pathlessCapabilities += 1;
      continue;
    }
    if (!domain) continue;
    capabilityPaths.push(path);
    const list = capabilitiesByDomain.get(domain) ?? [];
    list.push({
      slug: text(doc.frontmatter.slug) || doc.slug,
      title: resolveLocaleDisplayName(doc.frontmatter, locale, doc.title),
      path,
    });
    capabilitiesByDomain.set(domain, list);
  }

  const areas: CoverageAreaInput[] = [];
  for (const doc of docs) {
    if (doc.frontmatter.kind !== 'domain') continue;
    const slug = text(doc.frontmatter.slug) || doc.slug;
    areas.push({
      slug,
      title: resolveLocaleDisplayName(doc.frontmatter, locale, doc.title),
      purpose: purposeOf(doc),
      capabilities: (capabilitiesByDomain.get(slug) ?? []).sort((a, b) =>
        a.title.localeCompare(b.title),
      ),
    });
  }
  areas.sort((a, b) => a.title.localeCompare(b.title));

  return { areas, capabilityPaths, pathlessCapabilities };
}
