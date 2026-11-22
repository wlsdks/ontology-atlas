import { describe, expect, it } from "vitest";

import type { VaultDoc } from "@/entities/docs-vault";

import { wikiRevisionStamp } from "./wiki-revision-stamp";

const doc = (slug: string, mtime: number | undefined, frontmatter: Record<string, unknown> = {}) =>
  ({ slug, mtime, frontmatter, path: `${slug}.md` }) as unknown as VaultDoc;

describe("wikiRevisionStamp", () => {
  it("stamps content pages by slug and counts a missing time as zero", () => {
    const stamps = wikiRevisionStamp([doc("wiki/a", 5), doc("wiki/b", undefined)]);
    expect([...stamps]).toEqual([["wiki/a", 5], ["wiki/b", 0]]);
  });

  it("leaves out documents outside the wiki folder, underscore furniture and ontology nodes misfiled under wiki", () => {
    const stamps = wikiRevisionStamp([doc("notes/a", 1), doc("wiki/_log", 2), doc("wiki/node", 3, { kind: "capability" }), doc("wiki/real", 4)]);
    expect([...stamps.keys()]).toEqual(["wiki/real"]);
  });
});
