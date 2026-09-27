import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildConceptEgo, matchNodeId } from "./build-concept-ego";

function node(id: string, kind: string, title: string, slug = title): KnowledgeGraphNode {
  return {
    id,
    title,
    display: title,
    kind,
    projectIds: [],
    evidenceIds: [slug],
    hasOwnDocument: true,
    agentSlug: slug,
    ref: null,
    lastApprovedAt: "",
    lastApprovedBy: "",
    summary: null,
  } as unknown as KnowledgeGraphNode;
}

function edge(from: string, to: string, type: KnowledgeGraphEdge["type"]): KnowledgeGraphEdge {
  return {
    id: `${from}--${type}-->${to}`,
    from,
    to,
    type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: "",
    lastApprovedBy: "",
  } as unknown as KnowledgeGraphEdge;
}

const NODES = [
  node("domain:shell", "domain", "온보딩·배포·앱 셸", "domains/shell"),
  node("capability:mcp", "capability", "MCP 서버", "capabilities/mcp-server"),
  node("element:rail", "element", "App Nav Rail", "elements/app-nav-rail"),
  node("element:tabs", "element", "Bottom Tab Bar", "elements/bottom-tab-bar"),
];

const EDGES = [
  edge("domain:shell", "element:rail", "contains"),
  edge("domain:shell", "element:tabs", "contains"),
  edge("capability:mcp", "domain:shell", "is_a"),
  edge("capability:mcp", "element:rail", "depends_on"),
];

describe("buildConceptEgo relation direction", () => {
  it("files an incoming contains under containers, not contents", () => {
    const ego = buildConceptEgo("element:rail", NODES, EDGES);
    expect(ego).not.toBeNull();
    expect(ego!.neighbors.belongsTo.map((n) => n.id)).toContain("domain:shell");
    expect(ego!.neighbors.contains).toHaveLength(0);
  });

  it("files an outgoing contains under contents", () => {
    const ego = buildConceptEgo("domain:shell", NODES, EDGES)!;
    expect(ego.neighbors.contains.map((n) => n.id).sort()).toEqual([
      "element:rail",
      "element:tabs",
    ]);
    expect(ego.neighbors.belongsTo.map((n) => n.id)).toEqual(["capability:mcp"]);
  });

  it("splits depends_on into dependencies and dependants by direction", () => {
    const from = buildConceptEgo("capability:mcp", NODES, EDGES)!;
    expect(from.neighbors.dependsOn.map((n) => n.id)).toEqual(["element:rail"]);
    const to = buildConceptEgo("element:rail", NODES, EDGES)!;
    expect(to.neighbors.usedBy.map((n) => n.id)).toEqual(["capability:mcp"]);
  });

  it("counts a repeated neighbour once", () => {
    const dup = [...EDGES, edge("domain:shell", "element:rail", "contains")];
    const ego = buildConceptEgo("domain:shell", NODES, dup)!;
    expect(ego.neighbors.contains).toHaveLength(2);
    expect(ego.total).toBe(3);
  });

  it("takes the domain name from the belongsTo domain neighbour", () => {
    expect(buildConceptEgo("element:rail", NODES, EDGES)!.domainLabel).toBe("온보딩·배포·앱 셸");
    // A domain has no parent domain of its own — an empty cell is the right answer.
    expect(buildConceptEgo("domain:shell", NODES, EDGES)!.domainLabel).toBeNull();
  });

  it("returns null for a node missing from the graph", () => {
    expect(buildConceptEgo("element:nope", NODES, EDGES)).toBeNull();
  });
});

describe("matchNodeId maps a committed file to a graph node", () => {
  it("matches by frontmatter slug", () => {
    expect(matchNodeId({ slug: "capabilities/mcp-server", kind: "capability" }, NODES)).toBe(
      "capability:mcp",
    );
  });

  it("matches a deleted file with an empty kind by its evidence slug", () => {
    expect(matchNodeId({ slug: "elements/app-nav-rail", kind: null }, NODES)).toBe("element:rail");
  });

  it("returns null for a file that is not a vault concept", () => {
    expect(matchNodeId({ slug: "README", kind: null }, NODES)).toBeNull();
  });
});
