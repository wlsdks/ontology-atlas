import { describe, expect, it } from "vitest";
import type { VaultDoc, VaultManifest } from "../model/types";
import {
  computeProjectSlug,
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
  it("projects/ prefix 는 제거", () => {
    expect(computeProjectSlug(makeDoc({ slug: "projects/foo" }))).toBe("foo");
  });

  it("vault 루트 (projects/ 없는 경로) 는 마지막 segment", () => {
    expect(
      computeProjectSlug(makeDoc({ slug: "ontology/project" })),
    ).toBe("project");
  });

  it("slug 한 segment 인 경우 그대로", () => {
    expect(computeProjectSlug(makeDoc({ slug: "bar" }))).toBe("bar");
  });

  it("fm.slug 가 우선 — 앞뒤 공백 제거", () => {
    expect(
      computeProjectSlug(
        makeDoc({
          slug: "projects/foo",
          frontmatter: { slug: "  custom-slug  " },
        }),
      ),
    ).toBe("custom-slug");
  });

  it("fm.slug 가 빈 문자열 / 공백 only 면 무시 → fileSlug fallback", () => {
    expect(
      computeProjectSlug(
        makeDoc({ slug: "projects/foo", frontmatter: { slug: "   " } }),
      ),
    ).toBe("foo");
  });

  it("fm.slug 가 string 이 아니면 무시 (예: 숫자)", () => {
    expect(
      computeProjectSlug(
        makeDoc({ slug: "projects/foo", frontmatter: { slug: 42 } }),
      ),
    ).toBe("foo");
  });
});

describe("isProjectVaultDoc", () => {
  it("frontmatter.kind === 'project' 는 path 무관하게 인식", () => {
    expect(
      isProjectVaultDoc(
        makeDoc({ slug: "ontology/project", frontmatter: { kind: "project" } }),
      ),
    ).toBe(true);
  });

  it("legacy 'projects/' prefix 는 frontmatter 없어도 인식", () => {
    expect(isProjectVaultDoc(makeDoc({ slug: "projects/legacy-app" }))).toBe(true);
  });

  it("kind 도 'projects/' prefix 도 없으면 false", () => {
    expect(
      isProjectVaultDoc(makeDoc({ slug: "domains/foo", frontmatter: { kind: "domain" } })),
    ).toBe(false);
  });
});

describe("findProjectVaultDoc", () => {
  it("Project.slug (fm.slug 산정값) 으로 원본 VaultDoc 을 역참조한다", () => {
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

  it("일치하는 project doc 이 없으면 null", () => {
    const manifest = makeManifest([
      makeDoc({ slug: "domains/foo", frontmatter: { kind: "domain" } }),
    ]);

    expect(findProjectVaultDoc(manifest, "missing")).toBeNull();
  });

  it("project 가 아닌 doc 의 slug 우연 일치는 무시한다", () => {
    // frontmatter.slug 가 우연히 같아도 kind !== project / projects/ path
    // 아니면 project doc 으로 취급하지 않는다.
    const manifest = makeManifest([
      makeDoc({ slug: "domains/foo", frontmatter: { kind: "domain", slug: "foo" } }),
    ]);

    expect(findProjectVaultDoc(manifest, "foo")).toBeNull();
  });
});
