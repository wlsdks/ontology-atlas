import { describe, expect, it } from "vitest";
import type { VaultDoc, VaultManifest } from "../model/types";
import {
  resolveSoleProjectSlug,
  hasSeveralProjectDocs,
  computeProjectSlug,
  findProjectDocInList,
  findProjectVaultDoc,
  isProjectVaultDoc,
} from "./project-slug";

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

function makeManifest(docs: VaultDoc[]): VaultManifest {
  return {
    version: "1",
    generatedAt: new Date(0).toISOString(),
    docs,
    backlinksDetail: {},
    tags: {},
    tree: { name: "vault", path: "", type: "dir" },
  };
}

describe("computeProjectSlug", () => {
  it("strips the projects/ prefix", () => {
    expect(computeProjectSlug(makeDoc({ slug: "projects/foo" }))).toBe("foo");
  });

  it("uses the last segment for a vault-root path", () => {
    expect(
      computeProjectSlug(makeDoc({ slug: "ontology/project" })),
    ).toBe("project");
  });

  it("keeps a single-segment slug", () => {
    expect(computeProjectSlug(makeDoc({ slug: "bar" }))).toBe("bar");
  });

  it("prefers a trimmed fm.slug", () => {
    expect(
      computeProjectSlug(
        makeDoc({
          slug: "projects/foo",
          frontmatter: { slug: "  custom-slug  " },
        }),
      ),
    ).toBe("custom-slug");
  });

  it("ignores a blank fm.slug and falls back to the file slug", () => {
    expect(
      computeProjectSlug(
        makeDoc({ slug: "projects/foo", frontmatter: { slug: "   " } }),
      ),
    ).toBe("foo");
  });

  it("ignores a non-string fm.slug", () => {
    expect(
      computeProjectSlug(
        makeDoc({ slug: "projects/foo", frontmatter: { slug: 42 } }),
      ),
    ).toBe("foo");
  });
});

describe("isProjectVaultDoc", () => {
  it("recognizes kind: project regardless of path", () => {
    expect(
      isProjectVaultDoc(
        makeDoc({ slug: "ontology/project", frontmatter: { kind: "project" } }),
      ),
    ).toBe(true);
  });

  it("recognizes a legacy projects/ path without frontmatter", () => {
    expect(isProjectVaultDoc(makeDoc({ slug: "projects/legacy-app" }))).toBe(true);
  });

  it("returns false without kind or projects/ prefix", () => {
    expect(
      isProjectVaultDoc(makeDoc({ slug: "domains/foo", frontmatter: { kind: "domain" } })),
    ).toBe(false);
  });
});

describe("findProjectVaultDoc", () => {
  it("finds the source VaultDoc by Project.slug", () => {
    const doc = makeDoc({
      slug: "ontology/project",
      frontmatter: { kind: "project", slug: "ontology-atlas" },
    });
    const manifest = makeManifest([
      doc,
      makeDoc({ slug: "domains/foo", frontmatter: { kind: "domain" } }),
    ]);

    expect(findProjectVaultDoc(manifest, "ontology-atlas")).toBe(doc);
  });

  it("returns null when no project doc matches", () => {
    const manifest = makeManifest([
      makeDoc({ slug: "domains/foo", frontmatter: { kind: "domain" } }),
    ]);

    expect(findProjectVaultDoc(manifest, "missing")).toBeNull();
  });

  it("ignores a non-project doc with a matching slug", () => {
    // A matching slug alone does not make a doc a project.
    const manifest = makeManifest([
      makeDoc({ slug: "domains/foo", frontmatter: { kind: "domain", slug: "foo" } }),
    ]);

    expect(findProjectVaultDoc(manifest, "foo")).toBeNull();
  });
});

describe("findProjectDocInList", () => {
  it("finds a project doc whose file path differs from its frontmatter slug", () => {
    // The dogfood shape: file `ontology/project`, frontmatter `slug: ontology-atlas`.
    const docs = [
      makeDoc({
        slug: "ontology/project",
        frontmatter: { kind: "project", slug: "ontology-atlas" },
      }),
      makeDoc({ slug: "guides/intro", frontmatter: {} }),
    ];
    expect(findProjectDocInList(docs, "ontology-atlas")?.slug).toBe("ontology/project");
    expect(findProjectDocInList(docs, "ontology/project")).toBeNull();
  });
});

describe("resolveSoleProjectSlug", () => {
  const projectDoc = (slug: string, frontmatterSlug?: string): VaultDoc =>
    makeDoc({ slug, frontmatter: { kind: "project", ...(frontmatterSlug ? { slug: frontmatterSlug } : {}) } });

  it("names the folder's only project", () => {
    expect(
      resolveSoleProjectSlug([
        makeDoc({ slug: "domains/order", frontmatter: { kind: "domain" } }),
        projectDoc("atlas/project", "storefront"),
      ]),
    ).toBe("storefront");
  });

  it("is null for a folder with none, and for one with a second", () => {
    expect(resolveSoleProjectSlug([])).toBeNull();
    expect(resolveSoleProjectSlug([makeDoc({ slug: "domains/order", frontmatter: { kind: "domain" } })])).toBeNull();
    expect(resolveSoleProjectSlug([projectDoc("projects/a"), projectDoc("projects/b")])).toBeNull();
  });
});

describe("hasSeveralProjectDocs", () => {
  const projectDoc = (slug: string): VaultDoc =>
    makeDoc({ slug, frontmatter: { kind: "project", slug } });

  it("is false for a folder with one project, which is the standard shape", () => {
    expect(
      hasSeveralProjectDocs([
        makeDoc({ slug: "domains/order", frontmatter: { kind: "domain" } }),
        projectDoc("atlas/project"),
      ]),
    ).toBe(false);
  });

  it("is false for a folder with no project at all", () => {
    expect(hasSeveralProjectDocs([makeDoc({ slug: "notes", frontmatter: { kind: "document" } })])).toBe(false);
  });

  it("is true as soon as a second project exists", () => {
    expect(hasSeveralProjectDocs([projectDoc("one"), projectDoc("two")])).toBe(true);
  });

  it("does not count a project document whose slug cannot be resolved", () => {
    const unnamed = makeDoc({ slug: "", frontmatter: { kind: "project" } });
    expect(hasSeveralProjectDocs([projectDoc("one"), unnamed])).toBe(false);
  });
});
