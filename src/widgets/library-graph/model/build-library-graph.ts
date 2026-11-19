import { buildTopologyDeeplinkForDoc, type VaultDoc } from "@/entities/docs-vault";
import { buildWikiNodeIndex } from "@/shared/lib/library/wiki-page-schema";
import { resolveLocaleDisplayName } from "@/shared/lib/locale-text/locale-display-name";

/**
 * The library's own graph: what this folder's write-ups are made of. It is not the map
 * (`docs/DECISIONS.md`, "The Library gets its own small graph, separate from the map"): it
 * draws the files the map never shows, raw `sources/` and `wiki/` pages, plus the concepts
 * (`kind:` docs) a page reaches into or that link a page back.
 *
 * | Node | Comes from | Why it is here |
 * |---|---|---|
 * | `source` | `manifest.sources` | every file, cited or not; an unattached dot is the fact that nobody wrote it up |
 * | `page` | wiki pages | one write-up |
 * | `concept` | a page's `describes:` entry or `[[slug]]` resolving to a `kind:` doc, or a `kind:` doc linking a page | the reach between write-up and ontology |
 *
 * | Edge | Read from | Means |
 * |---|---|---|
 * | `cites` | the page's `sources:` frontmatter | this write-up was made from that file |
 * | `describes` | the page's `describes:` frontmatter, resolved as `validate_wiki` resolves it | this write-up is about that concept |
 * | `mentions` | page body wikilinks, and a concept's body `[[wiki/…]]` links | one names the other |
 *
 * One pair of marks carries one line: a page that is about a concept and also names it draws
 * only `describes`, the stronger claim. An unresolved link (a `[[src:…]]` citation, a
 * renamed-away target, a `describes:` entry naming no concept) is dropped here, once, because a
 * dot cannot tell a typo from a plan. Pure and deterministic, so the layout is reproducible:
 * O(sources + docs·depth + pages + citations + links) with Map/Set lookups, where depth is a
 * slug's folder depth, walked once to resolve `describes:` tails.
 */

export type LibraryGraphNodeKind = "source" | "page" | "concept";

export type LibraryGraphRelation = "cites" | "describes" | "mentions";

/** A source's state in the words of the list beside the canvas (`SourceCompileState`). */
export type LibraryGraphSourceState =
  | "not-compiled"
  | "compiled"
  | "partial"
  | "stale"
  | "checking"
  | "unreadable";

export interface LibraryGraphNode {
  /** `source:<path>` · `page:<slug>` · `concept:<slug>`. Stable across renders. */
  id: string;
  kind: LibraryGraphNodeKind;
  /** Sources only; optional so a caller that measured nothing can still draw the folder. */
  state?: LibraryGraphSourceState;
  /** What a person sees in the hover label — a file name or a document title. */
  label: string;
  /** The vault address: a source's path, or a document's slug. */
  ref: string;
  /**
   * A concept's map deeplink, or null when its kind has no map node; sources and pages
   * are selected in place and carry none.
   */
  href: string | null;
}

export interface LibraryGraphEdge {
  id: string;
  /** The write-up, except a `mentions` edge read from a concept's body, which starts at the concept. */
  source: string;
  target: string;
  relation: LibraryGraphRelation;
  /**
   * Whether this line may still be believed. A `cites` edge to a source the folder does not
   * vouch for (stale, checking, not compiled) is `unverified`, or the canvas contradicts the
   * list beside it. A `describes` or `mentions` edge resolved to a concept, so it is `current`.
   */
  certainty: "current" | "unverified";
}

/** `LibrarySourceRow` satisfies this structurally. */
export interface LibraryGraphSource {
  path: string;
  state?: LibraryGraphSourceState;
}

/** The three fields of `LibraryWikiPage` the derivation reads. */
export interface LibraryGraphPage {
  slug: string;
  title: string;
  /** Vault-relative paths from the page's `sources:` frontmatter, in its own order. */
  sourcePaths: readonly string[];
}

export interface LibraryGraph {
  nodes: LibraryGraphNode[];
  edges: LibraryGraphEdge[];
  counts: {
    sources: number;
    pages: number;
    concepts: number;
    /** The two relations counted apart: one number could not say whether the dash matters. */
    cites: number;
    mentions: number;
  };
}

const sourceId = (path: string): string => `source:${path}`;
const pageId = (slug: string): string => `page:${slug}`;
const conceptId = (slug: string): string => `concept:${slug}`;

/** A doc is a concept when it carries a non-empty `kind:` — the same test the map uses. */
function isConcept(doc: VaultDoc): boolean {
  const kind = doc.frontmatter?.kind;
  return typeof kind === "string" && kind.trim() !== "";
}

/** A `describes:` list's entries; a scalar is `bad-describes` to the schema and draws nothing. */
function describesOf(doc: VaultDoc | undefined): string[] {
  const value = doc?.frontmatter?.describes;
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/** The last path segment, so `sources/quarter-plan.pdf` reads as `quarter-plan.pdf`. */
function tail(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function buildLibraryGraph({
  docs,
  wikiPages,
  sources,
  locale,
}: {
  /** Every document in the manifest — the lookup that resolves a page's wikilinks. */
  docs: readonly VaultDoc[];
  wikiPages: readonly LibraryGraphPage[];
  sources: readonly LibraryGraphSource[] | undefined;
  /** Concepts are named as the map names them: `display_<locale>`, else `title`. */
  locale?: string;
}): LibraryGraph {
  const conceptLabel = (doc: VaultDoc): string =>
    resolveLocaleDisplayName(doc.frontmatter, locale, doc.title);
  const nodes: LibraryGraphNode[] = [];
  const edges: LibraryGraphEdge[] = [];
  const seen = new Set<string>();
  const drawn = new Set<string>();

  const push = (node: LibraryGraphNode): void => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    nodes.push(node);
  };

  const sourceState = new Map<string, LibraryGraphSourceState | undefined>();
  for (const source of sources ?? []) {
    sourceState.set(source.path, source.state);
    push({
      id: sourceId(source.path),
      kind: "source",
      state: source.state,
      label: tail(source.path),
      ref: source.path,
      href: null,
    });
  }

  const bySlug = new Map<string, VaultDoc>();
  for (const doc of docs) bySlug.set(doc.slug, doc);

  const pages = new Set(wikiPages.map((page) => page.slug));
  for (const page of wikiPages) {
    push({ id: pageId(page.slug), kind: "page", label: page.title, ref: page.slug, href: null });
  }

  const pushConcept = (doc: VaultDoc): string => {
    const id = conceptId(doc.slug);
    push({ id, kind: "concept", label: conceptLabel(doc), ref: doc.slug, href: buildTopologyDeeplinkForDoc(doc) });
    return id;
  };
  // Built only when some page says what it is about: most folders have no `describes:` yet.
  let nodeIndex: ReturnType<typeof buildWikiNodeIndex> | null = null;
  // The index answers in NFC; a slug read from disk may still be NFD, so the doc is found by NFC.
  const byNfcSlug = new Map<string, VaultDoc>();
  const resolveConcept = (entry: string): VaultDoc | null => {
    if (!nodeIndex) {
      for (const doc of docs) byNfcSlug.set(doc.slug.normalize("NFC"), doc);
      nodeIndex = buildWikiNodeIndex(
        docs.map((doc) => ({ slug: doc.slug, kind: doc.frontmatter?.kind, alias: doc.frontmatter?.slug })),
      );
    }
    const resolved = nodeIndex.resolve(entry);
    if (typeof resolved !== "object" || !resolved.node) return null;
    return byNfcSlug.get(resolved.slug) ?? null;
  };
  /** `page|concept` pairs a `describes` line already joins, so no `mentions` line doubles it. */
  const about = new Set<string>();

  for (const page of wikiPages) {
    const from = pageId(page.slug);

    // cites: the frontmatter list, which is also what the compile state is judged on.
    for (const path of page.sourcePaths) {
      const to = sourceId(path);
      // A cited path no longer in the folder is dropped, or the line runs into empty canvas.
      if (!seen.has(to)) continue;
      const id = `cites:${page.slug}→${path}`;
      if (drawn.has(id)) continue;
      drawn.add(id);
      edges.push({
        id,
        source: from,
        target: to,
        relation: "cites",
        // `partial` is believed: the hash still matches; only coverage stops short.
        certainty:
          sourceState.get(path) === "compiled" || sourceState.get(path) === "partial"
            ? "current"
            : "unverified",
      });
    }

    // describes: in the page's own order, so the first entry leads (the island it joins).
    const doc = bySlug.get(page.slug);
    for (const entry of describesOf(doc)) {
      const concept = resolveConcept(entry);
      if (!concept || pages.has(concept.slug)) continue;
      const to = pushConcept(concept);
      const pair = `${page.slug}|${concept.slug}`;
      if (about.has(pair)) continue;
      about.add(pair);
      edges.push({ id: `describes:${page.slug}→${concept.slug}`, source: from, target: to, relation: "describes", certainty: "current" });
    }

    // mentions: body wikilinks that land on a document carrying `kind:`.
    for (const target of doc?.linksOut ?? []) {
      const linked = bySlug.get(target);
      // Concepts only: page→page lines would out-number both relations this picture is about.
      if (!linked || !isConcept(linked) || pages.has(target)) continue;
      const to = pushConcept(linked);
      if (about.has(`${page.slug}|${target}`)) continue;
      const id = `mentions:${page.slug}→${target}`;
      if (drawn.has(id)) continue;
      drawn.add(id);
      edges.push({ id, source: from, target: to, relation: "mentions", certainty: "current" });
    }
  }

  // mentions, the other way: a node the wiki proposed cites its pages as `[[wiki/…]]`,
  // or the bridge the Library made is invisible on its own picture.
  for (const doc of docs) {
    if (!isConcept(doc) || pages.has(doc.slug)) continue;
    for (const target of doc.linksOut) {
      if (!pages.has(target)) continue;
      const from = pushConcept(doc);
      if (about.has(`${target}|${doc.slug}`)) continue;
      const id = `mentions:${doc.slug}→${target}`;
      if (drawn.has(id)) continue;
      drawn.add(id);
      edges.push({ id, source: from, target: pageId(target), relation: "mentions", certainty: "current" });
    }
  }

  return {
    nodes,
    edges,
    counts: {
      sources: nodes.filter((node) => node.kind === "source").length,
      pages: nodes.filter((node) => node.kind === "page").length,
      concepts: nodes.filter((node) => node.kind === "concept").length,
      cites: edges.filter((edge) => edge.relation === "cites").length,
      mentions: edges.filter((edge) => edge.relation === "mentions").length,
    },
  };
}
