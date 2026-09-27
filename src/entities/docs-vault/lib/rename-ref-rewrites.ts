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
 * Rewrites a referrer's frontmatter graph refs and body links after a rename, like MCP
 * `redirectBacklinks`; links resolve like `extractOutLinksWithContext`, not by substring.
 */

const REF_ARRAY_KEYS = [
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  // `depends_on` and `broader` hold edges the map draws, so they are rewritten too.
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
  /** A bare tail is rewritten only while it uniquely names the renamed document. */
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

/** Mirrors the MCP rewrite rule for one ref. */
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

/** Whether a ref names `oldSlug` by the rules `rewriteRefValue` uses. */
function refNamesSlug(value: string, oldSlug: string, canRewriteTail: boolean): boolean {
  if (value === oldSlug) return true;
  if (!canRewriteTail) return false;
  const oldTail = tailOf(oldSlug);
  return value === oldTail || value.endsWith(`/${oldTail}`);
}

/** An entry a kind change moved from the list for the old kind to the list for the new one. */
export interface ReferrerListMove {
  /** The entry after the move, in the referrer's spelling. */
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
 * A kind change moves each naming entry into the list for the new kind when the referrer's kind
 * may keep it (spec §5, `containmentKeyFor`); otherwise the entry stays and is reported.
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
  // Lists are read once and carried, since a destination can receive from several sources.
  const working = (key: ContainmentKey): string[] =>
    lists.get(key) ?? [...new Set((stringList(frontmatter[key]) ?? []).map(rewrite))];

  for (const key of CONTAINMENT_KEYS) {
    const written = stringList(frontmatter[key]);
    if (!written) continue;
    const hits = [...new Set(written.filter(names).map(rewrite))];
    // Already in the new kind's list: the same-key pass changes the address.
    if (hits.length === 0 || destination === key) continue;
    // A destination that is not a list of names cannot be re-serialized, so it is reported.
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
 * The moved document at its new address. `slug:` follows only when it mirrored the old file slug,
 * as in MCP `rename_concept`; other values are aliases and are kept.
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
  /** Equal to `oldSlug` for a kind change without a move. */
  newSlug: string;
  /** Links resolve relative to the referrer's directory. */
  referrerSlug: string;
  canRewriteTail: boolean;
  /** Set only when the kind changes; entries then follow into the new kind's list. */
  newKind?: string;
}

export interface ReferrerRewritePlan {
  /** Unchanged when nothing names the document. */
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
      // No duplicate when the new ref is already present.
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
    // Rewriting re-serializes the map, so refuse when a value is not a plain primitive.
    const representable = entries.every(
      ([, value]) =>
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean',
    );
    if (representable) {
      let changed = false;
      const nextNotes: Record<string, string | number | boolean> = {};
      // A note already written under the new name wins (the MCP collision rule).
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
  // A kind change in place moves no address; re-resolving would only respell links.
  if (oldSlug === newSlug) return plan(next);

  /* Wikilinks resolve from the referrer, as in `extractOutLinksWithContext`, and are written back
   * in its vault-relative form; the bare tail keeps its uniqueness guard. */
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
  // Markdown links resolved against the referrer's directory.
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

/** A kind change's effect on one referrer's lists, previewed before Save. */
export interface KindChangeReferrer {
  slug: string;
  moved: ReferrerListMove[];
  kept: ReferrerListKept[];
}

/** Referrers whose lists a kind change moves or leaves, in folder order; address-only ones are omitted. */
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
