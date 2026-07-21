import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "../model";
import {
  buildInsightsReturnMarker,
  buildOntologyBuilderNodeHref,
  buildOntologyBuilderNodeHrefFromGraphId,
  buildOntologyInsightsNodeHref,
  buildOntologyInsightsReturnHref,
  buildOntologyNodeHref,
  parseInsightsReturnMarker,
  resolveOntologyBuilderNodeSlug,
  resolveOntologyBuilderNodeSlugFromGraphId,
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

describe("buildOntologyBuilderNodeHref", () => {
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

  it("vault source slug 를 builder focus query 로 사용", () => {
    const selected = node({
      id: "capability:mcp-server",
      evidenceIds: ["capabilities/mcp-server"],
    });

    expect(resolveOntologyBuilderNodeSlug(selected)).toBe(
      "capabilities/mcp-server",
    );
    expect(buildOntologyBuilderNodeHref(selected)).toBe(
      `/ontology/edit/?node=${encodeURIComponent("capabilities/mcp-server")}`,
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

describe("buildOntologyBuilderNodeHrefFromGraphId", () => {
  it("topology graph id 를 canonical builder node query 로 변환", () => {
    expect(resolveOntologyBuilderNodeSlugFromGraphId("domain:views")).toBe(
      "domains/views",
    );
    expect(
      buildOntologyBuilderNodeHrefFromGraphId("capability:topology-analysis-modes"),
    ).toBe(
      `/ontology/edit/?node=${encodeURIComponent(
        "capabilities/topology-analysis-modes",
      )}`,
    );
  });

  it("project graph id 는 project frontmatter slug 로 넘긴다", () => {
    expect(resolveOntologyBuilderNodeSlugFromGraphId("project:ontology-atlas")).toBe(
      "ontology-atlas",
    );
    expect(buildOntologyBuilderNodeHrefFromGraphId("project:ontology-atlas")).toBe(
      `/ontology/edit/?node=${encodeURIComponent("ontology-atlas")}`,
    );
  });

  it("이미 vault source slug 이거나 ontology prefix 가 있으면 query 호환 slug 로 정규화", () => {
    expect(
      resolveOntologyBuilderNodeSlugFromGraphId(
        "ontology/capabilities/topology-analysis-modes",
      ),
    ).toBe("capabilities/topology-analysis-modes");
    expect(
      buildOntologyBuilderNodeHrefFromGraphId("capabilities/topology-analysis-modes"),
    ).toBe(
      `/ontology/edit/?node=${encodeURIComponent(
        "capabilities/topology-analysis-modes",
      )}`,
    );
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
