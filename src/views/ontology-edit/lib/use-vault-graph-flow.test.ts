import { describe, expect, it } from "vitest";
import type { VaultManifest, VaultDoc } from "@/entities/docs-vault";
import { buildVaultGraphFlow } from "./use-vault-graph-flow";

function makeDoc(partial: Partial<VaultDoc> & { slug: string }): VaultDoc {
  return {
    slug: partial.slug,
    path: partial.path ?? `${partial.slug}.md`,
    title: partial.title ?? partial.slug,
    description: partial.description,
    tags: partial.tags ?? [],
    frontmatter: partial.frontmatter ?? {},
    headings: partial.headings ?? [],
    excerpt: partial.excerpt ?? "",
    wordCount: partial.wordCount ?? 0,
    updatedAt: partial.updatedAt ?? "2026-05-01T00:00:00Z",
    mode: partial.mode ?? "both",
    linksOut: partial.linksOut ?? [],
  };
}

function makeManifest(docs: VaultDoc[]): VaultManifest {
  return {
    version: "v1",
    generatedAt: "2026-05-01T00:00:00Z",
    docs,
    backlinksDetail: {},
    tags: {},
    tree: { name: "root", path: "", type: "dir", children: [] },
  };
}

describe("buildVaultGraphFlow", () => {
  it("kind 가 없는 doc 은 노드로 만들지 않는다", () => {
    const result = buildVaultGraphFlow(
      makeManifest([
        makeDoc({ slug: "no-kind", frontmatter: { title: "X" } }),
        makeDoc({
          slug: "capabilities/foo",
          frontmatter: { kind: "capability", title: "Foo" },
        }),
      ]),
    );
    expect(result.nodes.map((n) => n.id)).toEqual(["capabilities/foo"]);
  });

  it("node id 가 vault slug 와 일치 (인스펙터 lookup 안전)", () => {
    const result = buildVaultGraphFlow(
      makeManifest([
        makeDoc({
          slug: "capabilities/mcp-server",
          title: "MCP Server",
          frontmatter: { kind: "capability", title: "MCP Server" },
        }),
      ]),
    );
    expect(result.nodes[0].id).toBe("capabilities/mcp-server");
    expect(result.nodes[0].data).toMatchObject({
      kind: "capability",
      vault: true,
      ephemeral: false,
    });
  });

  it("frontmatter array 키에서 edge 를 만들고 마지막 segment 매칭도 적용", () => {
    const result = buildVaultGraphFlow(
      makeManifest([
        makeDoc({
          slug: "project",
          frontmatter: { kind: "project", capabilities: ["mcp-server"] },
        }),
        makeDoc({
          slug: "capabilities/mcp-server",
          frontmatter: {
            kind: "capability",
            elements: ["mcp/src/index.js"],
          },
        }),
        makeDoc({
          slug: "elements/mcp-sdk",
          path: "elements/mcp-sdk.md",
          title: "mcp/src/index.js",
          frontmatter: { kind: "element", title: "mcp/src/index.js" },
        }),
      ]),
    );
    const edgePairs = result.edges.map((e) => ({
      source: e.source,
      target: e.target,
    }));
    // project --capabilities--> capabilities/mcp-server (tail match)
    expect(edgePairs).toContainEqual({
      source: "project",
      target: "capabilities/mcp-server",
    });
  });

  it("vault 외부 ref 는 dangling 으로 무시", () => {
    const result = buildVaultGraphFlow(
      makeManifest([
        makeDoc({
          slug: "a",
          frontmatter: { kind: "capability", relates: ["nonexistent"] },
        }),
      ]),
    );
    expect(result.edges).toEqual([]);
  });

  it("self-edge 는 추가 안 함", () => {
    const result = buildVaultGraphFlow(
      makeManifest([
        makeDoc({
          slug: "a",
          frontmatter: { kind: "capability", relates: ["a"] },
        }),
      ]),
    );
    expect(result.edges).toEqual([]);
  });
});
