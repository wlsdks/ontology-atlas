/** Counts the next steps read from frontmatter alone; each returns canonical slugs, sorted. */

import type { NotMappedAreas } from '@/shared/lib/vault-document/not-mapped-areas';

interface FactDoc {
  slug: string;
  title?: string;
  frontmatter: Record<string, unknown>;
  citesReadLines?: boolean;
  notMappedAreas?: NotMappedAreas;
}

export interface UnreadCapability {
  slug: string;
  domain: string;
}

const NAMED_KINDS = new Set(['domain', 'capability', 'element']);

/** The slug an agent's MCP call accepts: the recorded `slug:`, else the address without a bundle root. */
export function canonicalSlug(doc: Pick<FactDoc, 'slug' | 'frontmatter'>): string {
  const recorded = doc.frontmatter.slug;
  if (typeof recorded === 'string' && recorded.trim()) return recorded.trim();
  return doc.slug.replace(/^ontology\//, '');
}

function kindOf(doc: FactDoc): string | null {
  const kind = doc.frontmatter.kind;
  return typeof kind === 'string' ? kind.trim() : null;
}

function hasRefs(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  return Array.isArray(value) && value.some((ref) => typeof ref === 'string' && ref.trim().length > 0);
}

export function capabilitiesWithoutDependency(docs: readonly FactDoc[]): string[] {
  return docs
    .filter((doc) => kindOf(doc) === 'capability')
    .filter((doc) => !hasRefs(doc.frontmatter.depends_on) && !hasRefs(doc.frontmatter.elements))
    .map(canonicalSlug)
    .sort();
}

/** Out of the capabilities whose body was measured; an unmeasured one counts in neither. */
export function capabilitiesWithoutReadRule(docs: readonly FactDoc[]): { unread: UnreadCapability[]; measured: number } {
  const measuredDocs = docs.filter((doc) => kindOf(doc) === 'capability' && typeof doc.citesReadLines === 'boolean');
  const unread = measuredDocs
    .filter((doc) => doc.citesReadLines === false)
    .map((doc) => ({
      slug: canonicalSlug(doc),
      domain: typeof doc.frontmatter.domain === 'string' ? doc.frontmatter.domain.trim() : '',
    }))
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return { unread, measured: measuredDocs.length };
}

/** The project with the most abilities not on the map yet; counts from several projects are never summed, since each names its own areas. */
export function widestUnmappedProject(docs: readonly FactDoc[]): NotMappedAreas | null {
  let widest: NotMappedAreas | null = null;
  for (const doc of docs) {
    const areas = doc.notMappedAreas;
    if (kindOf(doc) !== 'project' || !areas || areas.abilitiesUncovered === 0) continue;
    if (!widest || areas.abilitiesUncovered > widest.abilitiesUncovered) widest = areas;
  }
  return widest;
}

const CODE_EXTENSION = /\.(m?[jt]sx?|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|css|scss|json|ya?ml|toml|sh)$/i;
const CLASS_SUFFIX = /[a-z0-9](Service|Manager|Controller|Handler|Utils?)$/;
const CAMEL_CASE = /^[a-z]{2,}[0-9]*(?:[A-Z][a-z0-9]+)+$/;
const SNAKE_CASE = /[A-Za-z0-9]_[A-Za-z0-9]/;
/** Words people write that only look like code: `CI/CD`, `I/O`, `Node.js`. */
const ACRONYM_PAIR = /^[A-Z0-9&]+(?:\/[A-Z0-9&]+)+$/;
const DOTTED_PRODUCT = /^[A-Z][A-Za-z]*\.js$/;

/** A title a teammate would not say aloud: a path, a file name, or a camelCase/snake_case/class-suffix word; a title with a space is a phrase, and a phrase is not code. */
export function readsLikeCode(title: string): boolean {
  const word = title.trim();
  if (!word || /\s/.test(word)) return false;
  if (ACRONYM_PAIR.test(word) || DOTTED_PRODUCT.test(word)) return false;
  if (/[/\\]/.test(word) || CODE_EXTENSION.test(word)) return true;
  return CLASS_SUFFIX.test(word) || CAMEL_CASE.test(word) || SNAKE_CASE.test(word);
}

export function codeShapedTitles(docs: readonly FactDoc[]): string[] {
  return docs
    .filter((doc) => NAMED_KINDS.has(kindOf(doc) ?? ''))
    .filter((doc) => {
      const title = typeof doc.frontmatter.title === 'string' ? doc.frontmatter.title : doc.title;
      return typeof title === 'string' && readsLikeCode(title);
    })
    .map(canonicalSlug)
    .sort();
}
