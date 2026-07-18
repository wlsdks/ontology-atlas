import { describe, expect, it } from "vitest";
import { buildAgentHandoffSnippet } from "./agent-handoff-snippet";

describe("buildAgentHandoffSnippet", () => {
  it("embeds the project slug into the get_concept and project_map calls", () => {
    const snippet = buildAgentHandoffSnippet("ontology-atlas");
    expect(snippet).toContain('get_concept("ontology-atlas")');
    expect(snippet).toContain('project:"ontology-atlas"');
    expect(snippet).toContain("containment_tree");
  });

  it("is a 3-line arrow chain (readable as a single copy payload)", () => {
    const snippet = buildAgentHandoffSnippet("foo");
    expect(snippet.split("\n")).toHaveLength(3);
  });
});
