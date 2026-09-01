import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import {
  applyFrontmatterUpdates,
  type FrontmatterUpdateValue,
} from './frontmatter-updates';

/**
 * Rewrites one referrer document's references after a rename — frontmatter
 * graph refs AND body links.
 *
 * **Why it exists** (bug sweep 2026-09-01). The web rename rewrote only body
 * `[[wikilink]]` / `](x.md)` forms, while the primary graph of this product
 * lives in frontmatter relation keys (`dependencies:`, `capabilities:`, …).
 * Renaming a node in the web UI therefore orphaned every frontmatter relation
 * to it: backlinks vanished and the graph minted a phantom stub under the old
 * name — unlike MCP `rename_concept`, which rewrites the same key family. The
 * key set and the tail-rewrite rule mirror `mcp/src/vault.mjs`
 * `redirectBacklinks` (NEIGHBOR_KEYS + `domain` + `relation_notes`; a bare or
 * suffixed tail is rewritten only while it uniquely resolves).
 *
 * Markdown links are re-resolved with the same rules as
 * `extractOutLinksWithContext` (relative to the referrer's directory, `./` and
 * `..` honored) instead of substring-matched — the old regex demanded the full
 * slug inside the parentheses, so a same-directory relative link (`](foo.md)`)
 * was detected as a referrer but silently left dangling.
 */

const REF_ARRAY_KEYS = [
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  // `depends_on` is the schema's authoring alias for `dependencies`, and
  // `broader` (is-a) is written by this web UI itself — omitting them here
  // orphaned exactly the edges the map renders (2026-09-01 review): the MCP
  // rewrite iterates every frontmatter key and never had the gap.
  'depends_on',
  'broader',
  'relates',
  'contains',
  'describes',
] as const;
const REF_STRING_KEYS = ['domain'] as const;

function tailOf(slug: string): string {
  return slug.split('/').pop() ?? slug;
}

function dirOf(slug: string): string {
  return slug.includes('/') ? slug.slice(0, slug.lastIndexOf('/')) : '';
}

export interface RenameRefContext {
  /**
   * A bare/suffixed tail may be rewritten only while it uniquely resolves to
   * the renamed document. When two docs share the tail, rewriting "foo" would
   * silently redirect whichever concept the author meant.
   */
  canRewriteTail: boolean;
}

export function computeRenameRefContext(
  allSlugs: readonly string[],
  oldSlug: string,
): RenameRefContext {
  const oldTail = tailOf(oldSlug);
  const tailMatches = allSlugs.filter((slug) => tailOf(slug) === oldTail);
  return { canRewriteTail: tailMatches.length === 1 && tailMatches[0] === oldSlug };
}

/** Mirror of the MCP rewrite rule for one frontmatter ref string. */
function rewriteRefValue(
  value: string,
  oldSlug: string,
  newSlug: string,
  canRewriteTail: boolean,
): string {
  const oldTail = tailOf(oldSlug);
  const newTail = tailOf(newSlug);
  if (value === oldSlug) return newSlug;
  if (canRewriteTail && value === oldTail) return newTail;
  if (canRewriteTail && value.endsWith(`/${oldTail}`)) {
    return `${value.slice(0, value.length - oldTail.length)}${newTail}`;
  }
  return value;
}

/** Relative markdown target from the referrer's directory to `toSlug`. */
function relativeMdTarget(referrerSlug: string, toSlug: string): string {
  const fromDir = dirOf(referrerSlug).split('/').filter(Boolean);
  const toParts = toSlug.split('/');
  let common = 0;
  while (
    common < fromDir.length &&
    common < toParts.length - 1 &&
    fromDir[common] === toParts[common]
  ) {
    common += 1;
  }
  const ups = fromDir.length - common;
  return [...Array<string>(ups).fill('..'), ...toParts.slice(common)].join('/') + '.md';
}

/** Resolve one markdown-link target the way `extractOutLinksWithContext` does. */
function resolveMdTarget(target: string, referrerSlug: string): string {
  const rel = target.replace(/^\.\//, '');
  const fromDir = dirOf(referrerSlug);
  const joined = fromDir ? `${fromDir}/${rel}` : rel;
  const stack: string[] = [];
  for (const part of joined.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join('/').replace(/\.md$/, '');
}

export function rewriteRenamedDocRefs(
  raw: string,
  args: {
    oldSlug: string;
    newSlug: string;
    /** The referrer's own slug — markdown links resolve relative to its directory. */
    referrerSlug: string;
    canRewriteTail: boolean;
  },
): string {
  const { oldSlug, newSlug, referrerSlug, canRewriteTail } = args;
  const oldTail = tailOf(oldSlug);
  const newTail = tailOf(newSlug);

  // ── frontmatter graph refs ──────────────────────────────────────────
  const { frontmatter } = parseFrontmatter(raw);
  const updates: Record<string, FrontmatterUpdateValue> = {};
  for (const key of REF_ARRAY_KEYS) {
    const value = frontmatter[key];
    if (!Array.isArray(value)) continue;
    let changed = false;
    const next = value.map((item) => {
      if (typeof item !== 'string') return item;
      const rewritten = rewriteRefValue(item.trim(), oldSlug, newSlug, canRewriteTail);
      if (rewritten !== item.trim()) changed = true;
      return rewritten;
    });
    if (changed && next.every((item): item is string => typeof item === 'string')) {
      // Never append a duplicate when the new ref is already present.
      updates[key] = [...new Set(next)];
    }
  }
  for (const key of REF_STRING_KEYS) {
    const value = frontmatter[key];
    if (typeof value !== 'string') continue;
    const rewritten = rewriteRefValue(value.trim(), oldSlug, newSlug, canRewriteTail);
    if (rewritten !== value.trim()) updates[key] = rewritten;
  }
  const notes = frontmatter.relation_notes;
  if (notes && typeof notes === 'object' && !Array.isArray(notes)) {
    const entries = Object.entries(notes as Record<string, unknown>);
    // Rewriting re-serializes the whole map, so refuse when any value is not a
    // plain primitive — dropping an entry we cannot represent would be silent loss.
    const representable = entries.every(
      ([, value]) =>
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean',
    );
    if (representable) {
      let changed = false;
      const nextNotes: Record<string, string | number | boolean> = {};
      // Untouched keys first: a note the user already wrote under the new name
      // wins over the displaced old value (same collision rule as the MCP rewrite).
      for (const [key, value] of entries) {
        if (rewriteRefValue(key, oldSlug, newSlug, canRewriteTail) === key) {
          nextNotes[key] = value as string | number | boolean;
        }
      }
      for (const [key, value] of entries) {
        const rewritten = rewriteRefValue(key, oldSlug, newSlug, canRewriteTail);
        if (rewritten === key) continue;
        changed = true;
        if (!(rewritten in nextNotes)) {
          nextNotes[rewritten] = value as string | number | boolean;
        }
      }
      if (changed) updates.relation_notes = nextNotes;
    }
  }
  let next = Object.keys(updates).length > 0 ? applyFrontmatterUpdates(raw, updates) : raw;

  // ── body links, on the (possibly frontmatter-updated) text ──────────
  /*
   * Wikilinks resolve the way `extractOutLinksWithContext` resolves them, not
   * by raw substring (2026-09-01 review): inside the nested ontology/ vault a
   * `[[capabilities/y]]` means `ontology/capabilities/y`, so matching the raw
   * written form both missed the nested link that pointed at the renamed doc
   * AND rewrote a nested link that pointed at a different root-level doc of
   * the same name. Each target is resolved from the referrer, compared against
   * the renamed slug, and written back in the referrer's own vault-relative
   * form. The bare-tail shorthand keeps its unique-resolution guard.
   */
  next = next.replace(
    /(\[\[)([^\]|#]+)((?:[|#][^\]]*)?\]\])/g,
    (whole, open: string, target: string, rest: string) => {
      const written = target.trim();
      if (canRewriteTail && oldTail !== oldSlug && written === oldTail) {
        return `${open}${newTail}${rest}`;
      }
      const nested = referrerSlug.startsWith('ontology/') && !written.startsWith('ontology/');
      const resolved = nested ? `ontology/${written}` : written;
      if (resolved !== oldSlug) return whole;
      const writtenNext =
        nested && newSlug.startsWith('ontology/') ? newSlug.slice('ontology/'.length) : newSlug;
      return `${open}${writtenNext}${rest}`;
    },
  );
  // Markdown links: re-resolve each target against the referrer's directory and
  // replace the ones that resolve to the renamed document.
  next = next.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (whole, text: string, target: string) => {
    if (!target || target.startsWith('#') || /^https?:\/\//i.test(target)) return whole;
    if (!target.endsWith('.md') && !target.includes('.md#')) return whole;
    const [mdPart, anchor] = target.split('#');
    if (resolveMdTarget(mdPart, referrerSlug) !== oldSlug) return whole;
    const rewritten = relativeMdTarget(referrerSlug, newSlug);
    return `[${text}](${rewritten}${anchor ? `#${anchor}` : ''})`;
  });
  return next;
}
