import { describe, expect, it } from "vitest";

import { describeVaultShape } from "./vault-shape";

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
