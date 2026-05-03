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
  it("kind 가 없으면 null", () => {
    expect(buildOntologyDeeplinkForDoc(makeDoc({ slug: "foo" }))).toBeNull();
    expect(
      buildOntologyDeeplinkForDoc(
        makeDoc({ slug: "foo", frontmatter: { kind: "" } }),
      ),
    ).toBeNull();
  });

  it("kind + slug-tail 로 ontology id 조립", () => {
    expect(
      buildOntologyDeeplinkForDoc(
        makeDoc({
          slug: "domains/ontology-core",
          frontmatter: { kind: "domain" },
        }),
      ),
    ).toBe(`/ontology/?node=${encodeURIComponent("domain:ontology-core")}`);
  });

  it("vault 루트 doc 도 slug 그대로", () => {
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
