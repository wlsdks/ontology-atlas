import { describe, expect, it } from "vitest";
import type { VaultDoc } from "../model/types";
import { buildOntologyDeeplinkForDoc } from "./ontology-deeplink";

function makeDoc(partial: Partial<VaultDoc>): VaultDoc {
  return {
    slug: partial.slug ?? "x",
    path: partial.path ?? `${partial.slug ?? "x"}.md`,
    title: partial.title ?? "",
    description: partial.description,
    tags: partial.tags ?? [],
    frontmatter: partial.frontmatter ?? {},
    headings: partial.headings ?? [],
    excerpt: partial.excerpt ?? "",
    wordCount: partial.wordCount ?? 0,
    updatedAt: partial.updatedAt ?? new Date(0).toISOString(),
    linksOut: partial.linksOut ?? [],
  };
}

describe("buildOntologyDeeplinkForDoc", () => {
  it("returns null without kind", () => {
    expect(buildOntologyDeeplinkForDoc(makeDoc({ slug: "foo" }))).toBeNull();
    expect(
      buildOntologyDeeplinkForDoc(
        makeDoc({ slug: "foo", frontmatter: { kind: "" } }),
      ),
    ).toBeNull();
  });

  it("builds the ontology id from kind and slug tail", () => {
    expect(
      buildOntologyDeeplinkForDoc(
        makeDoc({
          slug: "domains/ontology-core",
          frontmatter: { kind: "domain" },
        }),
      ),
    ).toBe(`/ontology/?node=${encodeURIComponent("domain:ontology-core")}`);
  });

  it("keeps the slug of a vault-root doc", () => {
    expect(
      buildOntologyDeeplinkForDoc(
        makeDoc({
          slug: "project",
          frontmatter: { kind: "project" },
        }),
      ),
    ).toBe(`/ontology/?node=${encodeURIComponent("project:project")}`);
  });
});
