import { describe, expect, it } from "vitest";
import type { TreeInputEdge, TreeInputNode } from "./containment-tree";
import { readDomainUsage } from "./domain-usage";

const nodes: TreeInputNode[] = [
  { id: "p", label: "P", kind: "project" },
  { id: "d/meaning", label: "Meaning", kind: "domain" },
  { id: "d/agent", label: "Agent", kind: "domain" },
  { id: "d/code", label: "Code", kind: "domain" },
  { id: "c/graph", label: "Graph", kind: "capability" },
  { id: "c/mcp", label: "MCP", kind: "capability" },
  { id: "c/scan", label: "Scan", kind: "capability" },
  { id: "e/tool", label: "Tool", kind: "element" },
];
const contains = (source: string, target: string): TreeInputEdge => ({ source, target, kind: "contains", relationType: "contains" });
const dependsOn = (source: string, target: string): TreeInputEdge => ({ source, target, kind: "depends", relationType: "depends_on" });
const edges: TreeInputEdge[] = [
  contains("p", "d/meaning"), contains("p", "d/agent"), contains("p", "d/code"),
  contains("d/meaning", "c/graph"), contains("d/agent", "c/mcp"), contains("d/code", "c/scan"),
  contains("c/mcp", "e/tool"),
  dependsOn("c/mcp", "c/graph"), dependsOn("e/tool", "c/graph"), dependsOn("c/scan", "c/graph"),
  dependsOn("c/graph", "c/scan"), dependsOn("c/graph", "c/graph"),
];

describe("readDomainUsage", () => {
  it("rolls element and capability links up to the domains that use and are needed", () => {
    expect(readDomainUsage(nodes, edges, "d/meaning")).toEqual({
      usedBy: [
        { domainId: "d/agent", label: "Agent", links: 2 },
        { domainId: "d/code", label: "Code", links: 1 },
      ],
      needs: [{ domainId: "d/code", label: "Code", links: 1 }],
    });
  });

  it("answers null for a concept that is not a domain", () => {
    expect(readDomainUsage(nodes, edges, "c/graph")).toBeNull();
  });
});
