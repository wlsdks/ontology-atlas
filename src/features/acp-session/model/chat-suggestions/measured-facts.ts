/** Counts the next steps read from frontmatter alone; each returns canonical slugs, sorted. */

interface FactDoc {
  slug: string;
  title?: string;
  frontmatter: Record<string, unknown>;
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

/** Capabilities that record neither a `depends_on` nor an `elements` relation. */
export function capabilitiesWithoutDependency(docs: readonly FactDoc[]): string[] {
  return docs
    .filter((doc) => kindOf(doc) === 'capability')
    .filter((doc) => !hasRefs(doc.frontmatter.depends_on) && !hasRefs(doc.frontmatter.elements))
    .map(canonicalSlug)
    .sort();
}

const CODE_EXTENSION = /\.(m?[jt]sx?|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|css|scss|json|ya?ml|toml|sh)$/i;
const CLASS_SUFFIX = /[a-z0-9](Service|Manager|Controller|Handler|Utils?)$/;
const CAMEL_CASE = /^[a-z]+[0-9]*(?:[A-Z][a-z0-9]+)+$/;
const SNAKE_CASE = /[A-Za-z0-9]_[A-Za-z0-9]/;

/**
 * A title a teammate would not say aloud: a path (the MCP `path-shaped-title` rule), a file name, or a
 * word in camelCase, snake_case or with a class suffix joined on.
 */
export function readsLikeCode(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return false;
  if (!/\s/.test(trimmed) && (/[/\\]/.test(trimmed) || CODE_EXTENSION.test(trimmed))) return true;
  return trimmed.split(/\s+/).some((word) => {
    const bare = word.replace(/^[("'`]+|[)"'`,.:;]+$/g, '');
    return CLASS_SUFFIX.test(bare) || CAMEL_CASE.test(bare) || SNAKE_CASE.test(bare);
  });
}

/** Domains, capabilities and elements whose `title` reads like code. */
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
