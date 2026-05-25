import { describe, expect, it } from "vitest";
import {
  buildVaultRelationGraphEffect,
  buildVaultRelationFrontmatterPatch,
  buildVaultRelationPatch,
  buildVaultRelationWriteScope,
  buildVaultRelationWritePreview,
  inferVaultRelationKey,
  preflightVaultRelation,
  readVaultRelationValues,
} from "./relation-proposal";
import type { VaultManifest } from "@/entities/docs-vault";

describe("inferVaultRelationKey", () => {
  it("maps project dependencies explicitly", () => {
    expect(inferVaultRelationKey("project", "project")).toBe("dependencies");
  });

  it("maps containment-like ontology hierarchy edges", () => {
    expect(inferVaultRelationKey("project", "domain")).toBe("domains");
    expect(inferVaultRelationKey("project", "capability")).toBe("capabilities");
    expect(inferVaultRelationKey("project", "element")).toBe("elements");
    expect(inferVaultRelationKey("domain", "capability")).toBe("capabilities");
    expect(inferVaultRelationKey("capability", "element")).toBe("elements");
  });

  it("uses generic graph keys for explicit containment and evidence edges", () => {
    expect(inferVaultRelationKey("domain", "element")).toBe("contains");
    expect(inferVaultRelationKey("document", "capability")).toBe("describes");
  });

  it("falls back to relates for ambiguous pairs", () => {
    expect(inferVaultRelationKey("element", "capability")).toBe("relates");
  });
});

describe("buildVaultRelationWritePreview", () => {
  it("describes the exact source frontmatter array mutation", () => {
    expect(
      buildVaultRelationWritePreview(
        "capabilities/mcp-server",
        "elements",
        "elements/mcp-index",
      ),
    ).toBe("capabilities/mcp-server.elements += elements/mcp-index");
  });
});

describe("buildVaultRelationFrontmatterPatch", () => {
  it("shows the exact frontmatter array item that will be added", () => {
    expect(
      buildVaultRelationFrontmatterPatch("elements", "elements/mcp-index"),
    ).toBe(["elements:", "  - elements/mcp-index"].join("\n"));
  });
});

describe("buildVaultRelationWriteScope", () => {
  it("describes file, frontmatter key, target, and mutation separately", () => {
    expect(
      buildVaultRelationWriteScope(
        "capabilities/mcp-server",
        "elements",
        "elements/mcp-index",
      ),
    ).toEqual({
      filePath: "capabilities/mcp-server.md",
      changedFiles: ["capabilities/mcp-server.md"],
      unchangedFiles: ["elements/mcp-index.md"],
      frontmatterKey: "elements",
      targetSlug: "elements/mcp-index",
      mutation: "capabilities/mcp-server.elements += elements/mcp-index",
    });
  });
});

describe("buildVaultRelationGraphEffect", () => {
  it("describes the directed graph edge and affected graph surfaces", () => {
    expect(
      buildVaultRelationGraphEffect({
        sourceSlug: "capabilities/mcp-server",
        targetSlug: "elements/mcp-index",
        inferredKey: "elements",
        selectedKey: "dependencies",
      }),
    ).toEqual({
      edge: "capabilities/mcp-server --dependencies--> elements/mcp-index",
      relationLabel: "dependencies",
      direction: "source_to_target",
      surfaces: ["topology", "path", "impact", "mcp"],
      inferredMatchesSelected: false,
    });
  });
});

describe("readVaultRelationValues", () => {
  it("merges dependencies and depends_on without duplicates", () => {
    expect(
      readVaultRelationValues(
        {
          dependencies: ["capabilities/a", "capabilities/b"],
          depends_on: ["capabilities/b", "capabilities/c"],
        },
        "dependencies",
      ),
    ).toEqual(["capabilities/a", "capabilities/b", "capabilities/c"]);
  });
});

describe("buildVaultRelationPatch", () => {
  it("canonicalizes depends_on into dependencies when writing dependencies", () => {
    expect(
      buildVaultRelationPatch(
        { depends_on: ["capabilities/a"] },
        "dependencies",
        "capabilities/b",
      ),
    ).toEqual({
      alreadyExists: false,
      next: ["capabilities/a", "capabilities/b"],
      patch: {
        dependencies: ["capabilities/a", "capabilities/b"],
        depends_on: null,
      },
    });
  });

  it("reports alias duplicates without adding another dependency", () => {
    expect(
      buildVaultRelationPatch(
        { depends_on: ["capabilities/a"] },
        "dependencies",
        "capabilities/a",
      ),
    ).toEqual({
      alreadyExists: true,
      next: ["capabilities/a"],
      patch: {
        dependencies: ["capabilities/a"],
        depends_on: null,
      },
    });
  });
});

const manifest = (edges: Record<string, Partial<Record<string, string[]>>>): VaultManifest => ({
  version: "test",
  generatedAt: "2026-05-25T00:00:00.000Z",
  docs: Object.entries(edges).map(([slug, frontmatter]) => ({
    slug,
    path: `${slug}.md`,
    title: slug,
    tags: [],
    excerpt: "",
    wordCount: 0,
    updatedAt: "2026-05-25T00:00:00.000Z",
    headings: [],
    linksOut: [],
    frontmatter: { slug, kind: "capability", title: slug, ...frontmatter },
    mtime: 0,
  })),
  backlinksDetail: {},
  tags: {},
  tree: { name: "root", path: "", type: "dir", children: [] },
});

describe("preflightVaultRelation", () => {
  it("blocks exact duplicate writes", () => {
    const result = preflightVaultRelation(
      manifest({
        a: { dependencies: ["b"] },
        b: {},
      }),
      { sourceSlug: "a", targetSlug: "b" },
      "dependencies",
    );

    expect(result).toMatchObject({
      decision: "skip_existing",
      exactExists: true,
    });
  });

  it("treats legacy depends_on as a canonical dependencies duplicate", () => {
    const result = preflightVaultRelation(
      manifest({
        a: { depends_on: ["b"] },
        b: {},
      }),
      { sourceSlug: "a", targetSlug: "b" },
      "dependencies",
    );

    expect(result).toMatchObject({
      decision: "skip_existing",
      exactExists: true,
    });
  });

  it("surfaces inverse relations for review", () => {
    const result = preflightVaultRelation(
      manifest({
        a: {},
        b: { relates: ["a"] },
      }),
      { sourceSlug: "a", targetSlug: "b" },
      "relates",
    );

    expect(result).toMatchObject({
      decision: "review_inverse",
      inverseExists: true,
    });
  });

  it("surfaces an existing indirect path before adding another edge", () => {
    const result = preflightVaultRelation(
      manifest({
        a: { dependencies: ["mid"] },
        mid: { dependencies: ["b"] },
        b: {},
      }),
      { sourceSlug: "a", targetSlug: "b" },
      "relates",
    );

    expect(result).toMatchObject({
      decision: "review_path",
      pathExists: true,
      path: ["a", "mid", "b"],
    });
  });

  it("uses depends_on edges as existing path evidence", () => {
    const result = preflightVaultRelation(
      manifest({
        a: { depends_on: ["mid"] },
        mid: { depends_on: ["b"] },
        b: {},
      }),
      { sourceSlug: "a", targetSlug: "b" },
      "relates",
    );

    expect(result).toMatchObject({
      decision: "review_path",
      pathExists: true,
      path: ["a", "mid", "b"],
    });
  });

  it("surfaces a same-direction direct edge under another key", () => {
    const result = preflightVaultRelation(
      manifest({
        a: { dependencies: ["b"] },
        b: {},
      }),
      { sourceSlug: "a", targetSlug: "b" },
      "relates",
    );

    expect(result).toMatchObject({
      decision: "review_path",
      exactExists: false,
      pathExists: true,
      path: ["a", "b"],
    });
  });

  it("allows an unexplained new relation", () => {
    const result = preflightVaultRelation(
      manifest({
        a: {},
        b: {},
      }),
      { sourceSlug: "a", targetSlug: "b" },
      "relates",
    );

    expect(result).toMatchObject({
      decision: "safe_to_add",
      exactExists: false,
      inverseExists: false,
      pathExists: false,
      path: [],
    });
  });
});
