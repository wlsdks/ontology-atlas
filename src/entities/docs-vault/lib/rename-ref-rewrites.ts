import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import {
  CONTAINMENT_KEYS,
  containmentKeyFor,
  type ContainmentKey,
} from '@/shared/lib/containment-keys';
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

/** Does a written ref name `oldSlug` — the same matches `rewriteRefValue` rewrites? */
function refNamesSlug(value: string, oldSlug: string, canRewriteTail: boolean): boolean {
  if (value === oldSlug) return true;
  if (!canRewriteTail) return false;
  const oldTail = tailOf(oldSlug);
  return value === oldTail || value.endsWith(`/${oldTail}`);
}

/** An entry a kind change moved from the list for the old kind to the list for the new one. */
export interface ReferrerListMove {
  /** The entry as it is written after the move (the new address, in the referrer's spelling). */
  ref: string;
  from: ContainmentKey;
  to: ContainmentKey;
}

/**
 * An entry a kind change left where it was: the referrer's kind keeps no list for the new kind
 * (`containmentKeyFor` is null), or it is a `domain:` parent that is no longer a domain.
 */
export interface ReferrerListKept {
  ref: string;
  key: ContainmentKey | 'domain';
}

interface KindListPlan {
  lists: Map<ContainmentKey, string[]>;
  moved: ReferrerListMove[];
  kept: ReferrerListKept[];
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return null;
  return value.map((item) => item.trim());
}

/**
 * Where a kind change puts the entries of one referrer that name the moved document.
 *
 * **Why it exists** (2026-09-26, map-edit review). The same-key rewrite gave a reclassified
 * document's referrers its new address but kept every entry in the list for its OLD kind, so a
 * domain read `capabilities: [..., elements/companion-memories]`: an element in the capability
 * list, resolving, flagged by nothing. A list named for a kind says what its entries are, so an
 * entry follows its document into the list for the new kind — appended, never twice, every other
 * entry left in its order — when the referrer's kind may keep that list (spec §5, the same table
 * as `containmentKeyFor` in `mcp/src/schema.mjs`). When it may not, the entry keeps its list and
 * is reported, rather than guessed into another relation. A `domain:` parent that is no longer a
 * domain has no list to move to at all, so it is reported the same way.
 *
 * Reads frontmatter as parsed, so the folder preview (`planKindChangeReferrers`) and the write
 * (`planReferrerRewrite`) reach the same verdict from the same function.
 */
function planKindLists(
  frontmatter: Record<string, unknown>,
  args: { oldSlug: string; newSlug: string; canRewriteTail: boolean; newKind: string },
): KindListPlan {
  const { oldSlug, newSlug, canRewriteTail, newKind } = args;
  const names = (value: string) => refNamesSlug(value, oldSlug, canRewriteTail);
  const rewrite = (value: string) =>
    names(value) ? rewriteRefValue(value, oldSlug, newSlug, canRewriteTail) : value;
  const referrerKind = typeof frontmatter.kind === 'string' ? frontmatter.kind.trim() : '';
  const destination = containmentKeyFor(referrerKind, newKind);
  const lists = new Map<ContainmentKey, string[]>();
  const moved: ReferrerListMove[] = [];
  const kept: ReferrerListKept[] = [];
  // A list this plan rewrites, read once and then carried: the destination can receive entries
  // from more than one source list.
  const working = (key: ContainmentKey): string[] =>
    lists.get(key) ?? [...new Set((stringList(frontmatter[key]) ?? []).map(rewrite))];

  for (const key of CONTAINMENT_KEYS) {
    const written = stringList(frontmatter[key]);
    if (!written) continue;
    const hits = [...new Set(written.filter(names).map(rewrite))];
    // Already the list for its new kind: only the address changes, which the same-key pass does.
    if (hits.length === 0 || destination === key) continue;
    // A destination written as something other than a list of names cannot be re-serialized
    // without losing what it holds, so that case is reported like a missing list.
    const destinationReadable =
      destination !== null &&
      (frontmatter[destination] === undefined || stringList(frontmatter[destination]) !== null);
    if (!destination || !destinationReadable) {
      for (const ref of hits) kept.push({ ref, key });
      continue;
    }
    const target = working(destination);
    const targetNamedIt = (stringList(frontmatter[destination]) ?? []).some(names);
    lists.set(key, working(key).filter((value) => !hits.includes(value)));
    lists.set(destination, targetNamedIt ? target : [...target, ...hits.filter((ref) => !target.includes(ref))]);
    for (const ref of hits) moved.push({ ref, from: key, to: destination });
  }
  const parent = typeof frontmatter.domain === 'string' ? frontmatter.domain.trim() : '';
  if (parent && newKind !== 'domain' && names(parent)) kept.push({ ref: rewrite(parent), key: 'domain' });
  return { lists, moved, kept };
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

/**
 * The moved document's own bytes, as they are written at the new address.
 *
 * **Why it exists** (2026-09-26, map-edit QA). A rename rewrote every referrer byte for byte
 * and then copied the moved file verbatim, so the file living at
 * `capabilities/mcp-tool-server-renamed.md` still declared
 * `slug: capabilities/mcp-tool-server` — the one document in the folder whose `slug:`
 * disagreed with its own path.
 *
 * The rule is MCP `rename_concept`'s (`mcp/src/tools/lifecycle.mjs`): `slug:` follows the
 * move **only when it mirrors the old file slug**. A different value is a user-facing alias
 * that other documents reference by that spelling (the dogfood project carries
 * `slug: ontology-atlas`), and a document with no `slug:` gains none — its path is its
 * address. `updates` carries any other frontmatter change that belongs to the same move (a
 * reclassify changes `kind:` in the same bytes), so the new file is written once and never
 * exists in a half-moved state.
 */
export function rewriteMovedDocSelf(
  raw: string,
  args: {
    oldSlug: string;
    newSlug: string;
    updates?: Record<string, FrontmatterUpdateValue>;
  },
): string {
  const { frontmatter } = parseFrontmatter(raw);
  const updates: Record<string, FrontmatterUpdateValue> = { ...(args.updates ?? {}) };
  const declared = typeof frontmatter.slug === 'string' ? frontmatter.slug.trim() : null;
  if (declared === args.oldSlug) updates.slug = args.newSlug;
  return Object.keys(updates).length > 0 ? applyFrontmatterUpdates(raw, updates) : raw;
}

export interface ReferrerRewriteArgs {
  oldSlug: string;
  /** Equal to `oldSlug` when the document changes kind without moving. */
  newSlug: string;
  /** The referrer's own slug — markdown links resolve relative to its directory. */
  referrerSlug: string;
  canRewriteTail: boolean;
  /**
   * The document's kind after the move — passed **only when the move changes its kind**. Then
   * an entry in a list named for a kind follows the document into the list for the new kind
   * (`planKindLists`); a rename leaves every entry in the list it is in.
   */
  newKind?: string;
}

export interface ReferrerRewritePlan {
  /** The referrer's bytes after the rewrite (identical to the input when nothing names the doc). */
  text: string;
  moved: ReferrerListMove[];
  kept: ReferrerListKept[];
}

/** One referrer's rewrite — the bytes only. */
export function rewriteRenamedDocRefs(raw: string, args: ReferrerRewriteArgs): string {
  return planReferrerRewrite(raw, args).text;
}

/**
 * One referrer's rewrite, with what a kind change did to its lists — the fact the confirmation
 * names ("Human workbench now lists it among its elements").
 */
export function planReferrerRewrite(raw: string, args: ReferrerRewriteArgs): ReferrerRewritePlan {
  const { oldSlug, newSlug, referrerSlug, canRewriteTail, newKind } = args;
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
  // ── a kind change: entries follow the document into the list for its new kind ──
  const kindLists = newKind
    ? planKindLists(frontmatter, { oldSlug, newSlug, canRewriteTail, newKind })
    : null;
  for (const [key, list] of kindLists?.lists ?? []) updates[key] = list;
  let next = Object.keys(updates).length > 0 ? applyFrontmatterUpdates(raw, updates) : raw;
  const plan = (text: string): ReferrerRewritePlan => ({
    text,
    moved: kindLists?.moved ?? [],
    kept: kindLists?.kept ?? [],
  });
  // A kind change in place moves no address, and re-resolving a link that already points at
  // the document would only respell it (`./x.md` → `x.md`).
  if (oldSlug === newSlug) return plan(next);

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
  return plan(next);
}

/** What a kind change does to one referrer's lists — the preview row before Save. */
export interface KindChangeReferrer {
  slug: string;
  moved: ReferrerListMove[];
  kept: ReferrerListKept[];
}

/**
 * Every referrer whose lists a kind change moves or leaves behind, read from the folder as it is
 * — what the quick patch names before Save. The same `planKindLists` verdict the write applies,
 * over the manifest's parsed frontmatter; referrers that only get the new address are omitted
 * (the move hint already says every reference follows). In the folder's order.
 */
export function planKindChangeReferrers(
  docs: ReadonlyArray<{ slug: string; frontmatter?: Record<string, unknown> }>,
  args: { oldSlug: string; newSlug: string; newKind: string },
): KindChangeReferrer[] {
  const { canRewriteTail } = computeRenameRefContext(
    docs.map((doc) => doc.slug),
    args.oldSlug,
  );
  const referrers: KindChangeReferrer[] = [];
  for (const doc of docs) {
    if (doc.slug === args.oldSlug || !doc.frontmatter) continue;
    const { moved, kept } = planKindLists(doc.frontmatter, { ...args, canRewriteTail });
    if (moved.length > 0 || kept.length > 0) referrers.push({ slug: doc.slug, moved, kept });
  }
  return referrers;
}
