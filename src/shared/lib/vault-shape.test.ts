import { describe, expect, it } from "vitest";

import { describeVaultShape, countVaultContents } from "./vault-shape";

describe("describeVaultShape reads the folder, not a setting", () => {
  it("calls one project node a map, and the template alone a wiki", () => {
    expect(describeVaultShape([{ slug: "project", frontmatter: { kind: "project" } }])).toEqual({ map: true, wiki: false });
    expect(describeVaultShape([{ slug: "wiki/_template", frontmatter: {} }])).toEqual({ map: false, wiki: true });
  });

  it("does not count the vault README, a page's missing kind, or an empty folder", () => {
    expect(describeVaultShape([{ slug: "README", frontmatter: { kind: "vault-readme" } }])).toEqual({ map: false, wiki: false });
    expect(describeVaultShape([{ slug: "notes/todo", frontmatter: { title: "Todo" } }])).toEqual({ map: false, wiki: false });
    expect(describeVaultShape([])).toEqual({ map: false, wiki: false });
  });

  it("sees both when a wiki page and a domain share the folder", () => {
    expect(
      describeVaultShape([
        { slug: "wiki/charter", frontmatter: { title: "Charter" } },
        { slug: "domains/works", frontmatter: { kind: "domain" } },
      ]),
    ).toEqual({ map: true, wiki: true });
  });
});

describe("countVaultContents", () => {
  it("counts every parsed document, wiki pages included", () => {
    // `docCount` matches what the rest of the product already calls a document count - the
    // header chip reads `manifest.docs.length` - so a chooser row and the chip cannot
    // disagree about one folder.
    expect(
      countVaultContents([
        { slug: "project", frontmatter: { kind: "project" } },
        { slug: "wiki/notes", frontmatter: {} },
        { slug: "readme", frontmatter: { kind: "vault-readme" } },
      ]).docCount,
    ).toBe(3);
  });

  it("counts as concepts exactly what describeVaultShape calls a map", () => {
    const docs = [
      { slug: "project", frontmatter: { kind: "project" } },
      { slug: "domains/works", frontmatter: { kind: "domain" } },
      // Not concepts: a wiki page, an untyped document, the vault README, and a blank kind.
      { slug: "wiki/notes", frontmatter: { kind: "wiki-page" } },
      { slug: "loose", frontmatter: {} },
      { slug: "readme", frontmatter: { kind: "vault-readme" } },
      { slug: "blank", frontmatter: { kind: "   " } },
    ];

    expect(countVaultContents(docs).conceptCount).toBe(2);
    // The parity that matters: one predicate, so a row cannot say "2 concepts" while the
    // rail says this folder has no map.
    expect(describeVaultShape(docs).map).toBe(true);
  });

  it("reports an empty folder as zero of both", () => {
    expect(countVaultContents([])).toEqual({ docCount: 0, conceptCount: 0 });
  });

  it("counts no concepts in a wiki-only folder", () => {
    const docs = [
      { slug: "wiki/one", frontmatter: { kind: "wiki-page" } },
      { slug: "wiki/two", frontmatter: { kind: "wiki-page" } },
    ];
    expect(countVaultContents(docs)).toEqual({ docCount: 2, conceptCount: 0 });
    expect(describeVaultShape(docs)).toEqual({ map: false, wiki: true });
  });
});
