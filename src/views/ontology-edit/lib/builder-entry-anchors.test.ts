import { describe, expect, it } from "vitest";
import type { VaultDoc, VaultManifest } from "@/entities/docs-vault";
import { buildBuilderEntryAnchors } from "./builder-entry-anchors";

function doc(slug: string, kind: string, title = slug, frontmatter = {}): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title,
    tags: [],
    frontmatter: { slug, kind, title, ...frontmatter },
    headings: [],
    excerpt: "",
    wordCount: 0,
    updatedAt: "2026-05-28T00:00:00.000Z",
    linksOut: [],
  };
}

function manifest(docs: VaultDoc[]): VaultManifest {
  return {
    version: "1",
    generatedAt: "2026-05-28T00:00:00.000Z",
    docs,
    backlinksDetail: {},
    tags: {},
    tree: { name: "root", path: "", type: "dir", children: [] },
  };
}

describe("buildBuilderEntryAnchors", () => {
  it("keeps the project first, then picks high-degree saved graph anchors", () => {
    const anchors = buildBuilderEntryAnchors(
      manifest([
        doc("project:atlas", "project", "Atlas", {
          domains: ["domains/views", "domains/core"],
        }),
        doc("domains/views", "domain", "Views", {
          capabilities: ["capabilities/builder", "capabilities/topology"],
          relates: ["domains/core"],
        }),
        doc("domains/core", "domain", "Core", {
          capabilities: ["capabilities/schema"],
        }),
        doc("capabilities/builder", "capability", "Builder", {
          domain: "domains/views",
          elements: ["elements/canvas", "elements/inspector"],
          relates: ["capabilities/topology"],
        }),
        doc("capabilities/topology", "capability", "Topology", {
          domain: "domains/views",
          elements: ["elements/canvas"],
        }),
        doc("capabilities/schema", "capability", "Schema", {
          domain: "domains/core",
        }),
        doc("elements/canvas", "element", "Canvas", {
          domain: "domains/views",
          relates: ["elements/inspector"],
        }),
        doc("elements/inspector", "element", "Inspector", {
          domain: "domains/views",
        }),
        doc("notes/release", "document", "Release note", {
          describes: ["capabilities/builder"],
        }),
      ]),
      4,
    );

    expect(anchors.map((anchor) => anchor.id)).toEqual([
      "project:atlas",
      "domains/views",
      "capabilities/builder",
      "elements/canvas",
    ]);
    expect(anchors.map((anchor) => anchor.degree)).toEqual([2, 8, 5, 4]);
  });

  it("returns no anchors when the manifest has no ontology nodes", () => {
    expect(buildBuilderEntryAnchors(manifest([]))).toEqual([]);
  });
});
