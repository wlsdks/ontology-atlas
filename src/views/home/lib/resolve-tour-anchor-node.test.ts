import { describe, expect, it } from "vitest";
import { resolveTourAnchorNodeId } from "./resolve-tour-anchor-node";

describe("resolveTourAnchorNodeId", () => {
  it("target 'project': picks the first project node", () => {
    const nodes = [
      { id: "domain:a", kind: "domain", isHub: false },
      { id: "project:root", kind: "project", isHub: true },
    ];
    expect(resolveTourAnchorNodeId(nodes, "project")).toBe("project:root");
  });

  it("target 'project': falls back to the first domain node when there's no project", () => {
    const nodes = [
      { id: "domain:a", kind: "domain", isHub: false },
      { id: "capability:b", kind: "capability", isHub: false },
    ];
    expect(resolveTourAnchorNodeId(nodes, "project")).toBe("domain:a");
  });

  it("target 'project': returns null when there is neither a project nor a domain", () => {
    const nodes = [{ id: "capability:b", kind: "capability", isHub: false }];
    expect(resolveTourAnchorNodeId(nodes, "project")).toBeNull();
  });

  it("target 'domain': picks the first domain node", () => {
    const nodes = [
      { id: "project:root", kind: "project", isHub: false },
      { id: "domain:a", kind: "domain", isHub: false },
      { id: "domain:b", kind: "domain", isHub: false },
    ];
    expect(resolveTourAnchorNodeId(nodes, "domain")).toBe("domain:a");
  });

  // Regression guard for the 2026-07-23 correction: an `isHub` node folds into
  // a "+N" cluster chip in the spine view, so clicking it expands the cluster (a
  // full relayout into element view) instead of selecting. No target may prefer
  // a hub over a domain or project.
  it("target 'domain': never prefers an isHub capability over a spine-visible domain", () => {
    const nodes = [
      { id: "capability:mcp-server", kind: "capability", isHub: true },
      { id: "project:root", kind: "project", isHub: false },
      { id: "domain:a", kind: "domain", isHub: false },
    ];
    expect(resolveTourAnchorNodeId(nodes, "domain")).toBe("domain:a");
  });

  it("target 'domain': falls back to the project when there's no domain", () => {
    const nodes = [
      { id: "capability:b", kind: "capability", isHub: true },
      { id: "project:root", kind: "project", isHub: false },
    ];
    expect(resolveTourAnchorNodeId(nodes, "domain")).toBe("project:root");
  });

  it("returns null for an empty node list", () => {
    expect(resolveTourAnchorNodeId([], "domain")).toBeNull();
  });
});
