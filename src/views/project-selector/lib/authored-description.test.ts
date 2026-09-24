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

  // The flagship carries its definition as the body's first sentence and no `description:` key; the
  // hero drew it while the list said "no description yet". A sentence that names the project is the
  // definition the construction card asks for, and the list takes it whole.
  it("takes the body's first sentence when it names the project", () => {
    const withDefinition = {
      ...doc({}),
      excerpt:
        "Ontology Atlas is a local-first workbench that keeps one reviewable Markdown record of what this codebase builds, why it has its current boundaries, and what a change would affect. The meaning record lives as Mark",
    } as VaultDoc;
    expect(resolveAuthoredDescription(withDefinition, { name: "Ontology Atlas", displayNames: { ko: "온톨로지 아틀라스" } })).toBe(
      "Ontology Atlas is a local-first workbench that keeps one reviewable Markdown record of what this codebase builds, why it has its current boundaries, and what a change would affect.",
    );
  });

  it("still refuses a body that opens with something other than the project's definition", () => {
    expect(resolveAuthoredDescription(doc({}), { name: "Ontology Atlas" })).toBeNull();
    const cut = { ...doc({}), excerpt: "Ontology Atlas is a workbench that keeps one record of what this codebase bui" } as VaultDoc;
    expect(resolveAuthoredDescription(cut, { name: "Ontology Atlas" })).toBeNull();
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
