import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "../model";
import {
  buildInsightsReturnMarker,
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
  it("kind:slug 형식 노드 ID", () => {
    expect(buildOntologyNodeHref("domain:ontology-core")).toBe(
      `/ontology/?node=${encodeURIComponent("domain:ontology-core")}`,
    );
    expect(buildOntologyNodeHref("project:reactor")).toBe(
      `/ontology/?node=${encodeURIComponent("project:reactor")}`,
    );
  });

  it("특수 문자 / 한글 encodeURIComponent escape", () => {
    expect(buildOntologyNodeHref("project:한글")).toBe(
      `/ontology/?node=${encodeURIComponent("project:한글")}`,
    );
    expect(buildOntologyNodeHref("a/b:c d")).toBe(
      `/ontology/?node=${encodeURIComponent("a/b:c d")}`,
    );
  });

  it("빈 ID 도 그대로 반환 (caller contract)", () => {
    expect(buildOntologyNodeHref("")).toBe("/ontology/?node=");
  });

  it("via 출처 마커를 encode 해 덧붙인다 (insights → map 복귀 칩 계약)", () => {
    expect(
      buildOntologyNodeHref("domain:views", { via: "insights:structure" }),
    ).toBe(
      `/ontology/?node=${encodeURIComponent("domain:views")}&via=${encodeURIComponent("insights:structure")}`,
    );
    // Without `via` the link form is unchanged — the seven-plus other call sites are untouched.
    expect(buildOntologyNodeHref("domain:views")).toBe(
      `/ontology/?node=${encodeURIComponent("domain:views")}`,
    );
  });

  it("검토 행 id도 지도 복귀 문맥으로 함께 보존한다", () => {
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
  it("build ↔ parse 왕복", () => {
    expect(parseInsightsReturnMarker(buildInsightsReturnMarker("do-next"))).toBe(
      "do-next",
    );
    expect(
      parseInsightsReturnMarker(buildInsightsReturnMarker("structure")),
    ).toBe("structure");
  });

  it("마커 문법이 아니면 null — 지도는 칩을 렌더하지 않는다", () => {
    expect(parseInsightsReturnMarker(null)).toBeNull();
    expect(parseInsightsReturnMarker("")).toBeNull();
    expect(parseInsightsReturnMarker("insights")).toBeNull();
    expect(parseInsightsReturnMarker("elsewhere:structure")).toBeNull();
    expect(parseInsightsReturnMarker("insights:UPPER")).toBeNull();
  });

  it("복귀 href 는 원래 보던 인사이트 탭을 가리킨다", () => {
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

  it("vault source slug 를 focus query 로 사용", () => {
    const selected = node({
      id: "capability:mcp-server",
      evidenceIds: ["capabilities/mcp-server"],
    });

    expect(resolveOntologyBuilderNodeSlug(selected)).toBe(
      "capabilities/mcp-server",
    );
  });

  it("ontology/ prefix 가 붙은 evidence slug 를 정규화", () => {
    const selected = node({
      evidenceIds: ["ontology/elements/parser"],
      kind: "element",
    });

    expect(resolveOntologyBuilderNodeSlug(selected)).toBe("elements/parser");
  });

  it("legacy kind:id 노드를 canonical vault folder 로 fallback", () => {
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

  it("slash 기반 vault id 는 그대로 유지", () => {
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
  // URL contract: links sent from the map editor always use canonical `<kind>:<slug>`.
  it("canonical graph id 를 그대로 실어 보낸다", () => {
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

  it("project graph id 도 canonical `project:<slug>` 로 넘긴다", () => {
    expect(resolveOntologyBuilderNodeSlugFromGraphId("project:ontology-atlas")).toBe(
      "ontology-atlas",
    );
    expect(buildTopologyMeaningEditorNodeHref("project:ontology-atlas")).toBe(
      `/topology/?p=${encodeURIComponent("project:ontology-atlas")}&workbench=edit`,
    );
  });

  it("복수-슬래시/ontology-prefix vault 폴더형은 canonical 로 승격해 보낸다", () => {
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

describe("meaningEditRelationForEdgeType (Slice 6 — 지도 엣지 → bearing)", () => {
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

describe("buildTopologyMeaningEditorEdgeHref (Slice 6 — 지도 관계 편집 딥링크)", () => {
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

describe("parseOntologyMeaningEditParam (Slice 6 — 지도 편집기 소비자)", () => {
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
