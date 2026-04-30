import { describe, expect, it } from "vitest";
import type { VaultTreeNode } from "@/entities/docs-vault";
import {
  filterTree,
  firstDocSlug,
  flattenDocs,
  flattenTreeSlugs,
} from "./tree-utils";

// 공통 fixture — 2-depth 트리:
//   root/
//   ├─ rules/  (dir)
//   │  ├─ fsd          (doc, tags: [architecture])
//   │  └─ naming       (doc, tags: [style, architecture])
//   ├─ design/ (dir)
//   │  └─ linear       (doc, tags: [design])
//   └─ README          (doc, tags: [overview])
function doc(
  slug: string,
  title: string,
  path: string,
): VaultTreeNode {
  return { name: slug, path, type: "doc", slug, title };
}
function dir(name: string, path: string, children: VaultTreeNode[]): VaultTreeNode {
  return { name, path, type: "dir", children };
}

const fixture: VaultTreeNode = dir("docs", "", [
  dir("rules", "rules", [
    doc("rules/fsd", "FSD 아키텍처 규칙", "rules/fsd"),
    doc("rules/naming", "Naming Conventions", "rules/naming"),
  ]),
  dir("design", "design", [
    doc("design/linear", "Linear Design", "design/linear"),
  ]),
  doc("README", "Project README", "README"),
]);

describe("flattenDocs", () => {
  it("pre-order: dirs descended in definition order, docs included", () => {
    const result = flattenDocs(fixture).map((n) => n.slug);
    expect(result).toEqual([
      "rules/fsd",
      "rules/naming",
      "design/linear",
      "README",
    ]);
  });

  it("empty dir returns empty array", () => {
    expect(flattenDocs(dir("empty", "", []))).toEqual([]);
  });
});

describe("firstDocSlug", () => {
  it("returns first doc slug in pre-order", () => {
    expect(firstDocSlug(fixture)).toBe("rules/fsd");
  });

  it("returns null for null input", () => {
    expect(firstDocSlug(null)).toBeNull();
  });

  it("returns null for dir with no doc descendants", () => {
    expect(firstDocSlug(dir("empty", "", [dir("inner", "inner", [])]))).toBeNull();
  });

  it("returns own slug for direct doc node", () => {
    expect(firstDocSlug(doc("a", "A", "a"))).toBe("a");
  });
});

describe("flattenTreeSlugs", () => {
  it("flat pre-order slug list", () => {
    expect(flattenTreeSlugs(fixture)).toEqual([
      "rules/fsd",
      "rules/naming",
      "design/linear",
      "README",
    ]);
  });

  it("null input returns []", () => {
    expect(flattenTreeSlugs(null)).toEqual([]);
  });
});

describe("filterTree", () => {
  it("returns original when needle empty and no tag filter", () => {
    const result = filterTree(fixture, "", null);
    expect(flattenTreeSlugs(result)).toEqual([
      "rules/fsd",
      "rules/naming",
      "design/linear",
      "README",
    ]);
  });

  it("matches title substring (case insensitive)", () => {
    const result = filterTree(fixture, "linear", null);
    expect(flattenTreeSlugs(result)).toEqual(["design/linear"]);
  });

  it("matches path substring", () => {
    const result = filterTree(fixture, "rules/", null);
    expect(flattenTreeSlugs(result)).toEqual(["rules/fsd", "rules/naming"]);
  });

  it("returns null when nothing matches", () => {
    expect(filterTree(fixture, "zzzz-no-match-zzzz", null)).toBeNull();
  });

  it("preserves parent dir when at least one child matches", () => {
    const result = filterTree(fixture, "fsd", null);
    expect(result?.type).toBe("dir");
    expect(result?.children).toHaveLength(1);
    expect(result?.children?.[0].type).toBe("dir"); // rules/
    expect(result?.children?.[0].children?.[0].slug).toBe("rules/fsd");
  });

  it("tag filter alone keeps only whitelisted slugs", () => {
    const tagSlugs = new Set(["rules/fsd", "rules/naming"]);
    const result = filterTree(fixture, "", tagSlugs);
    expect(flattenTreeSlugs(result)).toEqual(["rules/fsd", "rules/naming"]);
  });

  it("tag filter + needle are AND-combined", () => {
    const tagSlugs = new Set(["rules/fsd", "rules/naming", "design/linear"]);
    const result = filterTree(fixture, "naming", tagSlugs);
    expect(flattenTreeSlugs(result)).toEqual(["rules/naming"]);
  });

  it("does not mutate the original node", () => {
    const originalChildCount = fixture.children?.length;
    filterTree(fixture, "linear", null);
    expect(fixture.children?.length).toBe(originalChildCount);
  });
});
