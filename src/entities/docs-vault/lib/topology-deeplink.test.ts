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
  it("graph 노드 아닌 kind(document/vault-readme)·kind 없음 → null", () => {
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

  it("domain/capability/element 도 토폴로지 노드 — ?mode=focus&p=<slug> 로 focus 직링크", () => {
    // 토폴로지가 이제 전체 ontology 를 렌더하므로 project 외 노드도 focus 가능.
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

  it("projects/ prefix 는 제거하고 ?p= 로 직링크", () => {
    expect(
      buildTopologyDeeplinkForDoc(
        makeDoc({
          slug: "projects/my-app",
          frontmatter: { kind: "project" },
        }),
      ),
    ).toBe(`/topology/?p=${encodeURIComponent("my-app")}`);
  });

  it("fm.slug 가 있으면 우선", () => {
    expect(
      buildTopologyDeeplinkForDoc(
        makeDoc({
          slug: "projects/my-app",
          frontmatter: { kind: "project", slug: "custom-slug" },
        }),
      ),
    ).toBe(`/topology/?p=${encodeURIComponent("custom-slug")}`);
  });

  it("vault 루트 doc (예: ontology/project) 은 마지막 segment", () => {
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
