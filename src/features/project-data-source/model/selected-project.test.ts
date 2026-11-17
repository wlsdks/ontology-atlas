import { describe, expect, it } from "vitest";

import type { VaultDoc } from "@/entities/docs-vault";

import { resolveSelectedProjectSlug } from "./selected-project";

function project(slug: string): VaultDoc {
  return {
    slug: `projects/${slug}`,
    path: `projects/${slug}.md`,
    title: slug,
    tags: [],
    frontmatter: { kind: "project", slug },
    headings: [],
    excerpt: "",
    wordCount: 0,
    updatedAt: "2026-11-17T00:00:00.000Z",
    linksOut: [],
  };
}

const ONE = [project("shop")];
const TWO = [project("shop"), project("ledger")];

describe("resolveSelectedProjectSlug", () => {
  it("opens the recorded project while it still exists", () => {
    expect(resolveSelectedProjectSlug("ledger", TWO)).toBe("ledger");
  });

  it("falls back to the sole project when the recorded one was deleted", () => {
    expect(resolveSelectedProjectSlug("ledger", ONE)).toBe("shop");
  });

  it("falls back to the list when the recorded one was deleted and several remain", () => {
    expect(resolveSelectedProjectSlug("gone", TWO)).toBeNull();
  });

  it("opens the sole project when nothing was recorded", () => {
    expect(resolveSelectedProjectSlug(null, ONE)).toBe("shop");
  });

  it("opens the list when nothing was recorded and the folder has several projects", () => {
    expect(resolveSelectedProjectSlug(null, TWO)).toBeNull();
  });
});
