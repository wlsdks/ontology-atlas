import { describe, expect, it } from "vitest";
import type { VaultDoc, VaultManifest } from "@/entities/docs-vault";
import { findVaultBacklinks } from "./find-vault-backlinks";

function makeDoc(partial: Partial<VaultDoc> & { slug: string }): VaultDoc {
  return {
    slug: partial.slug,
    path: `${partial.slug}.md`,
    title: partial.title ?? partial.slug,
    tags: [],
    frontmatter: partial.frontmatter ?? {},
    headings: [],
    excerpt: "",
    wordCount: 0,
    updatedAt: "2026-05-02T00:00:00Z",
    mode: "both",
    linksOut: [],
  };
}

function manifest(docs: VaultDoc[]): VaultManifest {
  return {
    version: "v1",
    generatedAt: "2026-05-02T00:00:00Z",
    docs,
    backlinksDetail: {},
    tags: {},
    tree: { name: "root", path: "", type: "dir", children: [] },
  };
}

describe("findVaultBacklinks", () => {
  it("frontmatter array 키에서 정확 slug + tail segment 매칭", () => {
    const result = findVaultBacklinks(
      manifest([
        makeDoc({
          slug: "project",
          frontmatter: { capabilities: ["mcp-server"] },
        }),
        makeDoc({
          slug: "domains/foo",
          frontmatter: { contains: ["capabilities/mcp-server"] },
        }),
      ]),
      "capabilities/mcp-server",
    );
    expect(result.map((m) => m.slug).sort()).toEqual([
      "domains/foo",
      "project",
    ]);
  });

  it("self 참조는 무시", () => {
    const result = findVaultBacklinks(
      manifest([
        makeDoc({
          slug: "a",
          frontmatter: { relates: ["a"] },
        }),
      ]),
      "a",
    );
    expect(result).toEqual([]);
  });

  it("frontmatter 외 키는 무시", () => {
    const result = findVaultBacklinks(
      manifest([
        makeDoc({
          slug: "x",
          frontmatter: { tags: ["mcp-server"] },
        }),
      ]),
      "capabilities/mcp-server",
    );
    expect(result).toEqual([]);
  });

  it("matchedKeys 가 어느 키에서 매칭됐는지 알려준다", () => {
    const result = findVaultBacklinks(
      manifest([
        makeDoc({
          slug: "project",
          frontmatter: {
            capabilities: ["mcp-server"],
            relates: ["mcp-server"],
          },
        }),
      ]),
      "capabilities/mcp-server",
    );
    expect(result[0].matchedKeys.sort()).toEqual(["capabilities", "relates"]);
  });
});
