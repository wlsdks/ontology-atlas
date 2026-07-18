import { describe, expect, it } from "vitest";
import { resolveActiveNavRailItem } from "./resolve-active-item";

describe("resolveActiveNavRailItem", () => {
  it("matches root and /topology to map", () => {
    expect(resolveActiveNavRailItem("/")).toBe("map");
    expect(resolveActiveNavRailItem("/topology")).toBe("map");
    expect(resolveActiveNavRailItem("/topology/")).toBe("map");
  });

  it("matches /docs to docs", () => {
    expect(resolveActiveNavRailItem("/docs")).toBe("docs");
    expect(resolveActiveNavRailItem("/docs/")).toBe("docs");
  });

  it("matches /ontology/edit to builder, not the generic /ontology prefix", () => {
    expect(resolveActiveNavRailItem("/ontology/edit")).toBe("builder");
    expect(resolveActiveNavRailItem("/ontology/edit/")).toBe("builder");
  });

  it("matches /ontology/insights to insights", () => {
    expect(resolveActiveNavRailItem("/ontology/insights/")).toBe("insights");
  });

  it("matches /projects and /project/[slug] to projects", () => {
    expect(resolveActiveNavRailItem("/projects/")).toBe("projects");
    expect(resolveActiveNavRailItem("/project/foo")).toBe("projects");
  });

  it("does not treat the bare /ontology redirect page as any rail item (it thin-redirects to /topology)", () => {
    // /ontology/ itself (no /edit or /insights suffix) isn't one of the 5
    // rail destinations — it immediately redirects, so highlighting nothing
    // is more honest than guessing.
    expect(resolveActiveNavRailItem("/ontology/")).toBeNull();
  });

  it("returns null for unrelated routes", () => {
    expect(resolveActiveNavRailItem("/download/")).toBeNull();
  });

  it("falls back to / behavior for an empty pathname", () => {
    expect(resolveActiveNavRailItem("")).toBe("map");
  });
});
