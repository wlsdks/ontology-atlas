import type { VaultDoc, VaultManifest, VaultTreeNode } from "@/entities/docs-vault";
import { resolveLocaleDisplayName } from "@/shared/lib/locale-text/locale-display-name";
import { flattenDocs } from "./doc-tree";

export interface FlatDoc {
  slug: string;
  title: string;
  path: string;
  updatedAt: string;
  tags: string[];
  source?: VaultDoc;
}

export const MODIFIED_DOCS_LIMIT = 8;
const TOP_TAGS_LIMIT = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Every document in tree order, titled in the reader's language, with its manifest metadata. */
export function buildFlatDocs(manifest: VaultManifest, locale: string): FlatDoc[] {
  const metaBySlug = new Map(manifest.docs.map((doc) => [doc.slug, doc]));
  return flattenDocs(manifest.tree as VaultTreeNode)
    .filter((node) => node.type === "doc" && node.slug)
    .map((node) => {
      const meta = metaBySlug.get(node.slug as string);
      return {
        slug: node.slug as string,
        title: resolveLocaleDisplayName(meta?.frontmatter, locale, node.title ?? node.name),
        path: node.path,
        updatedAt: meta?.updatedAt ?? "",
        tags: meta?.tags ?? [],
        source: meta,
      } satisfies FlatDoc;
    });
}

/** Tag to slug sets for O(1) lookup; `manifest.tags` is readonly JSON. */
export function buildTagIndex(docs: readonly FlatDoc[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const doc of docs) {
    for (const tag of doc.tags) {
      const slugs = index.get(tag) ?? new Set<string>();
      slugs.add(doc.slug);
      index.set(tag, slugs);
    }
  }
  return index;
}

/** The most used tags first, ties broken alphabetically. */
export function rankTopTags(
  tagIndex: ReadonlyMap<string, ReadonlySet<string>>,
): { tag: string; count: number }[] {
  const counts: { tag: string; count: number }[] = [];
  tagIndex.forEach((slugs, tag) => counts.push({ tag, count: slugs.size }));
  counts.sort((a, b) => (b.count !== a.count ? b.count - a.count : a.tag.localeCompare(b.tag)));
  return counts.slice(0, TOP_TAGS_LIMIT);
}

/** The most recently modified documents; one without a modified date never ranks. */
export function latestModifiedDocs(docs: readonly FlatDoc[], limit = MODIFIED_DOCS_LIMIT): FlatDoc[] {
  return docs
    .filter((doc) => doc.updatedAt)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, limit);
}

/** The documents a saved slug list still names, in saved order; a slug the vault lost is dropped. */
export function docsForSlugs(slugs: readonly string[], docBySlug: ReadonlyMap<string, FlatDoc>): FlatDoc[] {
  return slugs.map((slug) => docBySlug.get(slug)).filter((doc): doc is FlatDoc => !!doc);
}

/** The slug one arrow step away, wrapping at both ends; no current slug starts from before the first. */
export function cycleSlug(slugs: readonly string[], current: string | null, step: 1 | -1): string {
  const currentIndex = current ? slugs.indexOf(current) : -1;
  return slugs[(currentIndex + step + slugs.length) % slugs.length];
}

export interface DocAge {
  key: "today" | "yesterday" | "daysAgo" | "monthsAgo" | "yearsAgo";
  values?: { count: number };
}

/** How long ago a document changed, as a copy key and count; empty without a date. */
export function describeDocAge(iso: string, nowMs = Date.now()): DocAge | null {
  if (!iso) return null;
  const elapsedMs = nowMs - new Date(iso).getTime();
  if (elapsedMs < DAY_MS) return { key: "today" };
  if (elapsedMs < 2 * DAY_MS) return { key: "yesterday" };
  const days = Math.floor(elapsedMs / DAY_MS);
  if (days < 30) return { key: "daysAgo", values: { count: days } };
  const months = Math.floor(days / 30);
  if (months < 12) return { key: "monthsAgo", values: { count: months } };
  return { key: "yearsAgo", values: { count: Math.floor(months / 12) } };
}
