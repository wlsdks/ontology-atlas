import { describe, expect, it } from "vitest";

import { createDefaultsFromSelection } from "./create-defaults";

describe("create defaults from the map selection", () => {
  it("puts a new capability inside a selected domain", () => {
    expect(createDefaultsFromSelection({ kind: "domain", ref: "domains/billing", domainRef: null })).toEqual({
      kind: "capability",
      parent: "domains/billing",
    });
  });

  it("puts a new element under the domain of a selected capability", () => {
    expect(
      createDefaultsFromSelection({ kind: "capability", ref: "capabilities/refund", domainRef: "billing" }),
    ).toEqual({ kind: "element", parent: "billing" });
    expect(
      createDefaultsFromSelection({ kind: "capability", ref: "capabilities/refund", domainRef: "domains/billing" }),
    ).toEqual({ kind: "element", parent: "domains/billing" });
  });

  it("suggests a domain with no parent under a selected project", () => {
    expect(createDefaultsFromSelection({ kind: "project", ref: "atlas", domainRef: null })).toEqual({
      kind: "domain",
      parent: "",
    });
  });

  it("starts from a capability with no parent when nothing is selected", () => {
    expect(createDefaultsFromSelection(null)).toEqual({ kind: "capability", parent: "" });
  });
});
