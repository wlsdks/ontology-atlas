import { describe, expect, it } from "vitest";
import { buildNavRailContextHrefs } from "./nav-rail-context-hrefs";

describe("buildNavRailContextHrefs", () => {
  it("wraps a selected node's document href under the 'docs' key", () => {
    expect(buildNavRailContextHrefs("/docs/?slug=capabilities/mcp-server")).toEqual({
      docs: "/docs/?slug=capabilities/mcp-server",
    });
  });

  it("returns null when there is no selection (no document href)", () => {
    expect(buildNavRailContextHrefs(null)).toBeNull();
  });
});
