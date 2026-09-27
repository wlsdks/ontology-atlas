import { describe, expect, it } from "vitest";
import type { VaultDoc } from "../model/types";
import { buildTopologyDeeplinkForDoc } from "./topology-deeplink";

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

describe("buildTopologyDeeplinkForDoc", () => {
  it("returns null for non-graph kinds and missing kind", () => {
    expect(
      buildTopologyDeeplinkForDoc(
        makeDoc({ slug: "docs/x", frontmatter: { kind: "document" } }),
      ),
    ).toBeNull();
    expect(
      buildTopologyDeeplinkForDoc(
        makeDoc({ slug: "README", frontmatter: { kind: "vault-readme" } }),
      ),
    ).toBeNull();
    expect(buildTopologyDeeplinkForDoc(makeDoc({ slug: "y" }))).toBeNull();
  });

  it("links domain, capability and element to focus mode", () => {
    // The topology renders the whole ontology now, so non-project nodes can be focused too.
    expect(
      buildTopologyDeeplinkForDoc(
        makeDoc({ slug: "domains/views", frontmatter: { kind: "domain" } }),
      ),
    ).toBe(`/topology/?mode=focus&p=${encodeURIComponent("domains/views")}`);
    expect(
      buildTopologyDeeplinkForDoc(
        makeDoc({
          slug: "capabilities/mcp-server",
          frontmatter: { kind: "capability" },
        }),
      ),
    ).toBe(
      `/topology/?mode=focus&p=${encodeURIComponent("capabilities/mcp-server")}`,
    );
    expect(
      buildTopologyDeeplinkForDoc(
        makeDoc({ slug: "elements/foo", frontmatter: { kind: "element" } }),
      ),
    ).toBe(`/topology/?mode=focus&p=${encodeURIComponent("elements/foo")}`);
  });

  it("strips the projects/ prefix into ?p=", () => {
    expect(
      buildTopologyDeeplinkForDoc(
        makeDoc({
          slug: "projects/my-app",
          frontmatter: { kind: "project" },
        }),
      ),
    ).toBe(`/topology/?p=${encodeURIComponent("my-app")}`);
  });

  it("prefers fm.slug", () => {
    expect(
      buildTopologyDeeplinkForDoc(
        makeDoc({
          slug: "projects/my-app",
          frontmatter: { kind: "project", slug: "custom-slug" },
        }),
      ),
    ).toBe(`/topology/?p=${encodeURIComponent("custom-slug")}`);
  });

  it("uses the last segment for a vault-root doc", () => {
    expect(
      buildTopologyDeeplinkForDoc(
        makeDoc({
          slug: "ontology/project",
          frontmatter: { kind: "project" },
        }),
      ),
    ).toBe(`/topology/?p=${encodeURIComponent("project")}`);
  });
});
