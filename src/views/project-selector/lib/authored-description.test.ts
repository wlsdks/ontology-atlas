import { describe, expect, it } from "vitest";
import type { VaultDoc } from "@/entities/docs-vault";
import { resolveAuthoredDescription } from "./authored-description";

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

describe("resolveAuthoredDescription", () => {
  it("returns the explicit frontmatter description when the user wrote one", () => {
    expect(resolveAuthoredDescription(doc({ description: "A local-first ontology workbench." }))).toBe(
      "A local-first ontology workbench.",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(resolveAuthoredDescription(doc({ description: "  Trimmed.  " }))).toBe("Trimmed.");
  });

  it("returns null when frontmatter has no description — never falls back to the body excerpt", () => {
    expect(resolveAuthoredDescription(doc({}))).toBeNull();
  });

  it("returns null for a blank description string", () => {
    expect(resolveAuthoredDescription(doc({ description: "   " }))).toBeNull();
  });

  it("returns null for a non-string description value", () => {
    expect(resolveAuthoredDescription(doc({ description: 42 }))).toBeNull();
  });

  it("returns null when no doc is found for the project slug", () => {
    expect(resolveAuthoredDescription(undefined)).toBeNull();
  });
});
