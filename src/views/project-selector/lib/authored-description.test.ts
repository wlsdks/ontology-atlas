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

  // The list draws one line, and a paragraph-length description was cut by the clamp at whatever
  // pixel the row ran out of. The hero has taken the first sentence since 2026-07-26; so does this.
  it("문단짜리 설명은 첫 문장에서 끝난다", () => {
    const paragraph =
      "Not a real company: an example built so that a first-time visitor can learn how to read the map. " +
      "It draws a small online store that ships physical goods out of a single warehouse.";
    expect(resolveAuthoredDescription(doc({ description: paragraph }))).toBe(
      "Not a real company: an example built so that a first-time visitor can learn how to read the map.",
    );
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
