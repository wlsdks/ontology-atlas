import { describe, expect, it } from "vitest";
import type { VaultDoc, VaultManifest } from "@/entities/docs-vault";
import { buildSurfaceComposition, countPlanOnlyDomains, countWikiPages } from "./surface-composition";

const labels = {
  domains: "Domains",
  capabilities: "Capabilities",
  elements: "Elements",
  sources: "sources",
  wikiPages: "wiki pages",
  planOnlyDomains: (count: number) => `${count} domains hold no element yet`,
  relations: (count: number) => `${count} relations`,
  ontologyEmpty: "No domains or capabilities yet.",
  libraryEmpty: "This folder holds no sources and no wiki pages.",
  harnessHolds: "Instructions, structure and sensors.",
};
const hrefs = { ontology: "/topology/?p=x", library: "/library/", harness: "/architecture/" };
const doc = (slug: string): VaultDoc =>
  ({ slug, path: `${slug}.md`, title: slug, tags: [], frontmatter: {}, headings: [], excerpt: "", wordCount: 0, updatedAt: "", linksOut: [] }) as VaultDoc;
const manifest = (sources: number): VaultManifest =>
  ({ version: "1", generatedAt: "", docs: [], backlinksDetail: {}, tags: {}, tree: { name: "v", path: "", type: "dir" },
     sources: Array.from({ length: sources }, (_, i) => ({ path: `sources/${i}.pdf` })) }) as unknown as VaultManifest;
const domain = (capabilityCount: number, elementCount: number) =>
  ({ id: `d${capabilityCount}${elementCount}`, title: "d", capabilityCount, elementCount, total: capabilityCount + elementCount, capabilities: [] });

describe("countWikiPages", () => {
  it("counts only the folder's wiki documents", () => {
    expect(countWikiPages([doc("wiki/a"), doc("wiki/b"), doc("domains/order"), doc("wikipedia")])).toBe(2);
  });
});

describe("countPlanOnlyDomains", () => {
  it("counts domains that name a capability and hold no element", () => {
    expect(countPlanOnlyDomains([domain(3, 0), domain(2, 5), domain(0, 0)])).toBe(1);
  });
});

describe("buildSurfaceComposition", () => {
  const metrics = { domains: 8, capabilities: 34, elements: 64, documents: 0, relations: 157 };

  it("gives the ontology cell this project's figures and says how connected it is", () => {
    const [ontology] = buildSurfaceComposition({
      metrics, domains: [domain(3, 0), domain(2, 5)], manifest: manifest(0), docs: [], labels, hrefs,
    });
    expect(ontology.figures).toEqual([
      { label: "Domains", value: 8 },
      { label: "Capabilities", value: 34 },
      { label: "Elements", value: 64 },
    ]);
    expect(ontology.note).toBe("157 relations · 1 domains hold no element yet");
    expect(ontology.href).toBe("/topology/?p=x");
  });

  it("leaves the thin-spot clause out when every domain holds an element", () => {
    const [ontology] = buildSurfaceComposition({
      metrics, domains: [domain(2, 5)], manifest: manifest(0), docs: [], labels, hrefs,
    });
    expect(ontology.note).toBe("157 relations");
  });

  it("counts the folder's sources and wiki pages for the Library cell", () => {
    const [, library] = buildSurfaceComposition({
      metrics, domains: [], manifest: manifest(12), docs: [doc("wiki/a")], labels, hrefs,
    });
    expect(library.figures).toEqual([
      { label: "sources", value: 12 },
      { label: "wiki pages", value: 1 },
    ]);
    expect(library.note).toBeNull();
  });

  it("says a folder with neither holds neither, rather than drawing two zeroes", () => {
    const [, library] = buildSurfaceComposition({
      metrics, domains: [], manifest: manifest(0), docs: [], labels, hrefs,
    });
    expect(library.figures).toEqual([]);
    expect(library.note).toBe("This folder holds no sources and no wiki pages.");
  });

  it("gives the harness cell no figure, because it cannot count from here", () => {
    const [, , harness] = buildSurfaceComposition({
      metrics, domains: [], manifest: manifest(3), docs: [], labels, hrefs,
    });
    expect(harness.figures).toEqual([]);
    expect(harness.note).toBe("Instructions, structure and sensors.");
    expect(harness.href).toBe("/architecture/");
  });

  it("an empty ontology says so instead of showing three zeroes", () => {
    const [ontology] = buildSurfaceComposition({
      metrics: { domains: 0, capabilities: 0, elements: 0, documents: 0, relations: 0 },
      domains: [], manifest: manifest(0), docs: [], labels, hrefs,
    });
    expect(ontology.figures).toEqual([]);
    expect(ontology.note).toBe("No domains or capabilities yet.");
  });
});
