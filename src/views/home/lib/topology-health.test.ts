import { describe, expect, it } from "vitest";

import { filterOntologyConnectedOrphans } from "./topology-health";

/**
 * Health-chip signal quality: the project-deps lens cannot see ontology
 * containment, so a project root that owns domains and capabilities through
 * `contains` becomes a false "unattached" positive and destroys trust in the
 * chip on the first click. Projects taking part in an ontology edge in either
 * direction are excluded from orphans, under both spellings (bare slug and
 * `project:` prefix).
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
