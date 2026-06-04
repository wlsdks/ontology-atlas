import { describe, expect, it } from "vitest";
import { buildSavedRelationHandoff } from "./saved-relation-handoff";

describe("buildSavedRelationHandoff", () => {
  it("builds the saved relation proof payload from persisted endpoint info", () => {
    expect(
      buildSavedRelationHandoff({
        source: { slug: "domains/views", kind: "domain" },
        target: { slug: "capabilities/builder-canvas-polish", kind: "capability" },
      }),
    ).toEqual({
      sourceSlug: "domains/views",
      targetSlug: "capabilities/builder-canvas-polish",
      sourceKind: "domain",
      targetKind: "capability",
      inferredKey: "capabilities",
      selectedKey: "capabilities",
    });
  });

  it("keeps capability child saves focused on the elements relation", () => {
    expect(
      buildSavedRelationHandoff({
        source: { slug: "capabilities/builder-canvas-polish", kind: "capability" },
        target: { slug: "elements/builder-command-strip", kind: "element" },
      }),
    ).toMatchObject({
      inferredKey: "elements",
      selectedKey: "elements",
    });
  });
});
