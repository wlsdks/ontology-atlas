import { buildTopologyDeeplinkForDoc, type VaultDoc } from "@/entities/docs-vault";

/**
 * The library's own small graph — **what this folder's write-ups are made of**.
 *
 * It is not the map, and the separation is the point (`docs/DECISIONS.md`, 2026-09-06).
 * The map draws the ontology: nodes with a `kind:`, the graph a person curates. This
 * draws the two file kinds the map deliberately never shows — a raw source under
 * `sources/`, kept byte for byte, and a wiki page under `wiki/`, which has no `kind:` —
 * plus the concepts a page reaches into. So the two pictures answer different questions:
 * *what does this project mean* over there, *what was read to write that down* here.
 *
 * Three node kinds and two relations, and nothing else:
 *
 * | Node | Comes from | Why it is here |
 * |---|---|---|
 * | `source` | `manifest.sources` | every file in the folder, cited or not — an unattached dot **is** the fact that nobody has written it up |
 * | `page` | wiki pages | one write-up |
 * | `concept` | a page's `[[slug]]` that resolves to a doc carrying `kind:` | the reach from a write-up into the ontology |
 *
 * | Edge | Read from | Means |
 * |---|---|---|
 * | `cites` | the page's `sources:` frontmatter | this write-up was made from that file |
 * | `mentions` | the page's body wikilinks | this write-up names that concept |
 *
 * **An unresolved link is not drawn.** `[[src:sources/quarter-plan.pdf#p2]]` — the
 * citation form wiki pages use inside a bullet — resolves to no document, and neither
 * does a wikilink whose target was renamed away. Drawing those as nodes would put
 * addresses on a canvas of things, and a person cannot tell a typo from a plan by
 * looking at a dot. They fall out here, once, rather than being filtered by each caller.
 *
 * Everything in this file is pure and deterministic: the same folder gives the same
 * nodes in the same order, which is what lets the layout below be reproducible rather
 * than a new picture on every mount.
 */

export type LibraryGraphNodeKind = "source" | "page" | "concept";

/**
 * What the folder knows about a source, in the same words the list beside this canvas
 * uses (`SourceCompileState`). It is optional only so a caller that has not measured
 * anything can still draw the shape of the folder.
 */
export type LibraryGraphSourceState = "not-compiled" | "compiled" | "stale" | "checking";

export interface LibraryGraphNode {
  /** `source:<path>` · `page:<slug>` · `concept:<slug>`. Stable across renders. */
  id: string;
  kind: LibraryGraphNodeKind;
  /**
   * Sources only: whether anybody has written this file up, and whether that write-up
   * still matches the bytes. The canvas draws it, because the list two inches to the left
   * says it and a picture that disagreed with the list would be the worse of the two.
   */
  state?: LibraryGraphSourceState;
  /** What a person sees in the hover label — a file name or a document title. */
  label: string;
  /** The vault address: a source's path, or a document's slug. */
  ref: string;
  /**
   * Where a click goes. Sources and pages are selected **in place** on this screen, so
   * they carry none; a concept lives on the map, so it carries the map's own deeplink —
   * or null when its kind has no map node (`buildTopologyDeeplinkForDoc`).
   */
  href: string | null;
}

export interface LibraryGraphEdge {
  id: string;
  /** Always a page: both relations start at the write-up. */
  source: string;
  target: string;
  relation: "cites" | "mentions";
  /**
   * **Whether this line may still be believed.**
   *
   * A `cites` edge asserts "this write-up was made from that file". When the source is
   * `stale` — the page recorded a hash the bytes no longer match, or recorded none — that
   * assertion is exactly what the folder denies, and drawing it as a confident line put
   * the canvas at odds with the list beside it (design-infoviz, 2026-09-06). `checking`
   * is unverified for the same reason: nothing has measured it yet.
   *
   * A `mentions` edge is read out of the page's own body, so there is nothing to go
   * stale: it is always `current`.
   */
  certainty: "current" | "unverified";
}

/**
 * The write-ups this graph is built from — structurally what `LibraryWikiPage` already
 * is, named here so the derivation depends on the three fields it reads rather than on
 * the library model's whole row.
 */
/**
 * A source as this canvas needs it: where it is, and what the folder has judged about it.
 * `LibrarySourceRow` satisfies it structurally, which is what the Library passes.
 */
export interface LibraryGraphSource {
  path: string;
  state?: LibraryGraphSourceState;
}

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

/** The last path segment, so `sources/quarter-plan.pdf` reads as `quarter-plan.pdf`. */
function tail(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function buildLibraryGraph({
  docs,
  wikiPages,
  sources,
}: {
  /** Every document in the manifest — the lookup that resolves a page's wikilinks. */
  docs: readonly VaultDoc[];
  wikiPages: readonly LibraryGraphPage[];
  sources: readonly LibraryGraphSource[] | undefined;
}): LibraryGraph {
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

  for (const page of wikiPages) {
    const from = pageId(page.slug);

    // ── cites: the frontmatter list, which is also what the compile state is judged on. ──
    for (const path of page.sourcePaths) {
      const to = sourceId(path);
      /*
       * A page may cite a path that is no longer in the folder — the file was moved or
       * deleted after it was written up. That is a real and interesting state, but it is
       * the source list's to report (it cannot: the row is gone), not a dot's: an edge to
       * a node that does not exist would draw a line into empty canvas. It is dropped
       * here for the same reason an unresolved wikilink is.
       */
      if (!seen.has(to)) continue;
      const id = `cites:${page.slug}→${path}`;
      if (drawn.has(id)) continue;
      drawn.add(id);
      edges.push({
        id,
        source: from,
        target: to,
        relation: "cites",
        certainty: sourceState.get(path) === "compiled" ? "current" : "unverified",
      });
    }

    // ── mentions: body wikilinks that land on a document carrying `kind:`. ──
    const doc = bySlug.get(page.slug);
    for (const target of doc?.linksOut ?? []) {
      const linked = bySlug.get(target);
      // A page linking another page is a real link, but it is not what this picture is
      // about, and page→page lines would out-number both relations that answer the
      // question. Concepts only.
      if (!linked || !isConcept(linked) || pages.has(target)) continue;
      const to = conceptId(target);
      push({
        id: to,
        kind: "concept",
        label: linked.title,
        ref: target,
        href: buildTopologyDeeplinkForDoc(linked),
      });
      const id = `mentions:${page.slug}→${target}`;
      if (drawn.has(id)) continue;
      drawn.add(id);
      edges.push({ id, source: from, target: to, relation: "mentions", certainty: "current" });
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
