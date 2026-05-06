import { describe, expect, it } from "vitest";
import type { VaultDoc, VaultManifest } from "../model/types";
import { deriveProjectsFromVault } from "./derive-projects-from-vault";

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
    generatedAt: new Date().toISOString(),
    docs,
    backlinksDetail: {},
    tags: {},
    tree: { name: "vault", path: "", type: "dir" },
  };
}

describe("deriveProjectsFromVault — 인식 기준", () => {
  it("frontmatter.kind === 'project' 를 인식 (path 무관)", () => {
    const projects = deriveProjectsFromVault(
      makeManifest([
        makeDoc({
          slug: "ontology/project",
          frontmatter: { kind: "project" },
        }),
      ]),
    );
    expect(projects).toHaveLength(1);
    expect(projects[0]!.slug).toBe("project");
  });

  it("legacy: 'projects/' prefix 면 frontmatter 누락이라도 인식", () => {
    const projects = deriveProjectsFromVault(
      makeManifest([makeDoc({ slug: "projects/legacy-app" })]),
    );
    expect(projects).toHaveLength(1);
    expect(projects[0]!.slug).toBe("legacy-app");
  });

  it("kind 도 'projects/' prefix 도 없는 doc 은 제외", () => {
    const projects = deriveProjectsFromVault(
      makeManifest([
        makeDoc({ slug: "domains/foo", frontmatter: { kind: "domain" } }),
        makeDoc({ slug: "random-doc" }),
      ]),
    );
    expect(projects).toEqual([]);
  });
});

describe("deriveProjectsFromVault — slug & name", () => {
  it("fm.slug 가 있으면 우선, 없으면 computeProjectSlug fallback", () => {
    const projects = deriveProjectsFromVault(
      makeManifest([
        makeDoc({
          slug: "projects/file-name",
          frontmatter: { kind: "project", slug: "custom-slug" },
        }),
      ]),
    );
    expect(projects[0]!.slug).toBe("custom-slug");
  });

  it("name fallback chain: fm.name > fm.title > doc.title > fileSlug", () => {
    const projects = deriveProjectsFromVault(
      makeManifest([
        makeDoc({
          slug: "projects/foo",
          frontmatter: { kind: "project" },
          title: "Doc Title",
        }),
      ]),
    );
    expect(projects[0]!.name).toBe("Doc Title");

    const withFmName = deriveProjectsFromVault(
      makeManifest([
        makeDoc({
          slug: "projects/foo",
          frontmatter: { kind: "project", name: "FM Name" },
          title: "Doc Title",
        }),
      ]),
    );
    expect(withFmName[0]!.name).toBe("FM Name");
  });
});

describe("deriveProjectsFromVault — array coerce", () => {
  it("tags / stack / dependencies — array 입력 그대로", () => {
    const projects = deriveProjectsFromVault(
      makeManifest([
        makeDoc({
          slug: "projects/foo",
          frontmatter: {
            kind: "project",
            tags: ["a", "b"],
            stack: ["nextjs"],
            dependencies: ["other-proj"],
          },
        }),
      ]),
    );
    expect(projects[0]!.tags).toEqual(["a", "b"]);
    expect(projects[0]!.stack).toEqual(["nextjs"]);
    expect(projects[0]!.dependencies).toEqual(["other-proj"]);
  });

  it("comma-separated string → split + trim", () => {
    const projects = deriveProjectsFromVault(
      makeManifest([
        makeDoc({
          slug: "projects/foo",
          frontmatter: { kind: "project", tags: " a , b ,c" },
        }),
      ]),
    );
    expect(projects[0]!.tags).toEqual(["a", "b", "c"]);
  });

  it("array 안 빈 / 비-string 항목 제외", () => {
    const projects = deriveProjectsFromVault(
      makeManifest([
        makeDoc({
          slug: "projects/foo",
          frontmatter: { kind: "project", tags: ["a", "", null, 42, "b"] },
        }),
      ]),
    );
    expect(projects[0]!.tags).toEqual(["a", "b"]);
  });
});

describe("deriveProjectsFromVault — isHub", () => {
  it("isHub: true → boolean true", () => {
    const projects = deriveProjectsFromVault(
      makeManifest([
        makeDoc({
          slug: "projects/foo",
          frontmatter: { kind: "project", isHub: true },
        }),
      ]),
    );
    expect(projects[0]!.isHub).toBe(true);
  });

  it("isHub: 'true' 문자열도 true (frontmatter YAML stringify 케이스)", () => {
    const projects = deriveProjectsFromVault(
      makeManifest([
        makeDoc({
          slug: "projects/foo",
          frontmatter: { kind: "project", isHub: "true" },
        }),
      ]),
    );
    expect(projects[0]!.isHub).toBe(true);
  });

  it("isHub 없으면 undefined (R15 honest derive — fabricated false 차단)", () => {
    const projects = deriveProjectsFromVault(
      makeManifest([
        makeDoc({ slug: "projects/foo", frontmatter: { kind: "project" } }),
      ]),
    );
    expect(projects[0]!.isHub).toBeUndefined();
  });
});
