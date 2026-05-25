import { describe, expect, it } from "vitest";
import { resolveBuilderQueryNodeSlug } from "./resolve-builder-query-node";

const docs = [
  {
    slug: "ontology/capabilities/topology-analysis-modes",
    frontmatter: { slug: "capabilities/topology-analysis-modes" },
  },
  {
    slug: "domains/views",
    frontmatter: { slug: "domains/views" },
  },
];

describe("resolveBuilderQueryNodeSlug", () => {
  it("keeps exact live-vault slugs", () => {
    expect(resolveBuilderQueryNodeSlug("domains/views", docs)).toBe("domains/views");
  });

  it("maps dogfood docs-vault slugs from canonical vault slugs", () => {
    expect(
      resolveBuilderQueryNodeSlug("capabilities/topology-analysis-modes", docs),
    ).toBe("ontology/capabilities/topology-analysis-modes");
  });

  it("accepts already-prefixed dogfood docs-vault slugs", () => {
    expect(
      resolveBuilderQueryNodeSlug(
        "ontology/capabilities/topology-analysis-modes",
        docs,
      ),
    ).toBe("ontology/capabilities/topology-analysis-modes");
  });

  it("returns null for unknown or empty query nodes", () => {
    expect(resolveBuilderQueryNodeSlug("missing/node", docs)).toBeNull();
    expect(resolveBuilderQueryNodeSlug("", docs)).toBeNull();
    expect(resolveBuilderQueryNodeSlug(null, docs)).toBeNull();
  });
});
