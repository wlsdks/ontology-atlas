import { describe, expect, it } from "vitest";

import type { VaultDoc } from "@/entities/docs-vault";

import {
  buildLibraryGraph,
  type LibraryGraphPage,
  type LibraryGraphSourceState,
} from "./build-library-graph";

function doc(partial: Partial<VaultDoc> & { slug: string }): VaultDoc {
  return {
    slug: partial.slug,
    path: `${partial.slug}.md`,
    title: partial.title ?? partial.slug,
    tags: [],
    frontmatter: partial.frontmatter ?? {},
    headings: [],
    excerpt: "",
    wordCount: 0,
    updatedAt: "2026-09-06T00:00:00.000Z",
    linksOut: partial.linksOut ?? [],
  };
}

function source(path: string, state: LibraryGraphSourceState = "compiled") {
  return { path, state };
}

function page(slug: string, sourcePaths: string[] = []): LibraryGraphPage {
  return { slug, title: slug.split("/").pop() ?? slug, sourcePaths };
}

const CHECKOUT = doc({
  slug: "domains/checkout",
  title: "Checkout",
  frontmatter: { kind: "domain" },
});

describe("the library graph", () => {
  it("draws every source, cited or not — an unattached dot is the fact that nobody wrote it up", () => {
    const graph = buildLibraryGraph({
      docs: [doc({ slug: "wiki/plan" })],
      wikiPages: [page("wiki/plan", ["sources/plan.pdf"])],
      sources: [source("sources/plan.pdf"), source("sources/budget.xlsx")],
    });
    expect(graph.counts.sources).toBe(2);
    expect(graph.edges.filter((edge) => edge.relation === "cites")).toHaveLength(1);
    const orphan = graph.nodes.find((node) => node.ref === "sources/budget.xlsx");
    expect(orphan?.kind).toBe("source");
    expect(graph.edges.some((edge) => edge.target === orphan?.id)).toBe(false);
  });

  it("connects a page to the concept it names and carries the map's own deeplink", () => {
    const graph = buildLibraryGraph({
      docs: [doc({ slug: "wiki/plan", linksOut: ["domains/checkout"] }), CHECKOUT],
      wikiPages: [page("wiki/plan")],
      sources: [],
    });
    const concept = graph.nodes.find((node) => node.kind === "concept");
    expect(concept?.ref).toBe("domains/checkout");
    expect(concept?.label).toBe("Checkout");
    expect(concept?.href).toContain("/topology");
    expect(graph.edges).toEqual([
      expect.objectContaining({ relation: "mentions", source: "page:wiki/plan", target: concept?.id }),
    ]);
  });

  it("does not draw a link that resolves to nothing — a citation marker is not a node", () => {
    const graph = buildLibraryGraph({
      docs: [
        doc({
          slug: "wiki/plan",
          // What a compiled page's bullets actually contain, beside a renamed-away target.
          linksOut: ["src:sources/plan.pdf", "domains/deleted"],
        }),
      ],
      wikiPages: [page("wiki/plan")],
      sources: [],
    });
    expect(graph.counts.concepts).toBe(0);
    expect(graph.edges).toHaveLength(0);
  });

  it("keeps a page's link to another page out: this picture is pages, files and concepts", () => {
    const graph = buildLibraryGraph({
      docs: [doc({ slug: "wiki/plan", linksOut: ["wiki/handover"] }), doc({ slug: "wiki/handover" })],
      wikiPages: [page("wiki/plan"), page("wiki/handover")],
      sources: [],
    });
    expect(graph.counts.pages).toBe(2);
    expect(graph.edges).toHaveLength(0);
  });

  it("drops a citation whose file has left the folder rather than drawing a line into nothing", () => {
    const graph = buildLibraryGraph({
      docs: [doc({ slug: "wiki/plan" })],
      wikiPages: [page("wiki/plan", ["sources/moved-away.pdf"])],
      sources: [source("sources/plan.pdf")],
    });
    expect(graph.edges).toHaveLength(0);
    expect(graph.nodes.some((node) => node.ref === "sources/moved-away.pdf")).toBe(false);
  });

  it("marks a citation unverified when the folder says the source moved on", () => {
    const graph = buildLibraryGraph({
      docs: [doc({ slug: "wiki/plan" }), doc({ slug: "wiki/other" })],
      wikiPages: [page("wiki/plan", ["sources/stale.pdf"]), page("wiki/other", ["sources/ok.pdf"])],
      sources: [source("sources/stale.pdf", "stale"), source("sources/ok.pdf", "compiled")],
    });
    const stale = graph.edges.find((edge) => edge.target === "source:sources/stale.pdf");
    const current = graph.edges.find((edge) => edge.target === "source:sources/ok.pdf");
    expect(stale?.certainty).toBe("unverified");
    expect(current?.certainty).toBe("current");
    // The dot carries the same word the list beside the canvas prints.
    expect(graph.nodes.find((node) => node.ref === "sources/stale.pdf")?.state).toBe("stale");
  });

  it("counts one concept once when two pages name it, and one edge per page", () => {
    const graph = buildLibraryGraph({
      docs: [
        doc({ slug: "wiki/a", linksOut: ["domains/checkout"] }),
        doc({ slug: "wiki/b", linksOut: ["domains/checkout"] }),
        CHECKOUT,
      ],
      wikiPages: [page("wiki/a"), page("wiki/b")],
      sources: [],
    });
    expect(graph.counts.concepts).toBe(1);
    expect(graph.counts.mentions).toBe(2);
  });

  it("is deterministic and stable in node order — the same folder is the same picture", () => {
    const input = {
      docs: [doc({ slug: "wiki/plan", linksOut: ["domains/checkout"] }), CHECKOUT],
      wikiPages: [page("wiki/plan", ["sources/plan.pdf"])],
      sources: [source("sources/plan.pdf")],
    };
    expect(buildLibraryGraph(input)).toEqual(buildLibraryGraph(input));
  });

  it("counts nothing, and refuses to invent nodes, for an empty folder", () => {
    const graph = buildLibraryGraph({ docs: [], wikiPages: [], sources: undefined });
    expect(graph.nodes).toHaveLength(0);
    expect(graph.counts).toEqual({ sources: 0, pages: 0, concepts: 0, cites: 0, mentions: 0 });
  });
});
