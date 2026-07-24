import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "../model";
import {
  buildInsightsReturnMarker,
  buildOntologyStudioNodeHrefFromGraphId,
  buildOntologyStudioEdgeHref,
  buildOntologyInsightsNodeHref,
  buildOntologyInsightsReturnHref,
  buildOntologyNodeHref,
  edgeAuthoredByFromNode,
  parseInsightsReturnMarker,
  parseOntologyStudioEditParam,
  resolveOntologyBuilderNodeSlug,
  resolveOntologyBuilderNodeSlugFromGraphId,
  studioEditRelationForEdgeType,
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
    // via 미지정이면 기존 링크 형식 그대로 — 다른 7+ 호출처 무변경.
    expect(buildOntologyNodeHref("domain:views")).toBe(
      `/ontology/?node=${encodeURIComponent("domain:views")}`,
    );
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

describe("buildOntologyStudioNodeHrefFromGraphId", () => {
  // URL 계약: 공방 발신 링크는 canonical `<kind>:<slug>` 로 통일한다.
  it("canonical graph id 를 그대로 실어 보낸다", () => {
    expect(resolveOntologyBuilderNodeSlugFromGraphId("domain:views")).toBe(
      "domains/views",
    );
    expect(
      buildOntologyStudioNodeHrefFromGraphId("capability:topology-analysis-modes"),
    ).toBe(
      `/ontology/studio/?node=${encodeURIComponent(
        "capability:topology-analysis-modes",
      )}`,
    );
  });

  it("project graph id 도 canonical `project:<slug>` 로 넘긴다", () => {
    expect(resolveOntologyBuilderNodeSlugFromGraphId("project:ontology-atlas")).toBe(
      "ontology-atlas",
    );
    expect(buildOntologyStudioNodeHrefFromGraphId("project:ontology-atlas")).toBe(
      `/ontology/studio/?node=${encodeURIComponent("project:ontology-atlas")}`,
    );
  });

  it("복수-슬래시/ontology-prefix vault 폴더형은 canonical 로 승격해 보낸다", () => {
    expect(
      resolveOntologyBuilderNodeSlugFromGraphId(
        "ontology/capabilities/topology-analysis-modes",
      ),
    ).toBe("capabilities/topology-analysis-modes");
    expect(
      buildOntologyStudioNodeHrefFromGraphId("capabilities/topology-analysis-modes"),
    ).toBe(
      `/ontology/studio/?node=${encodeURIComponent(
        "capability:topology-analysis-modes",
      )}`,
    );
  });
});

describe("studioEditRelationForEdgeType (Slice 6 — 지도 엣지 → bearing)", () => {
  it("maps the four editable bearings (+ frontmatter-key aliases)", () => {
    expect(studioEditRelationForEdgeType("is_a")).toBe("isA");
    expect(studioEditRelationForEdgeType("depends_on")).toBe("dependsOn");
    expect(studioEditRelationForEdgeType("dependencies")).toBe("dependsOn");
    expect(studioEditRelationForEdgeType("contains")).toBe("contains");
    expect(studioEditRelationForEdgeType("related_to")).toBe("relates");
    expect(studioEditRelationForEdgeType("relates")).toBe("relates");
    expect(studioEditRelationForEdgeType("uses")).toBe("relates");
    expect(studioEditRelationForEdgeType("implements")).toBe("relates");
  });

  it("returns null for edge types outside the four bearings — no dead action", () => {
    // describes / belongs_to / domain-membership aren't editable in the 공방.
    expect(studioEditRelationForEdgeType("describes")).toBeNull();
    expect(studioEditRelationForEdgeType("belongs_to")).toBeNull();
    expect(studioEditRelationForEdgeType("domain")).toBeNull();
    expect(studioEditRelationForEdgeType("")).toBeNull();
    expect(studioEditRelationForEdgeType("whatever")).toBeNull();
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

describe("buildOntologyStudioEdgeHref (Slice 6 — 공방 엣지 딥링크)", () => {
  it("carries focal (from) + edit=<relation>:<target>, both canonical", () => {
    expect(
      buildOntologyStudioEdgeHref("capability:token-issue", "capability:jwt", "dependsOn"),
    ).toBe(
      `/ontology/studio/?node=${encodeURIComponent("capability:token-issue")}&edit=dependsOn:${encodeURIComponent("capability:jwt")}`,
    );
  });

  it("promotes folder-prefixed ids to canonical <kind>:<slug> like the node variant", () => {
    expect(
      buildOntologyStudioEdgeHref("capabilities/parent", "elements/parser", "contains"),
    ).toBe(
      `/ontology/studio/?node=${encodeURIComponent("capability:parent")}&edit=contains:${encodeURIComponent("element:parser")}`,
    );
  });

  it("emits each relation with a single relation-colon before the encoded target", () => {
    for (const rel of ["isA", "dependsOn", "contains", "relates"] as const) {
      const href = buildOntologyStudioEdgeHref("capability:a", "capability:b", rel);
      // relation colon is literal; the target's own kind:slug colon is encoded.
      expect(href).toContain(`&edit=${rel}:${encodeURIComponent("capability:b")}`);
    }
  });

  it("round-trips through parseOntologyStudioEditParam (first-colon split keeps kind:slug)", () => {
    const href = buildOntologyStudioEdgeHref("capability:a", "capability:b", "isA");
    const raw = new URL(href, "https://x").searchParams.get("edit");
    expect(parseOntologyStudioEditParam(raw)).toEqual({ relation: "isA", targetId: "capability:b" });
  });
});

describe("parseOntologyStudioEditParam (Slice 6 — 공방 소비자)", () => {
  it("splits on the FIRST colon so the target's kind:slug colon survives", () => {
    expect(parseOntologyStudioEditParam("dependsOn:capability:jwt")).toEqual({
      relation: "dependsOn",
      targetId: "capability:jwt",
    });
    expect(parseOntologyStudioEditParam("contains:element:parser")).toEqual({
      relation: "contains",
      targetId: "element:parser",
    });
  });

  it("rejects an unknown relation, malformed, or empty value", () => {
    expect(parseOntologyStudioEditParam("belongsTo:capability:x")).toBeNull();
    expect(parseOntologyStudioEditParam("isA")).toBeNull();
    expect(parseOntologyStudioEditParam(":capability:x")).toBeNull();
    expect(parseOntologyStudioEditParam("relates:")).toBeNull();
    expect(parseOntologyStudioEditParam("")).toBeNull();
    expect(parseOntologyStudioEditParam(null)).toBeNull();
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
