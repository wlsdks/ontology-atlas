import { describe, expect, it } from "vitest";
import { childKindForParent } from "./builder-drop-to-add";

describe("childKindForParent", () => {
  it("walks the ontology hierarchy down one level", () => {
    expect(childKindForParent("project")).toBe("domain");
    expect(childKindForParent("domain")).toBe("capability");
    expect(childKindForParent("capability")).toBe("element");
  });

  it("keeps element as a sibling element (leaf has no deeper kind)", () => {
    expect(childKindForParent("element")).toBe("element");
  });

  it("falls back to capability for ephemeral or unknown parents", () => {
    expect(childKindForParent("ephemeral")).toBe("capability");
    expect(childKindForParent("")).toBe("capability");
  });
});
