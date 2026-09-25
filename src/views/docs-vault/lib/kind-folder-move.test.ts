import { describe, expect, it } from "vitest";

import { kindFolderAddress, reclassifyMoveTarget } from "./kind-folder-move";

describe("kindFolderAddress", () => {
  it("names the kind's folder, keeping the file name", () => {
    expect(kindFolderAddress("capabilities/agent-work-visibility", "element")).toBe(
      "elements/agent-work-visibility",
    );
    expect(kindFolderAddress("stray-capability", "capability")).toBe("capabilities/stray-capability");
    expect(kindFolderAddress("notes/idea", "domain")).toBe("domains/idea");
  });

  it("keeps a subfolder vault in its subfolder", () => {
    expect(kindFolderAddress("ontology/capabilities/a", "element")).toBe("ontology/elements/a");
  });

  it("is null when the document is already there, or the kind keeps no folder", () => {
    expect(kindFolderAddress("elements/a", "element")).toBeNull();
    expect(kindFolderAddress("capabilities/a", "project")).toBeNull();
    expect(kindFolderAddress("capabilities/a", "document")).toBeNull();
  });
});

describe("reclassifyMoveTarget", () => {
  // Map-edit QA D8 (2026-09-26): the quick patch changed `kind:` and left the file behind.
  it("moves a document filed by its old kind into its new kind's folder", () => {
    expect(reclassifyMoveTarget("capabilities/agent-work-visibility", "capability", "element")).toBe(
      "elements/agent-work-visibility",
    );
  });

  it("leaves a document the person keeps elsewhere where it is", () => {
    expect(reclassifyMoveTarget("notes/agent-work-visibility", "capability", "element")).toBeNull();
    expect(reclassifyMoveTarget("agent-work-visibility", "capability", "element")).toBeNull();
  });

  it("does nothing without a real change of kind, or towards a kind with no folder", () => {
    expect(reclassifyMoveTarget("capabilities/a", "capability", "capability")).toBeNull();
    expect(reclassifyMoveTarget("capabilities/a", null, "element")).toBeNull();
    expect(reclassifyMoveTarget("capabilities/a", "capability", "document")).toBeNull();
  });
});
