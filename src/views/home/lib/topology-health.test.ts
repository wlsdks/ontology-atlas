import { describe, expect, it } from "vitest";

import { filterOntologyConnectedOrphans } from "./topology-health";

/**
 * A project root owning domains through `contains` is not an orphan, under both spellings
 * (bare slug and `project:` prefix), or the health chip's first item is a false positive.
 */
const project = (slug: string) => ({ slug }) as { slug: string };

describe("filterOntologyConnectedOrphans", () => {
  it("drops projects that participate in ontology edges (bare slug)", () => {
    const result = filterOntologyConnectedOrphans(
      [project("ontology-atlas"), project("island")],
      [{ from: "ontology-atlas", to: "domain:views" }],
    );
    expect(result.map((p) => p.slug)).toEqual(["island"]);
  });

  it("drops projects referenced with the project: prefix", () => {
    const result = filterOntologyConnectedOrphans(
      [project("ontology-atlas")],
      [{ from: "domain:views", to: "project:ontology-atlas" }],
    );
    expect(result).toEqual([]);
  });

  it("keeps genuinely unconnected projects", () => {
    const result = filterOntologyConnectedOrphans(
      [project("island")],
      [{ from: "domain:views", to: "capability:x" }],
    );
    expect(result.map((p) => p.slug)).toEqual(["island"]);
  });

  it("returns the input untouched when there are no ontology edges", () => {
    const orphans = [project("a"), project("b")];
    expect(filterOntologyConnectedOrphans(orphans, [])).toEqual(orphans);
  });
});
