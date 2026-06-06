import { describe, expect, it } from "vitest";
import { applyOwnerTintOverlay } from "./reducer-owner-tint";

const ownerTone = (ownerKey: string) => `owner:${ownerKey}`;

describe("applyOwnerTintOverlay", () => {
  it("tints plain project nodes by owner", () => {
    const attrs = {
      color: "kind:project",
      isHub: false,
      isOntology: false,
      ownerKey: "team-a",
    };

    expect(applyOwnerTintOverlay(attrs, ownerTone)).toEqual({
      ...attrs,
      color: "owner:team-a",
    });
  });

  it("preserves hub identity color", () => {
    const attrs = {
      color: "hub",
      isHub: true,
      isOntology: false,
      ownerKey: "team-a",
    };

    expect(applyOwnerTintOverlay(attrs, ownerTone)).toBe(attrs);
  });

  it("preserves ontology kind color so the semantic map stays readable", () => {
    const attrs = {
      color: "kind:capability",
      isHub: false,
      isOntology: true,
      ownerKey: "unassigned",
    };

    expect(applyOwnerTintOverlay(attrs, ownerTone)).toBe(attrs);
  });
});
