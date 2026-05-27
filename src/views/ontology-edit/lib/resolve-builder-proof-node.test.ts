import { describe, expect, it } from "vitest";
import { resolveBuilderProofNodeId, resolveBuilderProofTarget } from "./resolve-builder-proof-node";

describe("resolveBuilderProofNodeId", () => {
  it("uses the project frontmatter slug so Insights receives the graph node id", () => {
    expect(
      resolveBuilderProofNodeId({
        slug: "project",
        frontmatter: { kind: "project", slug: "oh-my-ontology" },
      }),
    ).toBe("project:oh-my-ontology");
  });

  it("uses the file tail for non-project vault docs", () => {
    expect(
      resolveBuilderProofNodeId({
        slug: "domains/views",
        frontmatter: { kind: "domain", slug: "domains/views" },
      }),
    ).toBe("domain:views");
  });

  it("returns null when the doc cannot become an ontology graph node", () => {
    expect(resolveBuilderProofNodeId(null)).toBeNull();
    expect(resolveBuilderProofNodeId({ slug: "notes/foo", frontmatter: {} })).toBeNull();
  });

  it("keeps the insights graph node id separate from the MCP/CLI vault slug", () => {
    expect(
      resolveBuilderProofTarget({
        slug: "elements/insights-query-cockpit",
        frontmatter: { kind: "element", slug: "elements/insights-query-cockpit" },
      }),
    ).toEqual({
      graphNodeId: "element:insights-query-cockpit",
      vaultSlug: "elements/insights-query-cockpit",
    });
  });
});
