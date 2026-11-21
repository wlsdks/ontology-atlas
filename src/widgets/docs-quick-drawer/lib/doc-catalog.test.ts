import { describe, expect, it } from "vitest";
import type { VaultManifest } from "@/entities/docs-vault";
import {
  buildFlatDocs,
  buildTagIndex,
  cycleSlug,
  describeDocAge,
  docsForSlugs,
  latestModifiedDocs,
  rankTopTags,
  type FlatDoc,
} from "./doc-catalog";

function flatDoc(slug: string, updatedAt: string, tags: string[] = []): FlatDoc {
  return { slug, title: slug, path: `${slug}.md`, updatedAt, tags };
}

describe("buildFlatDocs", () => {
  const manifest = {
    tree: {
      type: "dir",
      name: "root",
      path: "",
      children: [
        { type: "doc", name: "a", path: "a.md", slug: "a", title: "Alpha" },
        { type: "doc", name: "b", path: "b.md", slug: "b" },
        { type: "doc", name: "no-slug", path: "n.md" },
      ],
    },
    docs: [{ slug: "a", updatedAt: "2026-01-02", tags: ["x"], frontmatter: { display_ko: "알파" } }],
  } as unknown as VaultManifest;

  it("lists tree documents with their manifest metadata and drops a slugless node", () => {
    const docs = buildFlatDocs(manifest, "en");
    expect(docs.map((doc) => doc.slug)).toEqual(["a", "b"]);
    expect(docs[0]).toMatchObject({ title: "Alpha", updatedAt: "2026-01-02", tags: ["x"] });
    expect(docs[1]).toMatchObject({ title: "b", updatedAt: "", tags: [] });
  });

  it("titles a document in the reader's language when the vault carries it", () => {
    expect(buildFlatDocs(manifest, "ko")[0].title).toBe("알파");
  });
});

describe("tags", () => {
  const docs = [
    flatDoc("a", "", ["design", "rules"]),
    flatDoc("b", "", ["rules"]),
    flatDoc("c", "", ["design", "alpha"]),
  ];

  it("indexes slugs per tag and ranks by count, then alphabetically", () => {
    const index = buildTagIndex(docs);
    expect([...(index.get("rules") ?? [])]).toEqual(["a", "b"]);
    expect(rankTopTags(index)).toEqual([
      { tag: "design", count: 2 },
      { tag: "rules", count: 2 },
      { tag: "alpha", count: 1 },
    ]);
  });

  it("keeps at most twelve tags", () => {
    const many = Array.from({ length: 15 }, (_, index) => flatDoc(`d${index}`, "", [`t${String(index).padStart(2, "0")}`]));
    expect(rankTopTags(buildTagIndex(many))).toHaveLength(12);
  });
});

describe("latestModifiedDocs", () => {
  it("orders newest first, skips undated documents and caps the list", () => {
    const docs = [flatDoc("old", "2026-01-01"), flatDoc("none", ""), flatDoc("new", "2026-03-01"), flatDoc("mid", "2026-02-01")];
    expect(latestModifiedDocs(docs, 2).map((doc) => doc.slug)).toEqual(["new", "mid"]);
    expect(latestModifiedDocs(docs).map((doc) => doc.slug)).toEqual(["new", "mid", "old"]);
  });
});

describe("docsForSlugs", () => {
  it("keeps saved order and drops a slug the vault no longer has", () => {
    const bySlug = new Map([flatDoc("a", ""), flatDoc("b", "")].map((doc) => [doc.slug, doc]));
    expect(docsForSlugs(["b", "gone", "a"], bySlug).map((doc) => doc.slug)).toEqual(["b", "a"]);
  });
});

describe("cycleSlug", () => {
  const slugs = ["a", "b", "c"];

  it("steps and wraps at both ends", () => {
    expect(cycleSlug(slugs, "a", 1)).toBe("b");
    expect(cycleSlug(slugs, "c", 1)).toBe("a");
    expect(cycleSlug(slugs, "a", -1)).toBe("c");
  });

  it("starts at the first item when nothing is focused and the step is forward", () => {
    expect(cycleSlug(slugs, null, 1)).toBe("a");
  });
});

describe("describeDocAge", () => {
  const now = new Date("2026-06-15T12:00:00Z").getTime();
  const daysBefore = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();

  it("names the unit by how long ago", () => {
    expect(describeDocAge(daysBefore(0.5), now)).toEqual({ key: "today" });
    expect(describeDocAge(daysBefore(1.5), now)).toEqual({ key: "yesterday" });
    expect(describeDocAge(daysBefore(2.5), now)).toEqual({ key: "daysAgo", values: { count: 2 } });
    expect(describeDocAge(daysBefore(10), now)).toEqual({ key: "daysAgo", values: { count: 10 } });
    expect(describeDocAge(daysBefore(65), now)).toEqual({ key: "monthsAgo", values: { count: 2 } });
    expect(describeDocAge(daysBefore(800), now)).toEqual({ key: "yearsAgo", values: { count: 2 } });
  });

  it("says nothing without a date", () => {
    expect(describeDocAge("", now)).toBeNull();
  });
});
