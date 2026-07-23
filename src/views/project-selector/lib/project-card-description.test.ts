import { describe, expect, it } from "vitest";
import type { VaultDoc } from "@/entities/docs-vault";
import { resolveProjectCardDescription } from "./project-card-description";

function doc(frontmatter: Record<string, unknown>): VaultDoc {
  return {
    slug: "ontology-atlas",
    path: "docs/ontology/project.md",
    title: "ontology-atlas",
    tags: [],
    frontmatter,
    headings: [],
    excerpt: "정체성 (2026-07): agent-native, human-sovereign — internal positioning copy leaking in.",
    description: "",
    wordCount: 0,
    updatedAt: "2026-07-17T00:00:00.000Z",
    linksOut: [],
  } as unknown as VaultDoc;
}

describe("resolveProjectCardDescription", () => {
  it("returns the explicit frontmatter description when the user wrote one", () => {
    expect(resolveProjectCardDescription(doc({ description: "A local-first ontology workbench." }))).toBe(
      "A local-first ontology workbench.",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(resolveProjectCardDescription(doc({ description: "  Trimmed.  " }))).toBe("Trimmed.");
  });

  it("returns null when frontmatter has no description — never falls back to the body excerpt", () => {
    expect(resolveProjectCardDescription(doc({}))).toBeNull();
  });

  it("returns null for a blank description string", () => {
    expect(resolveProjectCardDescription(doc({ description: "   " }))).toBeNull();
  });

  it("returns null for a non-string description value", () => {
    expect(resolveProjectCardDescription(doc({ description: 42 }))).toBeNull();
  });

  it("returns null when no doc is found for the project slug", () => {
    expect(resolveProjectCardDescription(undefined)).toBeNull();
  });
});
