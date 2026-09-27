import type { CoverageAreaInput, CoverageCapability } from '@/entities/agent-files';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';

/**
 * Coverage matrix rows come only from the vault's domains and their capabilities' `path`. The
 * screen must not claim "reviewed": few nodes carry approval keys. Pathless capabilities are
 * counted as left out, never folded in.
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

/** The vault's own words for the area, never generated or paraphrased. */
function purposeOf(doc: CoverageVaultDoc): string {
  return text(doc.description) || text(doc.excerpt);
}

/** Row names follow `locale` through `display_<locale>`; `title` stays the search name. */
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
