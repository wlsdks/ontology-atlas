import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildDuplicatePairs, scoreNodeSimilarity, similarityTokens } from "./duplicate-pairs";

function node(
  id: string,
  kind: string,
  title: string,
  slug = id.split(":").pop() ?? id,
): KnowledgeGraphNode {
  return {
    id,
    title,
    kind,
    projectIds: [],
    evidenceIds: [slug],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault-frontmatter",
  };
}
function edge(id: string, from: string, to: string, type: string): KnowledgeGraphEdge {
  return {
    id,
    from,
    to,
    type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault-frontmatter",
  };
}

describe("similarityTokens", () => {
  it("keeps lowercase alphanumeric runs and drops single characters", () => {
    expect(similarityTokens("Ontology-Drawer v2 a")).toEqual(["ontology", "drawer", "v2"]);
  });
});

describe("scoreNodeSimilarity", () => {
  it("scores 1 when name, kind, domain and neighbours all match", () => {
    const shared = {
      slug: "elements/drawer",
      title: "Node drawer",
      kind: "capability",
      domain: "domains/map",
    };
    const neighbors = new Set(["n1"]);
    expect(
      scoreNodeSimilarity({ ...shared, neighbors }, { ...shared, neighbors }).total,
    ).toBe(1);
  });

  it("gives no domain score to two nodes without a domain", () => {
    const left = { slug: "a", title: "A", kind: "element", domain: null, neighbors: new Set<string>() };
    expect(scoreNodeSimilarity(left, { ...left }).domain).toBe(0);
  });
});

describe("buildDuplicatePairs", () => {
  const nodes = [
    node("domain:map", "domain", "Map", "domains/map"),
    node("element:node-drawer", "element", "Node drawer", "elements/node-drawer"),
    node("element:node-drawer-model", "element", "Node drawer model", "elements/node-drawer-model"),
    node("element:camera-easing", "element", "Camera easing", "elements/camera-easing"),
  ];
  const edges = [
    edge("c1", "domain:map", "element:node-drawer", "contains"),
    edge("c2", "domain:map", "element:node-drawer-model", "contains"),
    edge("c3", "domain:map", "element:camera-easing", "contains"),
  ];

  it("lists only pairs with a large name overlap and keeps the better connected node", () => {
    const { rows, suspectCount } = buildDuplicatePairs(nodes, edges, 5);

    expect(rows).toHaveLength(1);
    expect(suspectCount).toBe(1);
    expect(rows[0].keepSlug).toBe("elements/node-drawer");
    expect(rows[0].dissolveSlug).toBe("elements/node-drawer-model");
    expect(rows[0].kind).toBe("element");
    expect(rows[0].score).toBeGreaterThan(0.6);
    // The evidence is words a person reads; the shared folder word (`elements`) is removed.
    expect(rows[0].sharedTokens).toEqual(["drawer", "node"]);
  });

  it("keeps the full suspect count past the cap", () => {
    const { rows, suspectCount } = buildDuplicatePairs(nodes, edges, 0);
    expect(rows).toHaveLength(0);
    expect(suspectCount).toBe(1);
  });

  it("excludes a node without its own document, which has no file to merge", () => {
    // Derived nodes from code paths in another document's `elements:` belong to that document; a source file and its
    // test would otherwise top the list as a duplicate.
    const derived = [
      ...nodes,
      {
        ...node("element:scriptsfoomjs", "element", "Scripts foo"),
        evidenceIds: ["elements/node-drawer"],
        hasOwnDocument: false,
      },
      {
        ...node("element:scriptsfootestmjs", "element", "Scripts foo test"),
        evidenceIds: ["elements/node-drawer"],
        hasOwnDocument: false,
      },
    ];

    const { rows } = buildDuplicatePairs(derived, edges, 5);
    expect(rows.every((row) => !row.keepSlug.includes("scripts"))).toBe(true);
    expect(rows).toHaveLength(1);
  });

  it("keeps a project node whose id tail differs from its file name", () => {
    // A project id comes from frontmatter `slug:` (`project:ontology-atlas`), not the filename tail.
    const project: KnowledgeGraphNode = {
      ...node("project:ontology-atlas", "project", "Ontology Atlas"),
      evidenceIds: ["ontology/project"],
    };
    const twin: KnowledgeGraphNode = {
      ...node("project:ontology-atlas-2", "project", "Ontology Atlas"),
      evidenceIds: ["ontology/project-2"],
    };

    const { rows } = buildDuplicatePairs([project, twin], [], 5);
    expect(rows.map((row) => [row.keepSlug, row.dissolveSlug])).toEqual([
      ["ontology/project", "ontology/project-2"],
    ]);
  });

  it("makes no pair for an empty or single-node vault", () => {
    expect(buildDuplicatePairs([], [], 5).rows).toHaveLength(0);
    expect(buildDuplicatePairs([nodes[1]], [], 5).rows).toHaveLength(0);
  });

  it("falls back to comparing every pair when the threshold is reachable without a name match", () => {
    // Kind (0.1) plus parent (0.1) gives 0.2, so at this threshold a pair sharing no words is a candidate that an
    // index would miss.
    const { rows } = buildDuplicatePairs(nodes, edges, 20, 0.2);
    expect(rows.some((row) => row.sharedTokens.length === 0)).toBe(true);
  });

  it("counts multi-token pairs once and keeps the exact exhaustive prefix for unusual limits", () => {
    const generated = Array.from({ length: 18 }, (_, index) =>
      node(
        `capability:payment-handler-${index}`,
        "capability",
        `Payment handler ${index}`,
        `capabilities/payment-handler-${index}`,
      ),
    );
    const generatedEdges = generated.slice(1).map((entry, index) =>
      edge(`g${index}`, entry.id, generated[index].id, "depends_on"),
    );
    const exhaustive = buildDuplicatePairs(generated, generatedEdges, Infinity, 0.6, Infinity);

    expect(exhaustive.suspectCount).toBeGreaterThan(20);
    expect(exhaustive.rows).toHaveLength(exhaustive.suspectCount);
    expect(new Set(exhaustive.rows.map((row) => row.id)).size).toBe(exhaustive.suspectCount);
    for (const [limit, restLimit] of [
      [0, 0],
      [Number.NaN, 4],
      [5, Number.NaN],
      [1.8, 2.9],
      [5, 7],
      [Infinity, 0],
    ] as const) {
      const bounded = buildDuplicatePairs(generated, generatedEdges, limit, 0.6, restLimit);
      const shown = Math.max(0, limit);
      const folded = Math.max(0, restLimit);
      expect(bounded.suspectCount).toBe(exhaustive.suspectCount);
      expect(bounded.rows).toEqual(exhaustive.rows.slice(0, shown));
      expect(bounded.restRows).toEqual(exhaustive.rows.slice(shown, shown + folded));
    }
  });
});
