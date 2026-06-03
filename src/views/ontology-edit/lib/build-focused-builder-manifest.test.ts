import { describe, expect, it } from "vitest";
import type { VaultDoc, VaultManifest } from "@/entities/docs-vault";
import { buildFocusedBuilderManifest } from "./build-focused-builder-manifest";

function doc(
  slug: string,
  kind: string,
  title = slug,
  frontmatter: Record<string, unknown> = {},
): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title,
    tags: [],
    frontmatter: { kind, title, ...frontmatter },
    headings: [],
    excerpt: "",
    wordCount: 0,
    updatedAt: "2026-06-03T00:00:00.000Z",
    linksOut: [],
  };
}

function manifest(docs: VaultDoc[]): VaultManifest {
  return {
    version: "1",
    generatedAt: "2026-06-03T00:00:00.000Z",
    docs,
    backlinksDetail: {},
    tags: {},
    tree: { name: "root", path: "", type: "dir", children: [] },
  };
}

describe("buildFocusedBuilderManifest", () => {
  it("falls back to the first project and keeps only its direct relation neighborhood", () => {
    const focused = buildFocusedBuilderManifest(
      manifest([
        doc("ontology/project", "project", "Project", {
          domains: ["ontology/domains/views"],
        }),
        doc("ontology/domains/views", "domain", "Views", {
          capabilities: ["ontology/capabilities/builder"],
        }),
        doc("ontology/capabilities/builder", "capability", "Builder"),
        doc("ontology/domains/agent", "domain", "Agent"),
      ]),
      null,
    );

    expect(focused.focusSlug).toBe("ontology/project");
    expect(focused.isFocused).toBe(true);
    expect(focused.manifest.docs.map((item) => item.slug)).toEqual([
      "ontology/project",
      "ontology/domains/views",
    ]);
  });

  it("includes direct outgoing and incoming relation refs for the requested focus", () => {
    const focused = buildFocusedBuilderManifest(
      manifest([
        doc("ontology/project", "project", "Project", {
          domains: ["ontology/domains/views"],
        }),
        doc("ontology/domains/views", "domain", "Views", {
          capabilities: ["ontology/capabilities/builder"],
        }),
        doc("ontology/capabilities/builder", "capability", "Builder", {
          elements: ["ontology/elements/canvas"],
          relates: ["ontology/capabilities/topology"],
        }),
        doc("ontology/capabilities/topology", "capability", "Topology"),
        doc("ontology/elements/canvas", "element", "Canvas"),
        doc("ontology/elements/unrelated", "element", "Unrelated"),
      ]),
      "ontology/capabilities/builder",
    );

    expect(focused.focusSlug).toBe("ontology/capabilities/builder");
    expect(focused.manifest.docs.map((item) => item.slug)).toEqual([
      "ontology/domains/views",
      "ontology/capabilities/builder",
      "ontology/capabilities/topology",
      "ontology/elements/canvas",
    ]);
  });

  it("matches refs by full slug, tail slug, or title", () => {
    const focused = buildFocusedBuilderManifest(
      manifest([
        doc("ontology/domains/views", "domain", "Views", {
          capabilities: ["builder"],
        }),
        doc("ontology/capabilities/builder", "capability", "Builder", {
          elements: ["Canvas View"],
        }),
        doc("ontology/elements/canvas-view", "element", "Canvas View"),
      ]),
      "builder",
    );

    expect(focused.focusSlug).toBe("ontology/capabilities/builder");
    expect(focused.manifest.docs.map((item) => item.slug)).toEqual([
      "ontology/domains/views",
      "ontology/capabilities/builder",
      "ontology/elements/canvas-view",
    ]);
  });

  it("returns the original manifest when there is no ontology focus candidate", () => {
    const source = manifest([
      doc("notes/release", "document", "Release"),
      doc("notes/meeting", "document", "Meeting"),
    ]);

    const focused = buildFocusedBuilderManifest(source, null);

    expect(focused.focusSlug).toBeNull();
    expect(focused.isFocused).toBe(false);
    expect(focused.manifest).toBe(source);
  });
});
