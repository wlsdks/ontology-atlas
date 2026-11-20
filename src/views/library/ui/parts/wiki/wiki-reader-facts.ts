import { isWikiPage, type VaultDoc } from "@/entities/docs-vault";
import { buildWikiNodeIndex } from "@/shared/lib/library/wiki-page-schema";
import { resolveLocaleDisplayName } from "@/shared/lib/locale-text/locale-display-name";

/** What a link in the reader says instead of its slug: the target's title and, for a concept, its kind. */
export interface ReaderLinkTarget {
  title: string;
  /** The concept's `kind:`; `null` for a page. */
  kind: string | null;
}

function conceptKind(doc: VaultDoc): string | null {
  const kind = doc.frontmatter?.kind;
  return typeof kind === "string" && kind.trim() !== "" ? kind.trim() : null;
}

/**
 * Every document's title by NFC slug, from the listing already in memory. Concepts are named as the
 * map names them (`display_<locale>`, else `title`). Built once per listing, never per link.
 */
export function readerLinkTargets(docs: readonly VaultDoc[], locale: string): Map<string, ReaderLinkTarget> {
  const targets = new Map<string, ReaderLinkTarget>();
  for (const doc of docs) {
    const kind = conceptKind(doc);
    targets.set(doc.slug.normalize("NFC"), {
      title: kind ? resolveLocaleDisplayName(doc.frontmatter, locale, doc.title) : doc.title,
      kind,
    });
  }
  return targets;
}

const SHA256_HEX = /^[0-9a-f]{64}$/u;

/** The sha256 the page recorded for each source when it was written, by NFC path; any other value records nothing. */
export function recordedSourceHashes(frontmatter: Readonly<Record<string, unknown>>): Map<string, string> {
  const recorded = new Map<string, string>();
  const value = frontmatter.source_hash;
  if (!value || typeof value !== "object" || Array.isArray(value)) return recorded;
  for (const [path, hash] of Object.entries(value)) {
    const normal = typeof hash === "string" ? hash.trim().toLowerCase() : "";
    if (SHA256_HEX.test(normal)) recorded.set(path.normalize("NFC"), normal);
  }
  return recorded;
}

/** A change is observed only when the page recorded a hash and the bytes now hash to another. */
export function changedSinceWritten(recorded: string | null | undefined, current: string | null | undefined): boolean {
  return Boolean(recorded && current && recorded !== current.toLowerCase());
}

export interface FootSource {
  path: string;
  name: string;
  count: number;
  /** Whether the folder holds the file, so the row can open it. */
  present: boolean;
}

export interface FootLink {
  slug: string;
  title: string;
  kind: string | null;
}

export interface PageFoot {
  cited: FootSource[];
  linkedFrom: FootLink[];
  concepts: FootLink[];
}

const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title);

/**
 * Where the open page sits, from the listing alone: the pages whose links point here and the
 * concepts it names (`describes:` and body links to a document with `kind:`). Nothing is read.
 */
export function pageNeighbours(
  slug: string,
  docs: readonly VaultDoc[],
  targets: ReadonlyMap<string, ReaderLinkTarget>,
): Pick<PageFoot, "linkedFrom" | "concepts"> {
  const linkedFrom: FootLink[] = [];
  let self: VaultDoc | undefined;
  for (const doc of docs) {
    if (doc.slug === slug) {
      self = doc;
      continue;
    }
    if (isWikiPage(doc) && doc.linksOut.includes(slug)) linkedFrom.push({ slug: doc.slug, title: doc.title, kind: null });
  }
  const concepts = new Map<string, FootLink>();
  const take = (target: string) => {
    const found = targets.get(target.normalize("NFC"));
    if (found?.kind && target !== slug) concepts.set(target, { slug: target, title: found.title, kind: found.kind });
  };
  const describes = self?.frontmatter?.describes;
  if (Array.isArray(describes)) {
    const index = buildWikiNodeIndex(docs.map((doc) => ({ slug: doc.slug, kind: doc.frontmatter?.kind, alias: doc.frontmatter?.slug })));
    for (const entry of describes) {
      if (typeof entry !== "string") continue;
      const resolved = index.resolve(entry);
      if (typeof resolved === "object" && resolved.node) take(resolved.slug);
    }
  }
  for (const target of self?.linksOut ?? []) take(target);
  return { linkedFrom: linkedFrom.sort(byTitle), concepts: [...concepts.values()].sort(byTitle) };
}

/**
 * The cited sources in the order the page's frontmatter lists them, each with how many times the
 * body cites it; a path the body cites but the frontmatter omits follows, so none is hidden.
 */
export function citedSources(
  listed: readonly { path: string; name: string; state: unknown }[],
  counts: ReadonlyMap<string, number>,
  present: (path: string) => boolean,
): FootSource[] {
  const rows: FootSource[] = [];
  const seen = new Set<string>();
  for (const original of listed) {
    const key = original.path.normalize("NFC");
    seen.add(key);
    rows.push({ path: original.path, name: original.name, count: counts.get(key) ?? 0, present: original.state !== null });
  }
  for (const [path, count] of counts) {
    if (seen.has(path)) continue;
    rows.push({ path, name: path.split("/").pop() || path, count, present: present(path) });
  }
  return rows;
}
