import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "../model";
import {
  buildInsightsReturnMarker,
  buildTopologyReturnHref,
  buildTopologyReturnMarker,
  parseTopologyReturnMarker,
  buildTopologyMeaningEditorNodeHref,
  buildTopologyMeaningEditorEdgeHref,
  buildOntologyInsightsNodeHref,
  buildOntologyInsightsReturnHref,
  buildOntologyNodeHref,
  edgeAuthoredByFromNode,
  parseInsightsReturnMarker,
  parseOntologyMeaningEditParam,
  resolveOntologyBuilderNodeSlug,
  resolveOntologyBuilderNodeSlugFromGraphId,
  meaningEditRelationForEdgeType,
} from "./ontology-node-href";

describe("buildOntologyNodeHref", () => {
  it("builds an href for a kind:slug node id", () => {
    expect(buildOntologyNodeHref("domain:ontology-core")).toBe(
      `/ontology/?node=${encodeURIComponent("domain:ontology-core")}`,
    );
    expect(buildOntologyNodeHref("project:reactor")).toBe(
      `/ontology/?node=${encodeURIComponent("project:reactor")}`,
    );
  });

  it("escapes special characters and Hangul", () => {
    expect(buildOntologyNodeHref("project:한글")).toBe(
      `/ontology/?node=${encodeURIComponent("project:한글")}`,
    );
    expect(buildOntologyNodeHref("a/b:c d")).toBe(
      `/ontology/?node=${encodeURIComponent("a/b:c d")}`,
    );
  });

  it("returns an empty id unchanged", () => {
    expect(buildOntologyNodeHref("")).toBe("/ontology/?node=");
  });

  it("appends an encoded via marker", () => {
    expect(
      buildOntologyNodeHref("domain:views", { via: "insights:structure" }),
    ).toBe(
      `/ontology/?node=${encodeURIComponent("domain:views")}&via=${encodeURIComponent("insights:structure")}`,
    );
    // Without `via` the link is unchanged.
    expect(buildOntologyNodeHref("domain:views")).toBe(
      `/ontology/?node=${encodeURIComponent("domain:views")}`,
    );
  });

  it("keeps the review row id in the return context", () => {
    expect(
      buildOntologyNodeHref("domain:views", {
        via: "insights:do-next",
        reviewId: "neglected-hub:domain:views",
      }),
    ).toBe(
      `/ontology/?node=${encodeURIComponent("domain:views")}` +
        `&via=${encodeURIComponent("insights:do-next")}` +
        `&review=${encodeURIComponent("neglected-hub:domain:views")}`,
    );
    expect(
      buildOntologyNodeHref("domain:views", {
        reviewId: "orphan:domain:views",
      }),
    ).toBe(`/ontology/?node=${encodeURIComponent("domain:views")}`);
  });
});

describe("insights return marker", () => {
  it("round-trips build and parse", () => {
    expect(parseInsightsReturnMarker(buildInsightsReturnMarker("do-next"))).toBe(
      "do-next",
    );
    expect(
      parseInsightsReturnMarker(buildInsightsReturnMarker("structure")),
    ).toBe("structure");
  });

  it("returns null for a string outside the marker grammar", () => {
    expect(parseInsightsReturnMarker(null)).toBeNull();
    expect(parseInsightsReturnMarker("")).toBeNull();
    expect(parseInsightsReturnMarker("insights")).toBeNull();
    expect(parseInsightsReturnMarker("elsewhere:structure")).toBeNull();
    expect(parseInsightsReturnMarker("insights:UPPER")).toBeNull();
  });

  it("points the return href at the original insights tab", () => {
    expect(buildOntologyInsightsReturnHref("freshness")).toBe(
      "/ontology/insights/?tab=freshness",
    );
    expect(
      buildOntologyInsightsReturnHref(
        "do-next",
        "neglected-hub:capability:mcp-server",
      ),
    ).toBe(
      "/ontology/insights/?tab=do-next&review=neglected-hub%3Acapability%3Amcp-server",
    );
  });

});

describe("resolveOntologyBuilderNodeSlug", () => {
  function node(overrides: Partial<KnowledgeGraphNode>): KnowledgeGraphNode {
    return {
      id: "capability:mcp-server",
      title: "MCP Server",
      kind: "capability",
      projectIds: [],
      evidenceIds: [],
      lastApprovedAt: new Date(0),
      lastApprovedBy: "test",
      ...overrides,
    };
  }

  it("uses the vault source slug as the focus query", () => {
    const selected = node({
      id: "capability:mcp-server",
      evidenceIds: ["capabilities/mcp-server"],
    });

    expect(resolveOntologyBuilderNodeSlug(selected)).toBe(
      "capabilities/mcp-server",
    );
  });

  it("normalizes an evidence slug with an ontology/ prefix", () => {
    const selected = node({
      evidenceIds: ["ontology/elements/parser"],
      kind: "element",
    });

    expect(resolveOntologyBuilderNodeSlug(selected)).toBe("elements/parser");
  });

  it("falls back from a legacy kind:id to the canonical vault folder", () => {
    expect(
      resolveOntologyBuilderNodeSlug(
        node({ id: "domain:views", kind: "domain" }),
      ),
    ).toBe("domains/views");
    expect(
      resolveOntologyBuilderNodeSlug(
        node({ id: "element:parser", kind: "element" }),
      ),
    ).toBe("elements/parser");
  });

  it("keeps a slash-based vault id", () => {
    expect(
      resolveOntologyBuilderNodeSlug(
        node({ id: "capabilities/topology-analysis-modes" }),
      ),
    ).toBe("capabilities/topology-analysis-modes");
  });

  it("project nodes use the frontmatter slug alias instead of the source file name", () => {
    expect(
      resolveOntologyBuilderNodeSlug(
        node({
          id: "project:ontology-atlas",
          kind: "project",
          evidenceIds: ["ontology/project"],
        }),
      ),
    ).toBe("ontology-atlas");
    expect(
      buildOntologyInsightsNodeHref(
        node({
          id: "project:ontology-atlas",
          kind: "project",
          evidenceIds: ["ontology/project"],
        }),
      ),
    ).toBe(
      `/ontology/insights/?node=${encodeURIComponent("ontology-atlas")}`,
    );
  });
});

describe("buildTopologyMeaningEditorNodeHref", () => {
  // Map-editor links always use canonical `<kind>:<slug>`.
  it("passes a canonical graph id through", () => {
    expect(resolveOntologyBuilderNodeSlugFromGraphId("domain:views")).toBe(
      "domains/views",
    );
    expect(
      buildTopologyMeaningEditorNodeHref("capability:topology-analysis-modes"),
    ).toBe(
      `/topology/?p=${encodeURIComponent(
        "capability:topology-analysis-modes",
      )}&workbench=edit`,
    );
    expect(
      buildTopologyMeaningEditorNodeHref(
        "capability:topology-analysis-modes",
        {
          via: "insights:do-next",
          reviewId: "promotion:element:x",
        },
      ),
    ).toBe(
      `/topology/?p=${encodeURIComponent(
        "capability:topology-analysis-modes",
      )}&workbench=edit&via=${encodeURIComponent("insights:do-next")}` +
        `&review=${encodeURIComponent("promotion:element:x")}`,
    );
  });

  it("passes a project graph id as `project:<slug>`", () => {
    expect(resolveOntologyBuilderNodeSlugFromGraphId("project:ontology-atlas")).toBe(
      "ontology-atlas",
    );
    expect(buildTopologyMeaningEditorNodeHref("project:ontology-atlas")).toBe(
      `/topology/?p=${encodeURIComponent("project:ontology-atlas")}&workbench=edit`,
    );
  });

  it("promotes multi-slash and ontology-prefixed folder ids to canonical", () => {
    expect(
      resolveOntologyBuilderNodeSlugFromGraphId(
        "ontology/capabilities/topology-analysis-modes",
      ),
    ).toBe("capabilities/topology-analysis-modes");
    expect(
      buildTopologyMeaningEditorNodeHref("capabilities/topology-analysis-modes"),
    ).toBe(
      `/topology/?p=${encodeURIComponent(
        "capability:topology-analysis-modes",
      )}&workbench=edit`,
    );
  });
});

describe("meaningEditRelationForEdgeType", () => {
  it("maps the four editable bearings (+ frontmatter-key aliases)", () => {
    expect(meaningEditRelationForEdgeType("is_a")).toBe("isA");
    expect(meaningEditRelationForEdgeType("depends_on")).toBe("dependsOn");
    expect(meaningEditRelationForEdgeType("dependencies")).toBe("dependsOn");
    expect(meaningEditRelationForEdgeType("contains")).toBe("contains");
    expect(meaningEditRelationForEdgeType("related_to")).toBe("relates");
    expect(meaningEditRelationForEdgeType("relates")).toBe("relates");
    expect(meaningEditRelationForEdgeType("uses")).toBe("relates");
    expect(meaningEditRelationForEdgeType("implements")).toBe("relates");
  });

  it("returns null for edge types outside the four bearings — no dead action", () => {
    // describes / belongs_to / domain-membership are not editable in the map editor.
    expect(meaningEditRelationForEdgeType("describes")).toBeNull();
    expect(meaningEditRelationForEdgeType("belongs_to")).toBeNull();
    expect(meaningEditRelationForEdgeType("domain")).toBeNull();
    expect(meaningEditRelationForEdgeType("")).toBeNull();
    expect(meaningEditRelationForEdgeType("whatever")).toBeNull();
  });
});

describe("edgeAuthoredByFromNode (Slice 6 — direction / authorship)", () => {
  it("true when the declaring doc slug is the from node's own source slug", () => {
    expect(edgeAuthoredByFromNode("capabilities/mcp-server", "capabilities/mcp-server")).toBe(true);
  });

  it("strips an ontology/ prefix on either side (dogfood vs local vault)", () => {
    expect(edgeAuthoredByFromNode("ontology/domains/views", "domains/views")).toBe(true);
    expect(edgeAuthoredByFromNode("domains/views", "ontology/domains/views")).toBe(true);
  });

  it("false when the edge was declared by the OTHER node (reverse-derived contains)", () => {
    // domain-membership `contains`: from = domain, declaredBy = child.
    expect(edgeAuthoredByFromNode("capabilities/child", "domains/views")).toBe(false);
  });

  it("false for missing slugs", () => {
    expect(edgeAuthoredByFromNode(null, "domains/views")).toBe(false);
    expect(edgeAuthoredByFromNode("domains/views", undefined)).toBe(false);
    expect(edgeAuthoredByFromNode("", "")).toBe(false);
  });
});

describe("buildTopologyMeaningEditorEdgeHref", () => {
  it("carries focal (from) + edit=<relation>:<target>, both canonical", () => {
    expect(
      buildTopologyMeaningEditorEdgeHref("capability:token-issue", "capability:jwt", "dependsOn"),
    ).toBe(
      `/topology/?p=${encodeURIComponent("capability:token-issue")}&workbench=edit&edit=dependsOn:${encodeURIComponent("capability:jwt")}`,
    );
  });

  it("promotes folder-prefixed ids to canonical <kind>:<slug> like the node variant", () => {
    expect(
      buildTopologyMeaningEditorEdgeHref("capabilities/parent", "elements/parser", "contains"),
    ).toBe(
      `/topology/?p=${encodeURIComponent("capability:parent")}&workbench=edit&edit=contains:${encodeURIComponent("element:parser")}`,
    );
  });

  it("emits each relation with a single relation-colon before the encoded target", () => {
    for (const rel of ["isA", "dependsOn", "contains", "relates"] as const) {
      const href = buildTopologyMeaningEditorEdgeHref("capability:a", "capability:b", rel);
      // relation colon is literal; the target's own kind:slug colon is encoded.
      expect(href).toContain(`&edit=${rel}:${encodeURIComponent("capability:b")}`);
    }
  });

  it("round-trips through parseOntologyMeaningEditParam (first-colon split keeps kind:slug)", () => {
    const href = buildTopologyMeaningEditorEdgeHref("capability:a", "capability:b", "isA");
    const raw = new URL(href, "https://x").searchParams.get("edit");
    expect(parseOntologyMeaningEditParam(raw)).toEqual({ relation: "isA", targetId: "capability:b" });
  });
});

describe("parseOntologyMeaningEditParam", () => {
  it("splits on the FIRST colon so the target's kind:slug colon survives", () => {
    expect(parseOntologyMeaningEditParam("dependsOn:capability:jwt")).toEqual({
      relation: "dependsOn",
      targetId: "capability:jwt",
    });
    expect(parseOntologyMeaningEditParam("contains:element:parser")).toEqual({
      relation: "contains",
      targetId: "element:parser",
    });
  });

  it("rejects an unknown relation, malformed, or empty value", () => {
    expect(parseOntologyMeaningEditParam("belongsTo:capability:x")).toBeNull();
    expect(parseOntologyMeaningEditParam("isA")).toBeNull();
    expect(parseOntologyMeaningEditParam(":capability:x")).toBeNull();
    expect(parseOntologyMeaningEditParam("relates:")).toBeNull();
    expect(parseOntologyMeaningEditParam("")).toBeNull();
    expect(parseOntologyMeaningEditParam(null)).toBeNull();
  });
});

describe("buildOntologyInsightsNodeHref", () => {
  it("uses the canonical vault slug for focused query proof", () => {
    const selected: KnowledgeGraphNode = {
      id: "capability:builder-vault-write",
      title: "Builder Vault Write",
      kind: "capability",
      projectIds: [],
      evidenceIds: ["ontology/capabilities/builder-vault-write"],
      lastApprovedAt: new Date(0),
      lastApprovedBy: "test",
    };

    expect(buildOntologyInsightsNodeHref(selected)).toBe(
      `/ontology/insights/?node=${encodeURIComponent(
        "capabilities/builder-vault-write",
      )}`,
    );
  });
});

describe("map return marker", () => {
  /* The marker returns the reader from `/docs/` to the node they left, not a bare map. */
  it("round-trips a marker to the same node", () => {
    const marker = buildTopologyReturnMarker("capability:mcp-server");
    expect(marker).toBe("topology:capability:mcp-server");
    expect(parseTopologyReturnMarker(marker)).toBe("capability:mcp-server");
  });

  it("normalizes folder notation to the canonical id used by `?p=`", () => {
    expect(buildTopologyReturnMarker("capabilities/mcp-server")).toBe(
      "topology:capability:mcp-server",
    );
  });

  it("rejects a via in another grammar", () => {
    expect(parseTopologyReturnMarker("insights:do-next")).toBeNull();
    expect(parseTopologyReturnMarker(null)).toBeNull();
    expect(parseTopologyReturnMarker("")).toBeNull();
  });

  it("returns to the map with that node selected", () => {
    expect(buildTopologyReturnHref("capability:mcp-server")).toBe(
      "/topology/?p=capability%3Amcp-server",
    );
  });
});
