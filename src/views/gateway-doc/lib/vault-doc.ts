import { resolveStaticVaultSource } from '@/entities/docs-vault';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';

/**
 * The gateway's reading pages render vault markdown verbatim: `docs/GUIDE.md` and
 * `docs/CHANGELOG.md` are reviewed in the repository, and a screen-only copy would drift.
 */

/**
 * Vault slug to raw markdown, or `null`. `'dogfood'` is pinned: the guide and changelog are this
 * product's documents, not the chosen sample's. The resolver is still used (importing the raw JSON
 * would break its contract); only the argument is fixed.
 */
export function readVaultDoc(slug: string): string | null {
  const { content, contentPreviews } = resolveStaticVaultSource('dogfood');
  const doc = content[slug];
  if (typeof doc === 'string') return withoutFrontmatter(doc);
  // A document not fully bundled (CHANGELOG) is read from its truncated preview; the folded count comes from `readVaultDocOmittedSections`.
  const preview = contentPreviews?.[slug];
  return typeof preview?.body === 'string' ? preview.body : null;
}

/** Frontmatter is metadata for the Library and `pnpm docs:meta`; the public site renders the body only. */
function withoutFrontmatter(raw: string): string {
  return raw.startsWith('---') ? parseFrontmatter(raw).body.replace(/^(\r?\n)+/, '') : raw;
}

/**
 * Sections already folded at bundle time in `readVaultDoc(slug)`'s body. `GatewayDocPage` adds its
 * own fold to this, or the bundle's truncation would go unstated.
 */
export function readVaultDocOmittedSections(slug: string): number {
  const { contentPreviews } = resolveStaticVaultSource('dogfood');
  return contentPreviews?.[slug]?.omittedSections ?? 0;
}

export interface TrimmedDoc {
  body: string;
  /** How many sections were cut. Zero means the full text. */
  omittedSections: number;
}

/**
 * Keeps only the first `limit` `## ` sections and counts the rest, so the screen can say where to
 * read them: the full CHANGELOG would be the heaviest screen in the product, and silent truncation
 * would claim completeness. The title and preamble always survive.
 */
export function trimToRecentSections(markdown: string, limit: number): TrimmedDoc {
  // Only a line-leading `## ` outside a code fence is a section boundary.
  const lines = markdown.split('\n');
  const boundaries: number[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    else if (!inFence && /^## (?!#)/.test(line)) boundaries.push(i);
  }

  if (boundaries.length <= limit) return { body: markdown, omittedSections: 0 };

  const cutAt = boundaries[limit]!;
  return {
    body: lines.slice(0, cutAt).join('\n').trimEnd(),
    omittedSections: boundaries.length - limit,
  };
}

const CATEGORY_LINE = /^\*\*(?:Added|Changed|Fixed|Removed)\*\*/;

/**
 * Gives every changelog category line its own paragraph: frozen entries put `**Added**:` and
 * `**Fixed**:` on consecutive lines, which Markdown folds into one. Fenced blocks are left alone.
 */
export function separateCategoryLines(markdown: string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const previous = out.at(-1);
    if (!inFence && CATEGORY_LINE.test(line) && previous !== undefined && previous.trim() !== '') {
      out.push('');
    }
    out.push(line);
  }
  return out.join('\n');
}

export interface DocEntry {
  /** Anchor id — shared by the sidebar link and the body heading. */
  id: string;
  /** The full original text after `## `, matched against the sidebar label. */
  heading: string;
  /** A leading `YYYY-MM-DD`, or `null`. */
  date: string | null;
  /** The remainder with the date and separator stripped; the heading verbatim when absent. */
  title: string;
}

/**
 * Extracts `## ` sections as table-of-contents entries and mints their ids in one place, so the
 * sidebar link and body heading always share the anchor. Repeated titles get `-2`, `-3`, or every
 * link would go to the first.
 */
export function extractEntries(markdown: string): DocEntry[] {
  const lines = markdown.split('\n');
  const out: DocEntry[] = [];
  const used = new Map<string, number>();
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(\`\`\`|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^## (?!#)(.+)$/.exec(line);
    if (!match) continue;

    const heading = match[1]!.trim();
    // The ledger writes `## YYYY-MM-DD · vX.Y.Z: …`, so the middle dot is a separator too.
    const dateMatch = /^(\d{4}-\d{2}-\d{2})\s*[—–·-]?\s*(.*)$/.exec(heading);
    const date = dateMatch ? dateMatch[1]! : null;
    const title = dateMatch && dateMatch[2] ? dateMatch[2]! : heading;

    const base = slugifyHeading(heading);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    out.push({ id: seen === 0 ? base : `${base}-${seen + 1}`, heading, date, title });
  }
  return out;
}

/**
 * A heading's matching key: inline markers stripped and whitespace collapsed, so the raw source
 * heading and the rendered `h2` text key the same anchor.
 */
export function normalizeHeadingKey(heading: string): string {
  return heading
    .replace(/[`*_~]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Markdown heading to anchor id. Korean is kept, or most headings would slug to an empty string. */
function slugifyHeading(heading: string): string {
  return (
    heading
      .toLowerCase()
      .replace(/[`*_~\[\]()]/g, '')
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'entry'
  );
}
